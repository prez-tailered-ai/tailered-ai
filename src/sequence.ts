import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AccountingInvariantError } from "./errors.js";
import { readJsonLines, writeAtomic } from "./files.js";
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
 * runs under the repository lock. Identifiers are therefore never reused, may legitimately
 * contain gaps after a crash, and never move backward.
 */

export const SEQUENCE_SCHEMA_VERSION = 1;

/** Repository-relative location. Derived state, rebuildable, outside `product/`. */
export const SEQUENCE_RELATIVE_PATH = ".tailered/ledger-sequence.json";

export type SequenceFamily = "ROUTE" | "CALL" | "LABEL" | "EVAL" | "ADR";

export const SEQUENCE_FAMILIES: readonly SequenceFamily[] = [
  "ROUTE",
  "CALL",
  "LABEL",
  "EVAL",
  "ADR",
];

export interface SequenceState {
  schema_version: number;
  updated_at: string;
  /** Highest identifier ISSUED per family. Monotonic. Gaps are legal; reuse is not. */
  issued: Record<SequenceFamily, number>;
  /** Recorded whenever the allocator had to be rebuilt or repaired from canonical state. */
  repairs: Array<{
    at: string;
    family: SequenceFamily;
    from: number;
    to: number;
    reason: string;
  }>;
}

export function sequencePathFor(root: string): string {
  return resolve(root, SEQUENCE_RELATIVE_PATH);
}

function emptyState(): SequenceState {
  return {
    schema_version: SEQUENCE_SCHEMA_VERSION,
    updated_at: new Date().toISOString(),
    issued: { ROUTE: 0, CALL: 0, LABEL: 0, EVAL: 0, ADR: 0 },
    repairs: [],
  };
}

function parseSequenceNumber(id: string, prefix: string): number {
  const match = new RegExp(`^${prefix}-(\\d{3,})$`, "u").exec(id);
  return match ? Number(match[1]) : 0;
}

/**
 * Derive the highest identifier already present in canonical state.
 *
 * Canonical files are the source of truth. The allocator file is a cache: if it disappears,
 * this rebuilds it; if it disagrees downward, this repairs it. It is never allowed to hand out
 * an identifier that canonical state already contains.
 */
export async function deriveCanonicalMaxima(
  root: string,
): Promise<Record<SequenceFamily, number>> {
  const [routes, evals, labels, adrs] = await Promise.all([
    readJsonLines<RouteLog>(resolve(root, "evals/routes.jsonl")),
    readJsonLines<EvalRow>(resolve(root, "evals/ledger.jsonl")),
    readJsonLines<GateLabel>(resolve(root, "labels/ledger.jsonl")),
    readAdrs(root).catch(() => []),
  ]);

  const max = (values: number[]) => values.reduce((a, b) => (b > a ? b : a), 0);

  return {
    ROUTE: max(routes.map((r) => parseSequenceNumber(r.id, "ROUTE"))),
    CALL: max(routes.map((r) => parseSequenceNumber(r.call_id, "CALL"))),
    LABEL: max(labels.map((r) => parseSequenceNumber(r.id, "LABEL"))),
    EVAL: max(evals.map((r) => parseSequenceNumber(r.id, "EVAL"))),
    ADR: max(adrs.map((a) => parseSequenceNumber(a.id, "ADR"))),
  };
}

async function loadState(root: string): Promise<SequenceState> {
  try {
    const raw = await readFile(sequencePathFor(root), "utf8");
    const parsed = JSON.parse(raw) as SequenceState;
    if (
      parsed?.schema_version !== SEQUENCE_SCHEMA_VERSION ||
      typeof parsed.issued !== "object" ||
      parsed.issued === null
    ) {
      throw new Error("unrecognised sequence state");
    }
    for (const family of SEQUENCE_FAMILIES) {
      const value = parsed.issued[family];
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`invalid counter for ${family}`);
      }
    }
    if (!Array.isArray(parsed.repairs)) parsed.repairs = [];
    return parsed;
  } catch {
    return emptyState();
  }
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

export function formatSequenceId(family: SequenceFamily, value: number): string {
  return `${family}-${String(value).padStart(6, "0")}`;
}

export interface AllocationRequest {
  family: SequenceFamily;
  count?: number;
}

/**
 * Allocate identifiers and persist the increment BEFORE returning.
 *
 * The caller must already hold the repository lock. This function does not acquire it: the
 * allocation and the append that consumes it belong to one critical section, and acquiring
 * here would split them into two.
 */
export async function allocateIdentifiers(
  root: string,
  requests: AllocationRequest[],
): Promise<Record<string, string[]>> {
  const state = await loadState(root);
  const canonical = await deriveCanonicalMaxima(root);
  reconcile(state, canonical, "canonical state was ahead of the allocator");

  const issued: Record<string, string[]> = {};
  for (const request of requests) {
    const count = request.count ?? 1;
    if (!Number.isSafeInteger(count) || count < 1) {
      throw new AccountingInvariantError(
        `Invalid allocation count for ${request.family}.`,
      );
    }
    const ids: string[] = [];
    for (let i = 0; i < count; i += 1) {
      state.issued[request.family] += 1;
      ids.push(formatSequenceId(request.family, state.issued[request.family]));
    }
    issued[request.family] = ids;
  }

  state.updated_at = new Date().toISOString();
  // Durable before the identifier is used. A crash after this point leaves a gap, never a reuse.
  await writeAtomicOverwrite(sequencePathFor(root), `${JSON.stringify(state, null, 2)}\n`);
  return issued;
}

/**
 * `writeAtomic` in `src/files.ts` creates its temporary file with `wx` and renames over the
 * destination, which is exactly the semantics needed here: the sequence file is rewritten in
 * place, atomically, on every allocation.
 */
async function writeAtomicOverwrite(path: string, content: string): Promise<void> {
  await writeAtomic(path, content);
}

/** Read allocator state for validation and diagnostics. Never mutates. */
export async function inspectSequence(root: string): Promise<{
  state: SequenceState;
  canonical: Record<SequenceFamily, number>;
  behindCanonical: SequenceFamily[];
}> {
  const state = await loadState(root);
  const canonical = await deriveCanonicalMaxima(root);
  const behindCanonical = SEQUENCE_FAMILIES.filter(
    (family) => canonical[family] > state.issued[family],
  );
  return { state, canonical, behindCanonical };
}
