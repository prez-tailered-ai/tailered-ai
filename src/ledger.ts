import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  ADR,
  AgentCallTrace,
  EvalRow,
  GateLabel,
  RouteLog,
  Spec,
} from "./contracts.js";
import { AppendOnlyViolationError } from "./errors.js";
import {
  appendJsonLine,
  isNodeError,
  readJsonLines,
  writeNewFile,
} from "./files.js";
import { barrier } from "./barrier.js";
import { renderAdr, validateAdrForWrite } from "./company.js";
import { withCompanyLock, type LockHandle } from "./lock.js";
import {
  allocateIdentifiers,
  type AllocatedIdentifiers,
  type AllocationRequest,
  type RouteCallPair,
} from "./sequence.js";

/**
 * A conflicting retry: a record with this identifier or run already exists, and it is NOT the
 * record being written. Distinct from an exact retry, which is an idempotent no-op (R3/F2).
 */
export class LedgerIntegrityError extends AppendOnlyViolationError {
  constructor(message: string) {
    super(message);
    this.name = "LedgerIntegrityError";
  }
}

/**
 * Stable JSON, for deciding whether a retry is *exact*.
 *
 * `JSON.stringify` preserves insertion order, so two structurally identical records built by
 * different code paths can serialise differently. Idempotence has to compare meaning, not key
 * order, or an exact retry would be misread as a conflict and halt a recoverable run.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

function sameRecord(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export class CompanyLedger {
  readonly #evalPath: string;
  readonly #labelPath: string;
  readonly #routePath: string;
  readonly #runsPath: string;

  constructor(readonly root: string) {
    this.#evalPath = resolve(root, "evals/ledger.jsonl");
    this.#labelPath = resolve(root, "labels/ledger.jsonl");
    this.#routePath = resolve(root, "evals/routes.jsonl");
    this.#runsPath = resolve(root, "evals/runs");
  }

  async writeSpec(runId: string, spec: Spec): Promise<void> {
    await writeNewFile(
      resolve(this.#runsPath, runId, "spec.json"),
      `${JSON.stringify(spec, null, 2)}\n`,
    );
  }

  contextSnapshotRef(runId: string, repoHash: string): string {
    return `evals/runs/${runId}/contexts/${repoHash}.json`;
  }

  async writeContextSnapshot(
    runId: string,
    repoHash: string,
    snapshot: string,
  ): Promise<string> {
    if (!/^[a-f0-9]{64}$/u.test(repoHash)) {
      throw new AppendOnlyViolationError(
        `Invalid repository context hash: ${repoHash}`,
      );
    }
    const ref = this.contextSnapshotRef(runId, repoHash);
    await writeNewFile(resolve(this.root, ref), snapshot);
    return ref;
  }

  callTraceRef(runId: string, callId: string): string {
    return `evals/runs/${runId}/calls/${callId}.json`;
  }

  async writeCallTrace(trace: AgentCallTrace): Promise<string> {
    const ref = this.callTraceRef(trace.run_id, trace.id);
    await writeNewFile(
      resolve(this.root, ref),
      `${JSON.stringify(trace, null, 2)}\n`,
    );
    return ref;
  }

  async evals(): Promise<EvalRow[]> {
    return readJsonLines<EvalRow>(this.#evalPath);
  }

  async labels(): Promise<GateLabel[]> {
    return readJsonLines<GateLabel>(this.#labelPath);
  }

  async routes(): Promise<RouteLog[]> {
    return readJsonLines<RouteLog>(this.#routePath);
  }

  /**
   * Run `work` inside the repository mutation lock, with a transaction object that is the ONLY
   * way to allocate identifiers or append canonical rows.
   *
   * F1: allocation, uniqueness verification, append, and durable settlement all happen between
   * one acquire and one release. Splitting them is what produced the original race — two
   * writers derived the same identifier from the same row count and one of them lost.
   */
  async transact<T>(
    options: { operation: string; runId?: string | null; timeoutMs?: number },
    work: (tx: LedgerTransaction) => Promise<T>,
  ): Promise<T> {
    return withCompanyLock(
      this.root,
      {
        operation: options.operation,
        runId: options.runId ?? null,
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      },
      async (handle) => work(new LedgerTransaction(this, handle)),
    );
  }

  /** @internal — reached through {@link LedgerTransaction}, which proves the lock is held. */
  get paths(): { evals: string; labels: string; routes: string; runs: string } {
    return {
      evals: this.#evalPath,
      labels: this.#labelPath,
      routes: this.#routePath,
      runs: this.#runsPath,
    };
  }
}

/**
 * The lock-scoped surface. Every method assumes — and every allocation re-proves — that the
 * repository lock is held. There is no way to obtain one except through
 * {@link CompanyLedger.transact}.
 */
export class LedgerTransaction {
  constructor(
    private readonly ledger: CompanyLedger,
    readonly handle: LockHandle,
  ) {}

  async allocate(request: AllocationRequest): Promise<AllocatedIdentifiers> {
    return allocateIdentifiers(this.handle, request);
  }

  async allocateRouteCall(): Promise<RouteCallPair> {
    const issued = await allocateIdentifiers(this.handle, { ROUTE_CALL: 1 });
    const pair = issued.ROUTE_CALL[0];
    if (pair === undefined) {
      throw new LedgerIntegrityError("The allocator returned no route/call pair.");
    }
    return pair;
  }

  /**
   * Append a row, unless it is already there.
   *
   * Three outcomes, and the distinction between the last two is R3:
   *   - absent            -> appended
   *   - present, IDENTICAL -> no-op, so an interrupted run can be replayed safely
   *   - present, DIFFERENT -> LedgerIntegrityError, never a duplicate row
   */
  async #appendUnique<T>(options: {
    path: string;
    row: T;
    kind: string;
    matches: (candidate: T) => boolean;
    describeConflict: (existing: T) => string;
  }): Promise<"appended" | "already-present"> {
    const existing = await readJsonLines<T>(options.path);
    const collision = existing.find(options.matches);
    if (collision !== undefined) {
      if (sameRecord(collision, options.row)) return "already-present";
      throw new LedgerIntegrityError(options.describeConflict(collision));
    }

    await barrier("append:after-uniqueness", options.kind);

    // Re-read after the barrier. Under the lock nothing can have changed, so this is a cheap
    // assertion that the lock actually held rather than an attempt to make an unlocked append
    // safe — R3 forbids relying on a read another process can invalidate.
    const recheck = await readJsonLines<T>(options.path);
    const late = recheck.find(options.matches);
    if (late !== undefined) {
      if (sameRecord(late, options.row)) return "already-present";
      throw new LedgerIntegrityError(
        `${options.describeConflict(late)} It appeared while the repository lock was held, ` +
          `which means mutual exclusion was violated.`,
      );
    }

    await appendJsonLine(options.path, options.row);
    return "appended";
  }

  async appendRouteLog(log: RouteLog): Promise<"appended" | "already-present"> {
    return this.#appendUnique({
      path: this.ledger.paths.routes,
      row: log,
      kind: "route",
      matches: (candidate) => candidate.id === log.id,
      describeConflict: () => `Route log ${log.id} already exists with different content.`,
    });
  }

  async appendGateLabel(label: GateLabel): Promise<"appended" | "already-present"> {
    return this.#appendUnique({
      path: this.ledger.paths.labels,
      row: label,
      kind: "label",
      matches: (candidate) => candidate.id === label.id || candidate.run_id === label.run_id,
      describeConflict: (existing) =>
        `A different gate label (${existing.id}) already exists for ${label.run_id}.`,
    });
  }

  async appendTerminalEval(row: EvalRow): Promise<"appended" | "already-present"> {
    return this.#appendUnique({
      path: this.ledger.paths.evals,
      row,
      kind: "eval",
      matches: (candidate) => candidate.id === row.id || candidate.run_id === row.run_id,
      describeConflict: (existing) =>
        `A different terminal eval (${existing.id}) already exists for ${row.run_id}. ` +
          `Exactly one terminal row per run is a constitutional invariant.`,
    });
  }

  /**
   * Allocate an ADR identifier and create the file, inside the held lock.
   *
   * The identifier comes from the allocator rather than from `readdir` + max + 1, so it cannot
   * be derived twice from the same directory listing. Creation stays `wx`, so even if the
   * allocator were wrong the filesystem still refuses to overwrite an accepted decision (F3).
   */
  async appendAdr(input: Omit<ADR, "id">): Promise<{ adr: ADR; created: boolean }> {
    const issued = await allocateIdentifiers(this.handle, { ADR: 1 });
    const id = issued.ADR[0];
    if (id === undefined) {
      throw new LedgerIntegrityError("The allocator returned no ADR identifier.");
    }

    const adr: ADR = { ...input, id };
    if (adr.supersedes && !adr.caused_by.includes(adr.supersedes)) {
      adr.caused_by = [...adr.caused_by, adr.supersedes];
    }
    validateAdrForWrite(adr);

    const path = resolve(this.ledger.root, "decisions", `${adr.id}.md`);
    const rendered = renderAdr(adr);

    await barrier("adr:before-create", adr.id);

    try {
      await writeNewFile(path, rendered);
      return { adr, created: true };
    } catch (error) {
      if (!isNodeError(error) || error.code !== "EEXIST") throw error;
      // An exact retry of an interrupted run re-creates the same decision; that is idempotent.
      // Anything else is an attempt to rewrite an accepted ADR, which never happens.
      const onDisk = await readFile(path, "utf8");
      if (onDisk === rendered) return { adr, created: false };
      throw new LedgerIntegrityError(
        `${adr.id} already exists with different content. Accepted ADRs are never edited.`,
      );
    }
  }
}
