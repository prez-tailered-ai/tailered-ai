import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AccountingInvariantError, ValidationError } from "./errors.js";
import { isNodeError } from "./files.js";

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
 */

export const LOCK_SCHEMA_VERSION = 1;

/** Repository-relative location. Deliberately outside `product/`. */
export const LOCK_RELATIVE_PATH = ".tailered/locks/company-ledger.lock";

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

async function readOwner(lockPath: string): Promise<LockOwner | null> {
  try {
    const raw = await readFile(ownerPath(lockPath), "utf8");
    const parsed = JSON.parse(raw) as LockOwner;
    if (
      typeof parsed?.token !== "string" ||
      typeof parsed?.pid !== "number" ||
      typeof parsed?.host !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    // Missing or unparseable owner metadata. The caller decides; this function never guesses.
    return null;
  }
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
      return { path: lockPath, owner };
    } catch (error) {
      if (!isNodeError(error) || error.code !== "EEXIST") throw error;
    }

    const holder = await readOwner(lockPath);

    if (holder === null) {
      // The directory exists but carries no readable owner. Fail closed rather than assume it
      // is abandoned: a half-written owner file is also what an in-flight acquisition looks
      // like. Only an expired lease plus an unreadable owner justifies reclamation, and that
      // combination is surfaced rather than handled silently.
      if (Date.now() >= deadline) {
        throw new LockOwnershipError(
          `The repository lock at ${LOCK_RELATIVE_PATH} exists with unreadable owner metadata. ` +
            `Refusing to reclaim it. Inspect the directory and remove it only after confirming ` +
            `no run is in progress.`,
        );
      }
      await sleep(pollMs);
      continue;
    }

    if (isProvablyDeadSameHost(holder)) {
      // Reclaim: same host, and the owning process no longer exists.
      await rm(lockPath, { recursive: true, force: true });
      continue;
    }

    if (holder.host !== hostname() && Date.parse(holder.deadline_at) < Date.now()) {
      // Cross-host ownership cannot be probed. An expired foreign lease is quarantined for a
      // human rather than guessed at, because reclaiming a lock held by a live process on
      // another machine would corrupt exactly what the lock protects.
      throw new LockOwnershipError(
        `The repository lock is held by pid ${holder.pid} on host "${holder.host}" and its ` +
          `lease expired at ${holder.deadline_at}. Ownership cannot be verified across hosts, ` +
          `so it is quarantined rather than reclaimed. Confirm that host is not running a ` +
          `Tailered process, then remove ${LOCK_RELATIVE_PATH}.`,
      );
    }

    if (Date.now() >= deadline) {
      throw new LockTimeoutError(
        `Timed out after ${timeoutMs}ms waiting for the repository lock held by pid ` +
          `${holder.pid} on host "${holder.host}" for operation "${holder.operation}"` +
          `${holder.run_id ? ` (run ${holder.run_id})` : ""}.`,
        holder,
      );
    }

    await sleep(pollMs);
  }
}

/** Release a lock this process owns. Releasing a lock owned by someone else is refused. */
export async function releaseCompanyLock(handle: LockHandle): Promise<void> {
  const current = await readOwner(handle.path);
  if (current !== null && current.token !== handle.owner.token) {
    throw new LockOwnershipError(
      `Refusing to release the repository lock: it is now held by pid ${current.pid} on ` +
        `host "${current.host}", not by this process.`,
    );
  }
  await rm(handle.path, { recursive: true, force: true });
}

/**
 * Run `work` inside the repository mutation lock. The lock is always released, including when
 * `work` throws, so a failing ledger write can never strand the repository.
 */
export async function withCompanyLock<T>(
  root: string,
  options: AcquireOptions,
  work: (handle: LockHandle) => Promise<T>,
): Promise<T> {
  const handle = await acquireCompanyLock(root, options);
  try {
    return await work(handle);
  } finally {
    await releaseCompanyLock(handle).catch(() => {
      // A release failure must not mask the original error. The lease deadline and the
      // dead-owner reclaim path both recover this case on the next acquisition.
    });
  }
}

/** Read the current holder, for diagnostics and validation. Never mutates. */
export async function inspectCompanyLock(root: string): Promise<LockOwner | null> {
  return readOwner(lockPathFor(root));
}
