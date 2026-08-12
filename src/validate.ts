import { access, readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { readAdrs } from "./company.js";
import { loadCompanyConfig } from "./config.js";
import {
  BOUNDS,
  type AgentCallTrace,
  type EvalRow,
  type GateLabel,
  type RouteLog,
  type RunOutcome,
} from "./contracts.js";
import { ValidationError } from "./errors.js";
import { isNodeError, readJsonLines, resolveRepoPath } from "./files.js";
import { canonicalRecordJson } from "./ledger.js";
import { assessCompanyLock } from "./lock.js";
import { QUARANTINE_RELATIVE_DIR } from "./recover.js";
import { inspectSequence, SequenceStateError } from "./sequence.js";
import type { ADR } from "./contracts.js";

const REQUIRED_PATHS = [
  "AGENTS.md",
  "tailered.config.json",
  "product",
  "decisions/ADR-000.md",
  "decisions/ADR-001.md",
  "loops/ship.yaml",
  "seats/roster.yaml",
  "evals/ledger.jsonl",
  "evals/routes.jsonl",
  "evals/runs",
  "labels/ledger.jsonl",
  "policies/gates.yaml",
] as const;

const OUTCOMES = new Set<RunOutcome>([
  "shipped",
  "halted_attempts",
  "halted_budget",
  "rejected",
]);

export interface ValidationReport {
  valid: true;
  decisions: number;
  evals: number;
  labels: number;
  routes: number;
  calls: number;
  contexts: number;
}

export async function validateCompany(root: string): Promise<ValidationReport> {
  const errors: string[] = [];
  for (const relativePath of REQUIRED_PATHS) {
    try {
      await access(resolve(root, relativePath));
    } catch {
      errors.push(`Missing required path: ${relativePath}`);
    }
  }
  if (errors.length > 0) {
    throw new ValidationError(errors.join("\n"));
  }

  try {
    await loadCompanyConfig(root);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  // Torn-JSONL handling (P0B-15): a torn line must name its exact file and line, and one
  // corrupt file must not hide the state of the others. Each ledger is read independently;
  // a torn file contributes its error and an empty row set, and validation continues.
  const readLedgerCollecting = async <T>(relativePath: string): Promise<T[]> => {
    try {
      return await readJsonLines<T>(resolve(root, relativePath));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return [];
    }
  };
  let adrs: Awaited<ReturnType<typeof readAdrs>> = [];
  try {
    adrs = await readAdrs(root);
  } catch (error) {
    errors.push(`decisions/ are unreadable: ${error instanceof Error ? error.message : String(error)}`);
  }
  const evals = await readLedgerCollecting<EvalRow>("evals/ledger.jsonl");
  const labels = await readLedgerCollecting<GateLabel>("labels/ledger.jsonl");
  const routes = await readLedgerCollecting<RouteLog>("evals/routes.jsonl");
  const adrIds = new Set(adrs.map((adr) => adr.id));
  const labelIds = new Set(labels.map((label) => label.id));
  const routeIds = new Set(routes.map((routeLog) => routeLog.id));
  const callIds = new Set<string>();
  const contextRefs = new Set<string>();
  const runIds = new Set<string>();

  validateUnique(adrs, (adr) => adr.id, "ADR", errors);
  validateUnique(labels, (row) => row.id, "gate label", errors);
  validateUnique(routes, (row) => row.id, "route log", errors);
  validateUnique(evals, (row) => row.id, "eval", errors);

  for (const adr of adrs) {
    if (adr.id !== "ADR-000" && adr.caused_by.length === 0) {
      errors.push(`${adr.id} has no caused_by edge.`);
    }
    if (adr.supersedes && !adr.caused_by.includes(adr.supersedes)) {
      errors.push(`${adr.id} supersedes ${adr.supersedes} without a typed caused_by edge.`);
    }
  }

  validateUnique(evals, (row) => row.adr_id, "terminal-ADR reference", errors);
  for (const row of evals) {
    validateEval(row, errors);
    if (runIds.has(row.run_id)) {
      errors.push(`Run ${row.run_id} has more than one terminal eval.`);
    }
    runIds.add(row.run_id);
    if (!adrIds.has(row.adr_id)) {
      errors.push(`${row.id} references missing ADR ${row.adr_id}.`);
    }
    if (!row.caused_by.includes(row.adr_id)) {
      errors.push(`${row.id} caused_by lacks its own terminal ADR ${row.adr_id}.`);
    }
    if (row.gate_label_id && !labelIds.has(row.gate_label_id)) {
      errors.push(`${row.id} references missing gate label ${row.gate_label_id}.`);
    }
    if (row.outcome === "rejected" && !row.gate_label_id) {
      errors.push(`${row.id} is rejected but has no gate label.`);
    }
    if (row.outcome === "shipped" && (!row.gate_label_id || !row.preview_url)) {
      errors.push(`${row.id} shipped without both a gate label and preview URL.`);
    }
    await requireFile(
      root,
      `evals/runs/${row.run_id}/spec.json`,
      `${row.id} has no stored replay spec.`,
      errors,
    );
  }

  for (const label of labels) {
    validateLabel(label, errors);
    const terminal = evals.find((row) => row.run_id === label.run_id);
    if (!terminal) {
      errors.push(`${label.id} has no terminal eval for ${label.run_id}.`);
    }
  }

  for (const routeLog of routes) {
    validateRouteLog(routeLog, errors);
    if (!routeIds.has(routeLog.id)) {
      errors.push(`Route log ${routeLog.id} could not be indexed.`);
    }
    const terminal = evals.find((row) => row.run_id === routeLog.run_id);
    if (!terminal) {
      errors.push(`${routeLog.id} has no terminal eval for ${routeLog.run_id}.`);
    }
    if (callIds.has(routeLog.call_id)) {
      errors.push(`Duplicate agent call id: ${routeLog.call_id}`);
    }
    callIds.add(routeLog.call_id);
    contextRefs.add(routeLog.context.snapshot_ref);
    await validateRouteArtifacts(root, routeLog, errors);
  }

  await validateRunState(root, adrs, evals, labels, errors);
  await validateInfrastructureState(root, errors);

  if (errors.length > 0) {
    throw new ValidationError(errors.join("\n"));
  }
  return {
    valid: true,
    decisions: adrs.length,
    evals: evals.length,
    labels: labels.length,
    routes: routes.length,
    calls: callIds.size,
    contexts: contextRefs.size,
  };
}

function validateEval(row: EvalRow, errors: string[]): void {
  if (!OUTCOMES.has(row.outcome)) {
    errors.push(`${row.id} has invalid outcome ${String(row.outcome)}.`);
  }
  if (row.cost_usd < 0 || row.cost_usd >= BOUNDS.maxCostPerRunUsd) {
    errors.push(`${row.id} cost must be non-negative and strictly below $5.00.`);
  }
  if (row.tests_passed.length > row.tests_total) {
    errors.push(`${row.id} passed-test count exceeds its test total.`);
  }
  if (row.caused_by.length === 0) {
    errors.push(`${row.id} has no caused_by edge.`);
  }
}

function validateLabel(row: GateLabel, errors: string[]): void {
  if (!["approve", "reject", "edit"].includes(row.verdict)) {
    errors.push(`${row.id} has invalid verdict ${String(row.verdict)}.`);
  }
  if (row.verdict === "edit" && !row.edit_diff) {
    errors.push(`${row.id} has an edit verdict without an edit diff.`);
  }
  if (row.verdict !== "edit" && row.edit_diff) {
    errors.push(`${row.id} has an edit diff without an edit verdict.`);
  }
  if (row.caused_by.length === 0) {
    errors.push(`${row.id} has no caused_by edge.`);
  }
}

function validateRouteLog(row: RouteLog, errors: string[]): void {
  if (row.cost_usd < 0) {
    errors.push(`${row.id} has negative cost.`);
  }
  if (row.tokens.input < 0 || row.tokens.output < 0) {
    errors.push(`${row.id} has negative token usage.`);
  }
  if (
    !["completed", "failed", "accounting_violation"].includes(row.status)
  ) {
    errors.push(`${row.id} has invalid call status ${String(row.status)}.`);
  }
  if (!/^CALL-\d{6}$/u.test(row.call_id)) {
    errors.push(`${row.id} has invalid call id ${row.call_id}.`);
  }
  if (!/^[a-f0-9]{64}$/u.test(row.context.repo_hash)) {
    errors.push(`${row.id} has an invalid context repository hash.`);
  }
  if (
    !Number.isSafeInteger(row.context.bytes) ||
    row.context.bytes <= 0 ||
    !Number.isFinite(row.context.assembly_ms) ||
    row.context.assembly_ms < 0
  ) {
    errors.push(`${row.id} has invalid context telemetry.`);
  }
  const expectedSnapshotRef =
    `evals/runs/${row.run_id}/contexts/${row.context.repo_hash}.json`;
  if (row.context.snapshot_ref !== expectedSnapshotRef) {
    errors.push(`${row.id} context snapshot reference is not canonical.`);
  }
  const expectedTraceRef =
    `evals/runs/${row.run_id}/calls/${row.call_id}.json`;
  if (row.trace_ref !== expectedTraceRef) {
    errors.push(`${row.id} call trace reference is not canonical.`);
  }
  if (row.caused_by.length === 0) {
    errors.push(`${row.id} has no caused_by edge.`);
  }
}

async function validateRouteArtifacts(
  root: string,
  row: RouteLog,
  errors: string[],
): Promise<void> {
  try {
    const snapshot = await readFile(
      resolveRepoPath(root, row.context.snapshot_ref),
      "utf8",
    );
    const parsed = JSON.parse(snapshot) as {
      repoHash?: unknown;
      caused_by?: unknown;
    };
    if (
      parsed.repoHash !== row.context.repo_hash ||
      Buffer.byteLength(snapshot) !== row.context.bytes
    ) {
      errors.push(`${row.id} context telemetry does not match its snapshot.`);
    }
    if (
      !Array.isArray(parsed.caused_by) ||
      parsed.caused_by.length === 0 ||
      !parsed.caused_by.every((value) => typeof value === "string")
    ) {
      errors.push(`${row.id} context snapshot has no caused_by edge.`);
    }
  } catch (error) {
    errors.push(
      `${row.id} context snapshot is unreadable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let trace: AgentCallTrace;
  try {
    trace = JSON.parse(
      await readFile(resolveRepoPath(root, row.trace_ref), "utf8"),
    ) as AgentCallTrace;
  } catch (error) {
    errors.push(
      `${row.id} call trace is unreadable: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }
  if (
    trace.id !== row.call_id ||
    trace.route_log_id !== row.id ||
    trace.run_id !== row.run_id ||
    trace.task_kind !== row.task_kind ||
    trace.tier !== row.tier ||
    trace.model !== row.model ||
    trace.status !== row.status ||
    trace.context_ref !== row.context.snapshot_ref ||
    trace.usage.input !== row.tokens.input ||
    trace.usage.output !== row.tokens.output ||
    trace.usage.cost_usd !== row.cost_usd ||
    trace.signals.attempts !== row.attempts
  ) {
    errors.push(`${row.id} does not match its stored call trace.`);
  }
  if (
    !trace.caused_by.includes(row.id) ||
    !trace.caused_by.includes(trace.spec_id)
  ) {
    errors.push(`${trace.id} has no caused_by edge to ${row.id}.`);
  }
}

async function requireFile(
  root: string,
  relativePath: string,
  message: string,
  errors: string[],
): Promise<void> {
  try {
    await access(resolveRepoPath(root, relativePath));
  } catch {
    errors.push(message);
  }
}

function validateUnique<T>(
  rows: T[],
  key: (row: T) => string,
  kind: string,
  errors: string[],
): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const id = key(row);
    if (seen.has(id)) {
      errors.push(`Duplicate ${kind} id: ${id}`);
    }
    seen.add(id);
  }
}

// ---------------------------------------------------------------------------
// P0B-15: run-state validation. Observes only; never repairs. Every condition
// below maps to one entry in the extended-validation contract.
// ---------------------------------------------------------------------------

interface IntentShape {
  schema_version?: number;
  run_id?: string;
  spec_id?: string;
  adr?: ADR;
  eval?: EvalRow;
  payload_sha256?: { adr?: string; eval?: string };
  caused_by?: string[];
}

interface MarkerShape {
  schema_version?: number;
  run_id?: string;
  eval_id?: string;
  adr_id?: string;
  gate_label_id?: string;
  outcome?: string;
  caused_by?: string[];
}

async function readOptionalJson<T>(
  path: string,
): Promise<{ kind: "absent" } | { kind: "unreadable"; reason: string } | { kind: "ok"; value: T }> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return { kind: "absent" };
    return { kind: "unreadable", reason: error instanceof Error ? error.message : String(error) };
  }
  try {
    return { kind: "ok", value: JSON.parse(raw) as T };
  } catch (error) {
    return { kind: "unreadable", reason: error instanceof Error ? error.message : String(error) };
  }
}

async function validateRunState(
  root: string,
  adrs: Awaited<ReturnType<typeof readAdrs>>,
  evals: EvalRow[],
  labels: GateLabel[],
  errors: string[],
): Promise<void> {
  const adrIds = new Set(adrs.map((adr) => adr.id));
  const labelIds = new Set(labels.map((label) => label.id));
  const runsRoot = resolve(root, "evals/runs");
  let runDirs: string[] = [];
  try {
    runDirs = (await readdir(runsRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      errors.push(`evals/runs is unreadable: ${error instanceof Error ? error.message : String(error)}`);
    }
    return;
  }

  for (const runId of runDirs) {
    const runDir = resolve(runsRoot, runId);
    const terminal = evals.find((row) => row.run_id === runId);
    const started = await readOptionalJson<Record<string, unknown>>(resolve(runDir, "started.json"));
    const intent = await readOptionalJson<IntentShape>(resolve(runDir, "finalization-intent.json"));
    const marker = await readOptionalJson<MarkerShape>(resolve(runDir, "finalized.json"));

    if (started.kind === "unreadable") {
      errors.push(`evals/runs/${runId}/started.json is unreadable: ${started.reason}`);
    }
    if (started.kind === "ok" && terminal === undefined) {
      errors.push(
        `Unmatched run start: ${runId} has a durable start record and no terminal eval. ` +
          `The run was interrupted; run \`tailered recover\`.`,
      );
    }
    if (started.kind === "ok" && !Array.isArray(started.value.caused_by)) {
      errors.push(`evals/runs/${runId}/started.json has no caused_by edge.`);
    }

    // Unmatched call starts are an error only while the run itself is unresolved: a recovered
    // run legitimately carries interrupted call-start records, named in its terminal blocker.
    if (terminal === undefined) {
      let callStarts: string[] = [];
      try {
        callStarts = (await readdir(resolve(runDir, "calls"))).filter((name) =>
          /\.started\.json$/u.test(name),
        );
      } catch (error) {
        if (!isNodeError(error) || error.code !== "ENOENT") throw error;
      }
      for (const name of callStarts) {
        errors.push(
          `Unmatched call start: evals/runs/${runId}/calls/${name} has no completed route ` +
            `log and the run has no terminal eval.`,
        );
      }
    }

    if (intent.kind === "unreadable") {
      errors.push(`evals/runs/${runId}/finalization-intent.json is unreadable: ${intent.reason}`);
    }
    if (intent.kind === "ok") {
      if (intent.value.schema_version !== 2) {
        errors.push(
          `evals/runs/${runId}/finalization-intent.json has unknown schema version ` +
            `${String(intent.value.schema_version)}.`,
        );
      } else {
        const adr = intent.value.adr;
        const intended = intent.value.eval;
        if (adr === undefined || intended === undefined) {
          errors.push(`evals/runs/${runId} intent lacks its complete payloads.`);
        } else {
          const adrHash = createHash("sha256").update(canonicalRecordJson(adr)).digest("hex");
          const evalHash = createHash("sha256").update(canonicalRecordJson(intended)).digest("hex");
          if (intent.value.payload_sha256?.adr !== adrHash) {
            errors.push(`evals/runs/${runId} intent ADR payload hash does not match its payload.`);
          }
          if (intent.value.payload_sha256?.eval !== evalHash) {
            errors.push(`evals/runs/${runId} intent eval payload hash does not match its payload.`);
          }
          if (intended.adr_id !== adr.id) {
            errors.push(`evals/runs/${runId} intended eval does not reference its own terminal ADR.`);
          }
          if (terminal !== undefined && canonicalRecordJson(terminal) !== canonicalRecordJson(intended)) {
            errors.push(`${terminal.id} disagrees with the recorded finalization intent for ${runId}.`);
          }
        }
        if (!Array.isArray(intent.value.caused_by) || intent.value.caused_by.length === 0) {
          errors.push(`evals/runs/${runId}/finalization-intent.json has no caused_by edge.`);
        }
      }
      if (marker.kind === "absent") {
        errors.push(
          `Unresolved finalization intent: ${runId} recorded an intent and no finalized marker. ` +
            `Run \`tailered recover\`.`,
        );
      }
    }

    if (marker.kind === "unreadable") {
      errors.push(`evals/runs/${runId}/finalized.json is unreadable: ${marker.reason}`);
    }
    if (marker.kind === "ok") {
      const m = marker.value;
      if (terminal === undefined || m.eval_id !== terminal.id) {
        errors.push(`Finalized marker for ${runId} names eval ${String(m.eval_id)}, which does not exist for the run.`);
      } else {
        if (m.adr_id !== terminal.adr_id) {
          errors.push(`Finalized marker for ${runId} disagrees with the terminal row's ADR.`);
        }
        if (m.outcome !== terminal.outcome) {
          errors.push(`Finalized marker for ${runId} disagrees with the terminal row's outcome.`);
        }
      }
      if (m.adr_id !== undefined && !adrIds.has(m.adr_id)) {
        errors.push(`Finalized marker for ${runId} names missing ADR ${m.adr_id}.`);
      }
      if (m.gate_label_id !== undefined && !labelIds.has(m.gate_label_id)) {
        errors.push(`Finalized marker for ${runId} names missing gate label ${m.gate_label_id}.`);
      }
      if (!Array.isArray(m.caused_by) || m.caused_by.length === 0) {
        errors.push(`evals/runs/${runId}/finalized.json has no caused_by edge.`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// P0B-15: infrastructure state - lock, allocator, incidents, quarantine.
// ---------------------------------------------------------------------------

async function validateInfrastructureState(root: string, errors: string[]): Promise<void> {
  const lock = await assessCompanyLock(root);
  if (lock.state === "dead") {
    errors.push(
      `Stale repository lock: owner pid ${lock.owner.pid} is provably dead on this host. ` +
        `Run \`tailered recover\`.`,
    );
  } else if (lock.state === "foreign") {
    errors.push(
      `Ambiguous repository lock: held by pid ${lock.owner.pid} on foreign host ` +
        `"${lock.owner.host}"; liveness cannot be verified.`,
    );
  } else if (lock.state === "corrupt") {
    errors.push(`Unreadable repository lock ownership: ${lock.reason}`);
  }

  try {
    const sequence = await inspectSequence(root);
    if (sequence.state === null && sequence.bootstrapped !== null) {
      errors.push(
        "Allocator state is missing while its bootstrap marker exists. Identifier state was " +
          "lost after initialization.",
      );
    }
    if (sequence.state !== null && sequence.behindCanonical.length > 0) {
      errors.push(
        `Allocator state is behind canonical or reserved state for: ` +
          `${sequence.behindCanonical.join(", ")}.`,
      );
    }
  } catch (error) {
    if (error instanceof SequenceStateError) {
      errors.push(`Allocator state invalid (${error.reason}): ${error.message}`);
    } else {
      throw error;
    }
  }

  try {
    const incidents = await readJsonLines<{ kind?: string; lock_token?: string }>(
      resolve(root, ".tailered/incidents.jsonl"),
    );
    const resolved = new Set(
      incidents
        .filter((entry) => entry.kind === "incident_resolved" && typeof entry.lock_token === "string")
        .map((entry) => entry.lock_token as string),
    );
    for (const incident of incidents) {
      if (incident.kind === "lock_release_failed" && !resolved.has(incident.lock_token ?? "")) {
        errors.push(
          `Unresolved integrity incident: lock release failed for token ` +
            `${incident.lock_token ?? "(unknown)"} and no resolution record exists.`,
        );
      }
    }
  } catch (error) {
    errors.push(
      `.tailered/incidents.jsonl is unreadable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const entries = await readdir(resolve(root, QUARANTINE_RELATIVE_DIR));
    for (const name of entries) {
      const match = /^(.+)\.json$/u.exec(name);
      if (!match?.[1] || name.endsWith(".resolved.json")) continue;
      const companion = `${match[1]}.resolved.json`;
      if (!entries.includes(companion)) {
        errors.push(
          `Unresolved quarantine: ${QUARANTINE_RELATIVE_DIR}/${name} has no resolution record.`,
        );
      }
    }
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      errors.push(
        `${QUARANTINE_RELATIVE_DIR} is unreadable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
