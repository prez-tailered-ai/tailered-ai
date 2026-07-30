import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readAdrs } from "./company.js";
import {
  BOUNDS,
  type EvalRow,
  type GateLabel,
  type RouteLog,
  type RunOutcome,
} from "./contracts.js";
import { ValidationError } from "./errors.js";
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

  const config = JSON.parse(
    await readFile(resolve(root, "tailered.config.json"), "utf8"),
  ) as unknown;
  if (typeof config !== "object" || config === null) {
    errors.push("tailered.config.json must be an object.");
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
  if (row.caused_by.length === 0) {
    errors.push(`${row.id} has no caused_by edge.`);
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
