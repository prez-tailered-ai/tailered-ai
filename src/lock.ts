import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AccountingInvariantError, ValidationError } from "./errors.js";
import { appendJsonLine, isNodeError, readJsonLines } from "./files.js";

/**
 * One repository mutation lock.
 *
 * Ledger identifier allocation and the appends that consume those identifiers must happen
 * inside one critical section, or two processes read the same state and allocate the same id.
 * That defect is reproduced at `docs/foundation/p0-agent-safety/p0-b/evidence/A6-prefix-n10.json`,
 * where ten concurrent runs produced `Duplicate route log id: ROUTE-000006` and a validator
 * exit code of 1.
 *
 * The lock is a directory. `mkdir` without `recursive` is atomic on every supported platform:
 * exactly one caller creates it and every other caller receives `EEXIST`. No dependency, no
 * database, and nothing inside `product/` — an agent authorized to write the product subtree
 * can neither observe nor corrupt it.
 *
 * Every failure path in this module fails closed. Release is not best-effort: a lock that
 * cannot be proven released is an integrity incident, recorded durably and raised to the
 * caller, because a silently swallowed release failure is the same false-success shape this
 * scope exists to remove.
 */

export const LOCK_SCHEMA_VERSION = 1;

/** Repository-relative location. Deliberately outside `product/`. */
export const LOCK_RELATIVE_PATH = ".tailered/locks/company-ledger.lock";

/** Append-only integrity incidents. Read by `validate`; never rewritten. */
export const INCIDENTS_RELATIVE_PATH = ".tailered/incidents.jsonl";

export interface LockOwner {
  schema_version: number;
  token: string;
  pid: number;
  host: string;
  acquired_at: string;
  deadline_at: string;
  operation: string;
  run_id: string | null;
}

export interface LockHandle {
  /** The repository this lock governs. Carried on the handle so a lock-scoped API needs no root. */
  readonly root: string;
  readonly path: string;
  readonly owner: LockOwner;
}

export class LockTimeoutError extends ValidationError {
  constructor(message: string, readonly holder: LockOwner | null) {
    super(message);
    this.name = "LockTimeoutError";
  }
}

export class LockOwnershipError extends AccountingInvariantError {
  constructor(message: string) {
    super(message);
    this.name = "LockOwnershipError";
  }
}

export interface IntegrityIncident {
  schema_version: number;
  kind: "lock_release_failed";
  at: string;
  pid: number;
  host: string;
  lock_token: string;
  operation: string;
  run_id: string | null;
  /** True when the protected work also failed, so the two failures are never conflated. */
  work_failed: boolean;
  detail: string;
}

export interface AcquireOptions {
  /** Total time to wait for a held lock before failing. */
  timeoutMs?: number;
  /** How long this owner may hold the lock before it is considered expired. */
  leaseMs?: number;
  /** Recorded in the owner file so a stuck lock names the work that took it. */
  operation?: string;
  runId?: string | null;
  /** Test seam: poll interval. */
  pollMs?: number;
}

const DEFAULTS = {
  timeoutMs: 30_000,
  leaseMs: 120_000,
  pollMs: 25,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function ownerPath(lockPath: string): string {
  return resolve(lockPath, "owner.json");
}

/**
 * Reading owner metadata has three distinct outcomes and they are never collapsed.
 *
 * `absent` and `unreadable` mean opposite things to a release: a lock whose owner file has been
 * deleted has lost its mutual-exclusion proof, and a lock whose owner file is corrupt has lost
 * it differently. Both are failures, but a caller that cannot tell them apart cannot report
 * honestly, and the acquire path needs the distinction to decide whether to keep waiting.
 */
type OwnerRead =
  | { kind: "owner"; owner: LockOwner }
  | { kind: "absent" }
  | { kind: "unreadable"; reason: string };

async function readOwner(lockPath: string): Promise<OwnerRead> {
  let raw: string;
  try {
    raw = await readFile(ownerPath(lockPath), "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return { kind: "absent" };
    return {
      kind: "unreadable",
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      kind: "unreadable",
      reason: `owner.json is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  const candidate = parsed as Partial<LockOwner> | null;
  if (
    candidate === null ||
    typeof candidate !== "object" ||
    typeof candidate.token !== "string" ||
    typeof candidate.pid !== "number" ||
    typeof candidate.host !== "string"
  ) {
    return { kind: "unreadable", reason: "owner.json is missing token, pid, or host" };
  }
  return { kind: "owner", owner: candidate as LockOwner };
}

/**
 * A lock is reclaimable only when its owner is *proven* dead on *this* host.
 *
 * Age alone is never sufficient. A slow run is indistinguishable from a dead one by clock
 * reading, and stealing a live owner's lock would reintroduce exactly the concurrent-mutation
 * defect the lock exists to prevent.
 */
function isProvablyDeadSameHost(owner: LockOwner): boolean {
  if (owner.host !== hostname()) return false;
  if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) return false;
  try {
    // Signal 0 performs the permission and existence check without delivering a signal.
    process.kill(owner.pid, 0);
    return false; // still alive
  } catch (error) {
    if (isNodeError(error) && error.code === "ESRCH") return true; // no such process
    // EPERM means the process exists under another user. Existing is enough to refuse.
    return false;
  }
}

export function lockPathFor(root: string): string {
  return resolve(root, LOCK_RELATIVE_PATH);
}

export function incidentsPathFor(root: string): string {
  return resolve(root, INCIDENTS_RELATIVE_PATH);
}

/**
 * Acquire the repository mutation lock, or fail with a typed error. Never steals a live lock.
 */
export async function acquireCompanyLock(
  root: string,
  options: AcquireOptions = {},
): Promise<LockHandle> {
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
  const leaseMs = options.leaseMs ?? DEFAULTS.leaseMs;
  const pollMs = options.pollMs ?? DEFAULTS.pollMs;
  const lockPath = lockPathFor(root);
  const deadline = Date.now() + timeoutMs;

  await mkdir(resolve(lockPath, ".."), { recursive: true });

  for (;;) {
    const owner: LockOwner = {
      schema_version: LOCK_SCHEMA_VERSION,
      token: randomUUID(),
      pid: process.pid,
      host: hostname(),
      acquired_at: new Date().toISOString(),
      deadline_at: new Date(Date.now() + leaseMs).toISOString(),
      operation: options.operation ?? "ledger-mutation",
      run_id: options.runId ?? null,
    };

    try {
      // Atomic: exactly one caller wins, everyone else gets EEXIST.
      await mkdir(lockPath);
      await writeFile(ownerPath(lockPath), `${JSON.stringify(owner, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
      });
      return { root, path: lockPath, owner };
    } catch (error) {
      if (!isNodeError(error) || error.code !== "EEXIST") throw error;
    }

    const holder = await readOwner(lockPath);

    if (holder.kind !== "owner") {
      // The directory exists but carries no usable owner. Fail closed rather than assume it is
      // abandoned: a half-written owner file is also what an in-flight acquisition looks like.
      // Waiting resolves the in-flight case; the timeout surfaces the genuinely broken one.
      if (Date.now() >= deadline) {
        const detail =
          holder.kind === "absent"
            ? "the owner file is missing"
            : `the owner file is unreadable (${holder.reason})`;
        throw new LockOwnershipError(
          `The repository lock at ${LOCK_RELATIVE_PATH} exists but ${detail}. Refusing to ` +
            `reclaim it. Inspect the directory and remove it only after confirming no run is ` +
            `in progress.`,
        );
      }
      await sleep(pollMs);
      continue;
    }

    if (isProvablyDeadSameHost(holder.owner)) {
      // Reclaim: same host, and the owning process no longer exists.
      await rm(lockPath, { recursive: true, force: true });
      continue;
    }

    if (
      holder.owner.host !== hostname() &&
      Date.parse(holder.owner.deadline_at) < Date.now()
    ) {
      // Cross-host ownership cannot be probed. An expired foreign lease is quarantined for a
      // human rather than guessed at, because reclaiming a lock held by a live process on
      // another machine would corrupt exactly what the lock protects.
      throw new LockOwnershipError(
        `The repository lock is held by pid ${holder.owner.pid} on host ` +
          `"${holder.owner.host}" and its lease expired at ${holder.owner.deadline_at}. ` +
          `Ownership cannot be verified across hosts, so it is quarantined rather than ` +
          `reclaimed. Confirm that host is not running a Tailered process, then remove ` +
          `${LOCK_RELATIVE_PATH}.`,
      );
    }

    if (Date.now() >= deadline) {
      throw new LockTimeoutError(
        `Timed out after ${timeoutMs}ms waiting for the repository lock held by pid ` +
          `${holder.owner.pid} on host "${holder.owner.host}" for operation ` +
          `"${holder.owner.operation}"` +
          `${holder.owner.run_id ? ` (run ${holder.owner.run_id})` : ""}.`,
        holder.owner,
      );
    }

    await sleep(pollMs);
  }
}

/**
 * Prove this process still holds the lock described by `handle`.
 *
 * Every canonical mutation calls this before touching state. A comment asserting that the
 * caller holds the lock is not an enforcement mechanism: the check has to read the owner file
 * and compare tokens, because that is the only evidence that mutual exclusion still holds.
 */
export async function assertLockHeld(handle: LockHandle): Promise<void> {
  const current = await readOwner(handle.path);
  if (current.kind === "absent") {
    throw new LockOwnershipError(
      `The repository lock is no longer present, so mutual exclusion cannot be proven for ` +
        `operation "${handle.owner.operation}". Refusing to mutate canonical state.`,
    );
  }
  if (current.kind === "unreadable") {
    throw new LockOwnershipError(
      `The repository lock owner metadata is unreadable (${current.reason}), so mutual ` +
        `exclusion cannot be proven for operation "${handle.owner.operation}". Refusing to ` +
        `mutate canonical state.`,
    );
  }
  if (current.owner.token !== handle.owner.token) {
    throw new LockOwnershipError(
      `The repository lock is now held by pid ${current.owner.pid} on host ` +
        `"${current.owner.host}", not by this process. Refusing to mutate canonical state.`,
    );
  }
}

/**
 * Release a lock this process owns.
 *
 * Requires readable owner metadata and an exact token match. Missing or malformed metadata is
 * a `LockOwnershipError`, not a reason to delete the directory: if the owner file is gone, this
 * process can no longer prove the directory is its own lock, and removing it could release
 * somebody else's.
 */
export async function releaseCompanyLock(handle: LockHandle): Promise<void> {
  await assertLockHeld(handle);
  await rm(handle.path, { recursive: true, force: true });
}

/** Record an integrity incident durably. Append-only, fsynced, read by `validate`. */
export async function recordIntegrityIncident(
  root: string,
  incident: IntegrityIncident,
): Promise<void> {
  await appendJsonLine(incidentsPathFor(root), incident);
}

/** Read recorded integrity incidents. Never mutates. */
export async function readIntegrityIncidents(root: string): Promise<IntegrityIncident[]> {
  return readJsonLines<IntegrityIncident>(incidentsPathFor(root));
}

/**
 * Run `work` inside the repository mutation lock.
 *
 * Three outcomes, all reported honestly:
 *
 *   - work succeeds, release succeeds  -> the result
 *   - work fails,    release succeeds  -> the work error
 *   - release fails (either case)      -> an incident is recorded, and the caller is failed
 *
 * The last case used to be swallowed. It cannot be: if release fails after successful work,
 * the repository is left locked or of ambiguous ownership, later operations block or fail, and
 * returning success would report a state that does not exist. When both fail, both errors are
 * carried on an `AggregateError` so neither is lost to the other.
 */
export async function withCompanyLock<T>(
  root: string,
  options: AcquireOptions,
  work: (handle: LockHandle) => Promise<T>,
): Promise<T> {
  const handle = await acquireCompanyLock(root, options);

  let workFailure: { error: unknown } | null = null;
  let result: T | undefined;
  try {
    result = await work(handle);
  } catch (error) {
    workFailure = { error };
  }

  let releaseFailure: { error: unknown } | null = null;
  try {
    await releaseCompanyLock(handle);
  } catch (error) {
    releaseFailure = { error };
    const detail = error instanceof Error ? error.message : String(error);
    try {
      await recordIntegrityIncident(root, {
        schema_version: 1,
        kind: "lock_release_failed",
        at: new Date().toISOString(),
        pid: process.pid,
        host: hostname(),
        lock_token: handle.owner.token,
        operation: handle.owner.operation,
        run_id: handle.owner.run_id,
        work_failed: workFailure !== null,
        detail,
      });
    } catch {
      // The incident write is best effort by necessity — the same filesystem fault that broke
      // release can break this. The error below is still raised, so the failure is never lost;
      // only its durable trace is.
    }
  }

  if (workFailure !== null && releaseFailure !== null) {
    throw new AggregateError(
      [workFailure.error, releaseFailure.error],
      `The locked operation "${handle.owner.operation}" failed, and releasing the repository ` +
        `lock afterwards also failed. Both errors are attached. The repository may still be ` +
        `locked; see ${INCIDENTS_RELATIVE_PATH}.`,
    );
  }
  if (workFailure !== null) throw workFailure.error;
  if (releaseFailure !== null) throw releaseFailure.error;
  return result as T;
}

/**
 * Read the current holder, for diagnostics and validation. Never mutates.
 *
 * Returns `null` when no lock is held. A lock that exists but cannot be read is reported as a
 * `LockOwnershipError` rather than as "no lock", because those are not the same state.
 */
export async function inspectCompanyLock(root: string): Promise<LockOwner | null> {
  const lockPath = lockPathFor(root);
  const current = await readOwner(lockPath);
  if (current.kind === "owner") return current.owner;
  if (current.kind === "absent") return null;
  throw new LockOwnershipError(
    `The repository lock at ${LOCK_RELATIVE_PATH} exists but its owner metadata is unreadable ` +
      `(${current.reason}).`,
  );
}
