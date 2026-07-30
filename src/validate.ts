import { access, readFile } from "node:fs/promises";
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
import { resolveRepoPath } from "./files.js";
import { CompanyLedger } from "./ledger.js";

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

  const ledger = new CompanyLedger(root);
  const [adrs, evals, labels, routes] = await Promise.all([
    readAdrs(root),
    ledger.evals(),
    ledger.labels(),
    ledger.routes(),
  ]);
  const adrIds = new Set(adrs.map((adr) => adr.id));
  const labelIds = new Set(labels.map((label) => label.id));
  const routeIds = new Set(routes.map((routeLog) => routeLog.id));
  const callIds = new Set<string>();
  const contextRefs = new Set<string>();
  const runIds = new Set<string>();

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

  for (const row of evals) {
    validateEval(row, errors);
    if (runIds.has(row.run_id)) {
      errors.push(`Run ${row.run_id} has more than one terminal eval.`);
    }
    runIds.add(row.run_id);
    if (!adrIds.has(row.adr_id)) {
      errors.push(`${row.id} references missing ADR ${row.adr_id}.`);
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
