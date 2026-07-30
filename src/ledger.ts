import { resolve } from "node:path";
import type {
  AgentCallTrace,
  EvalRow,
  GateLabel,
  RouteLog,
  Spec,
} from "./contracts.js";
import { AppendOnlyViolationError } from "./errors.js";
import {
  appendJsonLine,
  readJsonLines,
  writeNewFile,
} from "./files.js";

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

  async appendGateLabel(label: GateLabel): Promise<void> {
    const existing = await this.labels();
    if (
      existing.some(
        (row) => row.id === label.id || row.run_id === label.run_id,
      )
    ) {
      throw new AppendOnlyViolationError(
        `A gate label already exists for ${label.run_id}.`,
      );
    }
    await appendJsonLine(this.#labelPath, label);
  }

  async appendRouteLog(log: RouteLog): Promise<void> {
    const existing = await this.routes();
    if (existing.some((row) => row.id === log.id)) {
      throw new AppendOnlyViolationError(`Route log ${log.id} already exists.`);
    }
    await appendJsonLine(this.#routePath, log);
  }

  async appendTerminalEval(row: EvalRow): Promise<void> {
    const existing = await this.evals();
    if (
      existing.some(
        (candidate) =>
          candidate.id === row.id || candidate.run_id === row.run_id,
      )
    ) {
      throw new AppendOnlyViolationError(
        `A terminal eval already exists for ${row.run_id}.`,
      );
    }
    await appendJsonLine(this.#evalPath, row);
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

  async nextEvalId(): Promise<string> {
    return formatLedgerId("EVAL", (await this.evals()).length + 1);
  }

  async nextLabelId(): Promise<string> {
    return formatLedgerId("LABEL", (await this.labels()).length + 1);
  }

  async nextRouteId(): Promise<string> {
    return formatLedgerId("ROUTE", (await this.routes()).length + 1);
  }
}

function formatLedgerId(prefix: string, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(6, "0")}`;
}
