import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { AccountingInvariantError } from "./errors.js";
import { isNodeError, readJsonLines, writeAtomic, writeNewFile } from "./files.js";
import { assertLockHeld, type LockHandle } from "./lock.js";
import { barrier } from "./barrier.js";
import { readAdrs } from "./company.js";
import type { EvalRow, GateLabel, RouteLog } from "./contracts.js";

/**
 * Durable identifier allocation.
 *
 * The pre-fix allocator computed `rows.length + 1` and then appended separately
 * (`src/ledger.ts` `nextRouteId`/`nextEvalId`/`nextLabelId`). Two processes read the same
 * length and allocated the same identifier. Reproduced at N=2, N=3 and N=10 in
 * `docs/foundation/p0-agent-safety/p0-b/evidence/`.
 *
 * This allocator persists the increment *before* returning an identifier, and every mutation
 * requires a proven-held repository lock. Identifiers are therefore never reused, may
 * legitimately contain gaps after a crash, and never move backward.
 *
 * Every read failure fails closed. `ENOENT` on a repository that has never allocated is the
 * only absence this module treats as "nothing here yet"; malformed JSON, a permission error, a
 * schema mismatch, or an impossible counter all refuse to continue. Rebuilding allocator state
 * from canonical files happens exactly once, is recorded as a migration, and never repeats —
 * a silent rebuild would be free to reissue an identifier that a crashed run had already been
 * handed.
 */

export const SEQUENCE_SCHEMA_VERSION = 2;

/** Repository-relative location. Committed state, outside `product/`. */
export const SEQUENCE_RELATIVE_PATH = ".tailered/ledger-sequence.json";

/**
 * Written once, before the sequence file itself, and never removed.
 *
 * Its only job is to answer one question that the sequence file cannot answer about its own
 * absence: has this repository ever had an allocator? Without it, a deleted sequence file is
 * indistinguishable from a repository that predates P0-B, and the allocator would rebuild
 * itself silently every time state was lost.
 */
export const SEQUENCE_BOOTSTRAP_RELATIVE_PATH = ".tailered/ledger-sequence.bootstrap.json";

/**
 * `ROUTE_CALL` is one family, not two.
 *
 * `src/ship.ts` derives the call identifier from the route identifier by prefix substitution,
 * so `CALL-000042` has always been the partner of `ROUTE-000042`. Two independent counters
 * would drift the moment either family allocated alone, silently breaking every trace
 * relationship that assumes the pairing. One reservation yields both identifiers.
 */
export type SequenceFamily = "ROUTE_CALL" | "LABEL" | "EVAL" | "ADR";

export const SEQUENCE_FAMILIES: readonly SequenceFamily[] = [
  "ROUTE_CALL",
  "LABEL",
  "EVAL",
  "ADR",
];

export type IdentifierPrefix = "ROUTE" | "CALL" | "LABEL" | "EVAL" | "ADR";

/**
 * ADR identifiers are three digits on disk (`decisions/ADR-000.md`) and every other ledger
 * identifier is six. Formatting them all the same way would mint `ADR-000004` for a repository
 * whose ADRs are `ADR-000` through `ADR-003`.
 */
const IDENTIFIER_WIDTH: Record<IdentifierPrefix, number> = {
  ROUTE: 6,
  CALL: 6,
  LABEL: 6,
  EVAL: 6,
  ADR: 3,
};

export function formatIdentifier(prefix: IdentifierPrefix, value: number): string {
  return `${prefix}-${String(value).padStart(IDENTIFIER_WIDTH[prefix], "0")}`;
}

export interface SequenceRepair {
  at: string;
  family: SequenceFamily;
  from: number;
  to: number;
  reason: string;
}

export interface SequenceState {
  schema_version: number;
  updated_at: string;
  /** Highest identifier ISSUED per family. Monotonic. Gaps are legal; reuse is not. */
  issued: Record<SequenceFamily, number>;
  /** Recorded whenever the allocator was bootstrapped or repaired from canonical state. */
  repairs: SequenceRepair[];
}

export interface SequenceBootstrapRecord {
  schema_version: number;
  bootstrapped_at: string;
  /** Canonical maxima observed at bootstrap. Diagnostic; not a recovery source. */
  canonical_at_bootstrap: Record<SequenceFamily, number>;
  note: string;
}

/** Every fail-closed allocator refusal. `reason` names the failure class, never a guess. */
export class SequenceStateError extends AccountingInvariantError {
  constructor(
    message: string,
    readonly reason:
      | "unreadable"
      | "malformed"
      | "schema"
      | "counter"
      | "missing_after_bootstrap",
  ) {
    super(message);
    this.name = "SequenceStateError";
  }
}

export function sequencePathFor(root: string): string {
  return resolve(root, SEQUENCE_RELATIVE_PATH);
}

export function sequenceBootstrapPathFor(root: string): string {
  return resolve(root, SEQUENCE_BOOTSTRAP_RELATIVE_PATH);
}

function zeroCounters(): Record<SequenceFamily, number> {
  return { ROUTE_CALL: 0, LABEL: 0, EVAL: 0, ADR: 0 };
}

function parseSequenceNumber(id: unknown, prefix: IdentifierPrefix): number {
  if (typeof id !== "string") return 0;
  const match = new RegExp(`^${prefix}-(\\d{3,})$`, "u").exec(id);
  return match ? Number(match[1]) : 0;
}

const highest = (values: number[]): number => values.reduce((a, b) => (b > a ? b : a), 0);

/**
 * ADRs live as files, so their directory may legitimately not exist yet on a fresh fixture.
 * That single `ENOENT` is the only ADR read failure treated as absence — a malformed ADR, an
 * unreadable file, or a permission error propagates, because an empty ADR set derived from a
 * broken read would let the allocator reissue an identifier a real ADR already holds.
 */
async function readAdrsAllowingAbsentDirectory(
  root: string,
): Promise<Array<{ id: string }>> {
  try {
    await readdir(resolve(root, "decisions"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  }
  return readAdrs(root);
}

/**
 * Identifiers reserved by a run that has started but not yet appended its canonical rows.
 *
 * A run writes its start record before it can spend anything (`evals/runs/<run-id>/started.json`,
 * introduced by P0B-12), so a reserved identifier is durable from the moment it is handed out.
 * Including these in the canonical maxima is what makes a rebuild safe: without them, a rebuild
 * that happened while a run was in flight could reissue that run's identifiers.
 *
 * Until P0B-12 lands there are no start records to read and this returns nothing. That is the
 * honest current state, and it is the residual gap recorded in the P0-B risk ledger.
 */
async function readReservedIdentifiers(root: string): Promise<Record<SequenceFamily, number>> {
  const runsRoot = resolve(root, "evals/runs");
  let runDirectories: string[];
  try {
    runDirectories = (await readdir(runsRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return zeroCounters();
    throw error;
  }

  const reserved = zeroCounters();
  for (const runDirectory of runDirectories) {
    let raw: string;
    try {
      raw = await readFile(resolve(runsRoot, runDirectory, "started.json"), "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") continue;
      throw error;
    }
    let record: { route_id?: unknown; call_id?: unknown; eval_id?: unknown; label_id?: unknown };
    try {
      record = JSON.parse(raw) as typeof record;
    } catch (error) {
      throw new SequenceStateError(
        `evals/runs/${runDirectory}/started.json is not valid JSON, so its reserved ` +
          `identifiers cannot be honoured: ${
            error instanceof Error ? error.message : String(error)
          }`,
        "malformed",
      );
    }
    reserved.ROUTE_CALL = highest([
      reserved.ROUTE_CALL,
      parseSequenceNumber(record.route_id, "ROUTE"),
      parseSequenceNumber(record.call_id, "CALL"),
    ]);
    reserved.EVAL = highest([reserved.EVAL, parseSequenceNumber(record.eval_id, "EVAL")]);
    reserved.LABEL = highest([reserved.LABEL, parseSequenceNumber(record.label_id, "LABEL")]);
  }
  return reserved;
}

/**
 * Derive the highest identifier already present in, or reserved against, canonical state.
 *
 * Canonical files are the source of truth for what has been *consumed*; run start records are
 * the source of truth for what has been *reserved*. The allocator is never allowed to hand out
 * an identifier that either of them already holds.
 */
export async function deriveCanonicalMaxima(
  root: string,
): Promise<Record<SequenceFamily, number>> {
  const [routes, evals, labels, adrs, reserved] = await Promise.all([
    readJsonLines<RouteLog>(resolve(root, "evals/routes.jsonl")),
    readJsonLines<EvalRow>(resolve(root, "evals/ledger.jsonl")),
    readJsonLines<GateLabel>(resolve(root, "labels/ledger.jsonl")),
    readAdrsAllowingAbsentDirectory(root),
    readReservedIdentifiers(root),
  ]);

  return {
    // One counter covers both halves of the pair. Legacy rows whose ROUTE and CALL numbers
    // disagree resolve to the higher of the two, so neither half can ever be reissued.
    ROUTE_CALL: highest([
      ...routes.map((r) => parseSequenceNumber(r.id, "ROUTE")),
      ...routes.map((r) => parseSequenceNumber(r.call_id, "CALL")),
      reserved.ROUTE_CALL,
    ]),
    LABEL: highest([...labels.map((r) => parseSequenceNumber(r.id, "LABEL")), reserved.LABEL]),
    EVAL: highest([...evals.map((r) => parseSequenceNumber(r.id, "EVAL")), reserved.EVAL]),
    ADR: highest(adrs.map((a) => parseSequenceNumber(a.id, "ADR"))),
  };
}

/** `null` means the file is absent. Every other failure throws. */
async function loadSequenceState(root: string): Promise<SequenceState | null> {
  let raw: string;
  try {
    raw = await readFile(sequencePathFor(root), "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return null;
    throw new SequenceStateError(
      `${SEQUENCE_RELATIVE_PATH} could not be read, so identifier allocation cannot be proven ` +
        `safe: ${error instanceof Error ? error.message : String(error)}`,
      "unreadable",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new SequenceStateError(
      `${SEQUENCE_RELATIVE_PATH} is not valid JSON. Refusing to allocate identifiers from ` +
        `unreadable state: ${error instanceof Error ? error.message : String(error)}`,
      "malformed",
    );
  }

  const candidate = parsed as Partial<SequenceState> | null;
  if (
    candidate === null ||
    typeof candidate !== "object" ||
    candidate.schema_version !== SEQUENCE_SCHEMA_VERSION ||
    typeof candidate.issued !== "object" ||
    candidate.issued === null
  ) {
    throw new SequenceStateError(
      `${SEQUENCE_RELATIVE_PATH} does not match allocator schema version ` +
        `${SEQUENCE_SCHEMA_VERSION}. Refusing to allocate identifiers from state this build ` +
        `cannot interpret.`,
      "schema",
    );
  }

  const issued = zeroCounters();
  for (const family of SEQUENCE_FAMILIES) {
    const value = (candidate.issued as Record<string, unknown>)[family];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      throw new SequenceStateError(
        `${SEQUENCE_RELATIVE_PATH} holds an impossible counter for ${family}: ` +
          `${String(value)}. Refusing to allocate identifiers from corrupt state.`,
        "counter",
      );
    }
    issued[family] = value;
  }

  return {
    schema_version: SEQUENCE_SCHEMA_VERSION,
    updated_at: typeof candidate.updated_at === "string" ? candidate.updated_at : "",
    issued,
    repairs: Array.isArray(candidate.repairs) ? candidate.repairs : [],
  };
}

/** `null` means this repository has never bootstrapped an allocator. Every other failure throws. */
async function loadBootstrapRecord(root: string): Promise<SequenceBootstrapRecord | null> {
  let raw: string;
  try {
    raw = await readFile(sequenceBootstrapPathFor(root), "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return null;
    throw new SequenceStateError(
      `${SEQUENCE_BOOTSTRAP_RELATIVE_PATH} could not be read, so it is impossible to tell ` +
        `whether this repository has already bootstrapped its allocator: ${
          error instanceof Error ? error.message : String(error)
        }`,
      "unreadable",
    );
  }
  try {
    return JSON.parse(raw) as SequenceBootstrapRecord;
  } catch (error) {
    throw new SequenceStateError(
      `${SEQUENCE_BOOTSTRAP_RELATIVE_PATH} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "malformed",
    );
  }
}

async function writeSequenceState(root: string, state: SequenceState): Promise<void> {
  await writeAtomic(sequencePathFor(root), `${JSON.stringify(state, null, 2)}\n`);
}

/**
 * Load allocator state, bootstrapping exactly once for a repository that predates P0-B.
 *
 * The bootstrap marker is written *before* the state file, so the marker can never be missing
 * while the state exists. An interrupted bootstrap therefore leaves marker-without-state, which
 * this function reports as an integrity failure rather than repairing — a repository that has
 * demonstrably allocated before must not silently rebuild its counters from canonical files.
 */
async function loadOrBootstrapState(root: string): Promise<SequenceState> {
  const existing = await loadSequenceState(root);
  if (existing !== null) return existing;

  const bootstrap = await loadBootstrapRecord(root);
  if (bootstrap !== null) {
    throw new SequenceStateError(
      `${SEQUENCE_RELATIVE_PATH} is missing, but this repository bootstrapped its allocator ` +
        `at ${bootstrap.bootstrapped_at}. Allocator state has been lost. Refusing to rebuild ` +
        `it automatically, because a rebuild can reissue an identifier that an in-flight run ` +
        `already holds. Run \`tailered recover\` to repair this deliberately.`,
      "missing_after_bootstrap",
    );
  }

  const canonical = await deriveCanonicalMaxima(root);
  const now = new Date().toISOString();

  await writeNewFile(
    sequenceBootstrapPathFor(root),
    `${JSON.stringify(
      {
        schema_version: SEQUENCE_SCHEMA_VERSION,
        bootstrapped_at: now,
        canonical_at_bootstrap: canonical,
        note:
          "Written before the sequence state file, once, for a repository that predates P0-B. " +
          "Its absence is the only proof that a missing sequence file means 'never allocated' " +
          "rather than 'state lost'. Never delete this file.",
      } satisfies SequenceBootstrapRecord,
      null,
      2,
    )}\n`,
  );

  const state: SequenceState = {
    schema_version: SEQUENCE_SCHEMA_VERSION,
    updated_at: now,
    issued: canonical,
    repairs: SEQUENCE_FAMILIES.filter((family) => canonical[family] > 0).map((family) => ({
      at: now,
      family,
      from: 0,
      to: canonical[family],
      reason: "bootstrap: allocator initialised from canonical state for a pre-P0-B repository",
    })),
  };
  await writeSequenceState(root, state);
  return state;
}

/**
 * Reconcile allocator state against canonical files, repairing upward only.
 *
 * Repairing downward would reissue an identifier that already exists on disk, so a counter
 * that is somehow ahead of canonical state is left alone — gaps are harmless, reuse is not.
 */
function reconcile(
  state: SequenceState,
  canonical: Record<SequenceFamily, number>,
  reason: string,
): SequenceState {
  for (const family of SEQUENCE_FAMILIES) {
    const known = canonical[family];
    if (known > state.issued[family]) {
      state.repairs.push({
        at: new Date().toISOString(),
        family,
        from: state.issued[family],
        to: known,
        reason,
      });
      state.issued[family] = known;
    }
  }
  return state;
}

export interface RouteCallPair {
  sequence: number;
  route_id: string;
  call_id: string;
}

export interface AllocatedIdentifiers {
  ROUTE_CALL: RouteCallPair[];
  LABEL: string[];
  EVAL: string[];
  ADR: string[];
}

export type AllocationRequest = Partial<Record<SequenceFamily, number>>;

/**
 * Allocate identifiers and persist the increment BEFORE returning them.
 *
 * Takes a `LockHandle` rather than a repository root, and proves that lock is still held before
 * touching state. That is the enforcement: there is no signature by which a caller can allocate
 * without having acquired the lock, and a handle whose lock was lost or stolen is rejected at
 * the moment of use rather than trusted from when it was minted.
 */
export async function allocateIdentifiers(
  handle: LockHandle,
  request: AllocationRequest,
): Promise<AllocatedIdentifiers> {
  await assertLockHeld(handle);
  const root = handle.root;

  const state = await loadOrBootstrapState(root);
  const canonical = await deriveCanonicalMaxima(root);
  reconcile(state, canonical, "canonical state was ahead of the allocator");

  // The exact point where the pre-fix allocator lost: state has been read, the next identifier
  // is decided, and nothing is persisted yet. Inert unless a test installs a handler.
  await barrier("allocate:after-read", handle.owner.token);

  const issued: AllocatedIdentifiers = { ROUTE_CALL: [], LABEL: [], EVAL: [], ADR: [] };

  for (const family of SEQUENCE_FAMILIES) {
    const count = request[family] ?? 0;
    if (count === 0) continue;
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new AccountingInvariantError(
        `Invalid allocation count for ${family}: ${String(count)}.`,
      );
    }
    for (let i = 0; i < count; i += 1) {
      state.issued[family] += 1;
      const value = state.issued[family];
      if (family === "ROUTE_CALL") {
        issued.ROUTE_CALL.push({
          sequence: value,
          route_id: formatIdentifier("ROUTE", value),
          call_id: formatIdentifier("CALL", value),
        });
      } else {
        issued[family].push(formatIdentifier(family, value));
      }
    }
  }

  state.updated_at = new Date().toISOString();
  // Durable before the identifier is used. A crash after this point leaves a gap, never a reuse.
  await writeSequenceState(root, state);
  return issued;
}

/** Convenience for the common case: one route/call pair. */
export async function allocateRouteCallPair(handle: LockHandle): Promise<RouteCallPair> {
  const issued = await allocateIdentifiers(handle, { ROUTE_CALL: 1 });
  const pair = issued.ROUTE_CALL[0];
  if (pair === undefined) {
    throw new AccountingInvariantError("The allocator returned no route/call pair.");
  }
  return pair;
}

export interface SequenceInspection {
  state: SequenceState | null;
  bootstrapped: SequenceBootstrapRecord | null;
  canonical: Record<SequenceFamily, number>;
  behindCanonical: SequenceFamily[];
}

/**
 * Read allocator state for validation and diagnostics. Never mutates and never bootstraps.
 *
 * `validate` must be able to observe a missing or corrupt allocator without repairing it, so
 * this deliberately does not call `loadOrBootstrapState`.
 */
export async function inspectSequence(root: string): Promise<SequenceInspection> {
  const state = await loadSequenceState(root);
  const bootstrapped = await loadBootstrapRecord(root);
  const canonical = await deriveCanonicalMaxima(root);
  const behindCanonical =
    state === null
      ? []
      : SEQUENCE_FAMILIES.filter((family) => canonical[family] > state.issued[family]);
  return { state, bootstrapped, canonical, behindCanonical };
}
