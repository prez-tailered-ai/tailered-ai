import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Agent } from "./agent.js";
import { isRecord } from "./agent.js";
import { ReserveSettleBudget } from "./budget.js";
import {
  BOUNDS,
  type AcceptanceTest,
  type AdrDraftPayload,
  type AgentCallStatus,
  type AgentCallTrace,
  type AgentRequest,
  type CodegenPayload,
  type CritiquePayload,
  type EvalRow,
  type FileWrite,
  type GateDecision,
  type GateLabel,
  type RunOutcome,
  type RunReceipt,
  type Spec,
  type TaskKind,
  type TestgenPayload,
} from "./contracts.js";
import { loadCompanyConfig } from "./config.js";
import { RunContextCache } from "./context.js";
import {
  appendAdr,
  newRunId,
  readAdrs,
  validateWrittenProse,
} from "./company.js";
import {
  AccountingInvariantError,
  AttemptsHaltError,
  BudgetHaltError,
  RejectedRunError,
  RunHaltError,
  ValidationError,
} from "./errors.js";
import {
  hashDirectory,
  resolveRepoPath,
  writeAtomic,
} from "./files.js";
import { CompanyLedger } from "./ledger.js";
import { createRouteLog, route } from "./router.js";

export interface HumanGate {
  decide(input: {
    artifactHash: string;
    critique: CritiquePayload;
    accounting: ReturnType<ReserveSettleBudget["snapshot"]>;
    contextSnapshot: string;
  }): Promise<GateDecision>;
}

export class FixedGate implements HumanGate {
  constructor(readonly decision: GateDecision) {}

  async decide(): Promise<GateDecision> {
    return structuredClone(this.decision);
  }
}

export interface ShipOptions {
  root: string;
  specText: string;
  agent: Agent;
  gate: HumanGate;
  runId?: string;
  now?: () => Date;
  previewDeployer?: (root: string) => Promise<string>;
}

export async function taileredShip(options: ShipOptions): Promise<RunReceipt> {
  const root = resolve(options.root);
  const now = options.now ?? (() => new Date());
  const runId = options.runId ?? newRunId(now());
  const startedAt = performance.now();
  const ledger = new CompanyLedger(root);
  const config = await loadCompanyConfig(root);
  const budget = new ReserveSettleBudget(
    config.bounds.maxCostPerRunUsdExclusive,
  );
  const adrs = await readAdrs(root);
  const causeAdr = adrs.at(-1);
  if (!causeAdr) {
    throw new ValidationError("Ship loop requires an initialized company repository.");
  }

  const spec: Spec = {
    id: `SPEC-${runId.slice(4)}`,
    text: options.specText.trim(),
    acceptance_tests: [],
    caused_by: [causeAdr.id],
  };
  if (spec.text === "") {
    throw new ValidationError("Spec text is required.");
  }

  const contextCache = new RunContextCache(root, runId, spec.id, ledger);
  const attempts = new Map<string, number>();
  const passed = new Set<string>();
  let specWritten = false;
  let outcome: RunOutcome = "halted_attempts";
  let blocker: string | undefined;
  let previewUrl: string | undefined;
  let gateLabel: GateLabel | undefined;
  let adrDraft: AdrDraftPayload | undefined;
  let evalRow: EvalRow | undefined;
  let terminalAdrId: string | undefined;

  const invoke = async (
    taskKind: TaskKind,
    signals: { attempts: number },
    failureOutput?: string,
  ): Promise<unknown> => {
    const decision = route(taskKind, signals, config.models);
    const context = await contextCache.get();
    const request: AgentRequest = {
      runId,
      taskKind,
      model: decision.model,
      tier: decision.tier,
      signals,
      spec: spec.text,
      contextSnapshot: context.snapshot,
      ...(failureOutput ? { failureOutput } : {}),
    };
    const projection = options.agent.project(request);
    const reservationId = budget.reserve(
      decision.tier,
      projection.maxCostUsd,
      projection.maxTokens,
    );
    const routeLogId = await ledger.nextRouteId();
    const callId = routeLogId.replace(/^ROUTE-/u, "CALL-");
    const traceRef = ledger.callTraceRef(runId, callId);

    const recordCall = async (input: {
      status: AgentCallStatus;
      usage: { input: number; output: number };
      costUsd: number;
      payload?: unknown;
      error?: string;
      reason?: string;
    }): Promise<void> => {
      const createdAt = now().toISOString();
      const trace: AgentCallTrace = {
        id: callId,
        route_log_id: routeLogId,
        run_id: runId,
        task_kind: taskKind,
        tier: decision.tier,
        model: decision.model,
        status: input.status,
        signals: { ...signals },
        spec_id: spec.id,
        context_ref: context.telemetry.snapshot_ref,
        projection: { ...projection },
        usage: {
          input: input.usage.input,
          output: input.usage.output,
          cost_usd: input.costUsd,
        },
        ...(input.payload !== undefined ? { payload: input.payload } : {}),
        ...(failureOutput ? { failure_output: failureOutput } : {}),
        ...(input.error ? { error: input.error } : {}),
        created_at: createdAt,
        caused_by: [routeLogId, spec.id],
      };
      const writtenTraceRef = await ledger.writeCallTrace(trace);
      if (writtenTraceRef !== traceRef) {
        throw new AccountingInvariantError(
          `Call trace path mismatch: expected ${traceRef}, wrote ${writtenTraceRef}.`,
        );
      }
      await ledger.appendRouteLog(
        createRouteLog({
          id: routeLogId,
          callId,
          runId,
          decision: {
            ...decision,
            ...(input.reason ? { reason: input.reason } : {}),
          },
          usage: input.usage,
          costUsd: input.costUsd,
          status: input.status,
          context: context.telemetry,
          traceRef,
          causedBy: [spec.id],
          createdAt,
        }),
      );
    };

    let response;
    try {
      response = await options.agent.invoke(request);
    } catch (error) {
      budget.settleProjection(reservationId);
      const errorText = error instanceof Error ? error.message : String(error);
      await recordCall({
        status: "failed",
        usage: {
          input: projection.maxTokens,
          output: 0,
        },
        costUsd: projection.maxCostUsd,
        error: errorText,
        reason: `${decision.reason} Agent failed; the reservation settled at its ceiling.`,
      });
      throw new AttemptsHaltError(
        `Agent ${taskKind} call failed: ${errorText}`,
      );
    }

    let settlementError: unknown;
    try {
      budget.settle(
        reservationId,
        response.usage.costUsd,
        response.usage.input + response.usage.output,
      );
    } catch (error) {
      settlementError = error;
    }
    await recordCall({
      status:
        settlementError === undefined ? "completed" : "accounting_violation",
      usage: {
        input: response.usage.input,
        output: response.usage.output,
      },
      costUsd: response.usage.costUsd,
      payload: response.payload,
      ...(settlementError instanceof Error
        ? { error: settlementError.message }
        : {}),
    });
    if (settlementError !== undefined) {
      throw settlementError;
    }
    return response.payload;
  };

  const repairCheck = async (
    check: AcceptanceTest,
    initialFailure: CheckResult,
  ): Promise<void> => {
    let failure = initialFailure;
    while (!failure.passed) {
      const usedAttempts = attempts.get(check.id) ?? 0;
      if (usedAttempts >= config.bounds.maxAttemptsPerCheck) {
        throw new AttemptsHaltError(
          `Check "${check.title}" did not pass after ${usedAttempts} implementation attempts. Last failure: ${failure.output}`,
        );
      }

      const payload = await invoke("codegen", { attempts: usedAttempts }, failure.output);
      const codegen = parseCodegenPayload(payload);
      await applyProductFiles(root, codegen.files);
      contextCache.invalidate();
      attempts.set(check.id, usedAttempts + 1);
      failure = await runCheck(root, check);
    }
    passed.add(check.id);
  };

  const runFullSuite = async (): Promise<void> => {
    for (;;) {
      const results = await Promise.all(
        spec.acceptance_tests.map(async (check) => ({
          check,
          result: await runCheck(root, check),
        })),
      );
      for (const { check, result } of results) {
        if (result.passed) {
          passed.add(check.id);
        } else {
          passed.delete(check.id);
        }
      }
      const failed = results.find(({ result }) => !result.passed);
      if (!failed) {
        return;
      }
      await repairCheck(failed.check, failed.result);
    }
  };

  try {
    const testgen = parseTestgenPayload(
      await invoke("testgen", { attempts: 0 }),
    );
    spec.acceptance_tests = testgen.tests;
    await ledger.writeSpec(runId, spec);
    specWritten = true;

    for (const check of spec.acceptance_tests) {
      const result = await runCheck(root, check);
      if (!result.passed) {
        await repairCheck(check, result);
      } else {
        passed.add(check.id);
      }
    }
    await runFullSuite();

    let critique = parseCritiquePayload(
      await invoke("critique", { attempts: 0 }),
    );
    if (critique.violations.length > 0) {
      const repair = parseCodegenPayload(
        await invoke(
          "codegen",
          { attempts: 0 },
          `Constitution violations:\n${critique.violations.join("\n")}`,
        ),
      );
      await applyProductFiles(root, repair.files);
      contextCache.invalidate();
      await runFullSuite();
      const secondCritique = parseCritiquePayload(
        await invoke("critique", { attempts: 1 }),
      );
      critique = {
        violations: secondCritique.violations,
        flags: [
          ...critique.flags,
          ...secondCritique.flags,
          ...secondCritique.violations.map(
            (violation) => `Unresolved constitution violation: ${violation}`,
          ),
        ],
      };
    }

    let artifactHash = await hashDirectory(resolve(root, "product"));
    const gateContext = JSON.stringify({
      spec,
      critique,
      accounting: budget.snapshot(),
      artifactHash,
    });
    const gateDecision = await options.gate.decide({
      artifactHash,
      critique,
      accounting: budget.snapshot(),
      contextSnapshot: gateContext,
    });
    validateGateDecision(gateDecision);
    gateLabel = {
      id: await ledger.nextLabelId(),
      run_id: runId,
      spec_id: spec.id,
      artifact_hash: artifactHash,
      verdict: gateDecision.verdict,
      ...(gateDecision.edits && gateDecision.edits.length > 0
        ? { edit_diff: renderEditDiff(gateDecision.edits) }
        : {}),
      reason_text: gateDecision.reasonText,
      context_snapshot: gateContext,
      created_at: now().toISOString(),
      caused_by: [spec.id],
    };
    await ledger.appendGateLabel(gateLabel);

    if (gateDecision.verdict === "reject") {
      throw new RejectedRunError(`Founder rejected deployment: ${gateDecision.reasonText}`);
    }
    if (gateDecision.verdict === "edit") {
      if (!gateDecision.edits || gateDecision.edits.length === 0) {
        throw new ValidationError("Edit verdict requires at least one exact file edit.");
      }
      await applyProductFiles(root, gateDecision.edits);
      contextCache.invalidate();
      await runFullSuite();
      const editedCritique = parseCritiquePayload(
        await invoke("critique", { attempts: 0 }),
      );
      if (editedCritique.violations.length > 0) {
        throw new AttemptsHaltError(
          `Founder edit introduced constitution violations: ${editedCritique.violations.join("; ")}`,
        );
      }
      artifactHash = await hashDirectory(resolve(root, "product"));
    }

    adrDraft = parseAdrDraftPayload(
      await invoke("adr_draft", { attempts: 0 }),
    );
    previewUrl = await (options.previewDeployer ?? deployLocalPreview)(root);
    outcome = "shipped";
  } catch (error) {
    if (error instanceof RunHaltError) {
      outcome = error.outcome;
      blocker = error.blocker;
    } else if (error instanceof AccountingInvariantError) {
      outcome = "halted_budget";
      blocker = `Accounting invariant failed: ${error.message}`;
    } else if (error instanceof Error) {
      outcome = error instanceof BudgetHaltError ? "halted_budget" : "halted_attempts";
      blocker = error.message;
    } else {
      outcome = "halted_attempts";
      blocker = String(error);
    }
  } finally {
    if (!specWritten) {
      await ledger.writeSpec(runId, spec);
    }
    budget.assertSettled();

    const terminalAdr = await appendAdr(root, {
      title: adrDraft?.title ?? terminalAdrTitle(outcome),
      context:
        adrDraft?.context ??
        `Run ${runId} attempted spec ${spec.id}. ${blocker ?? "All bounded checks and the human gate completed."}`,
      decision:
        adrDraft?.decision ??
        `Record the run as ${outcome} and preserve its terminal accounting and causal links.`,
      alternatives_rejected:
        adrDraft?.alternativesRejected ?? [
          "Omit a failed or rejected run from the evaluation ledger.",
        ],
      consequences:
        adrDraft?.consequences ?? [
          "The failure half of the tokens-per-outcome curve remains measurable.",
        ],
      status: "accepted",
      caused_by: [
        spec.id,
        ...(gateLabel ? [gateLabel.id] : []),
      ],
    });
    terminalAdrId = terminalAdr.id;

    const accounting = budget.snapshot();
    evalRow = {
      id: await ledger.nextEvalId(),
      run_id: runId,
      spec_id: spec.id,
      outcome,
      tests_passed: [...passed].sort(),
      tests_total: spec.acceptance_tests.length,
      tokens_by_tier: accounting.tokensByTier,
      wall_time_ms: Math.round(performance.now() - startedAt),
      cost_usd: accounting.settledUsd,
      ...(previewUrl ? { preview_url: previewUrl } : {}),
      adr_id: terminalAdr.id,
      ...(gateLabel ? { gate_label_id: gateLabel.id } : {}),
      ...(blocker ? { blocker } : {}),
      created_at: now().toISOString(),
      caused_by: [
        terminalAdr.id,
        spec.id,
        ...(gateLabel ? [gateLabel.id] : []),
      ],
    };
    await ledger.appendTerminalEval(evalRow);
  }

  if (!evalRow || !terminalAdrId) {
    throw new Error("Terminal evaluation was not written.");
  }
  return {
    runId,
    outcome,
    costUsd: evalRow.cost_usd,
    tokensByTier: evalRow.tokens_by_tier,
    wallTimeMs: evalRow.wall_time_ms,
    ...(previewUrl ? { previewUrl } : {}),
    evalId: evalRow.id,
    ...(gateLabel ? { gateLabelId: gateLabel.id } : {}),
    adrId: terminalAdrId,
    ...(blocker ? { blocker } : {}),
  };
}

export async function assertGatingDefinitionOfDone(
  root: string,
  receipt: RunReceipt,
): Promise<void> {
  const ledger = new CompanyLedger(root);
  const evalRow = (await ledger.evals()).find((row) => row.id === receipt.evalId);
  const label = receipt.gateLabelId
    ? (await ledger.labels()).find((row) => row.id === receipt.gateLabelId)
    : undefined;
  const adrs = await readAdrs(root);

  const failures: string[] = [];
  if (receipt.outcome !== "shipped") failures.push("run outcome is not shipped");
  if (!receipt.previewUrl) failures.push("preview_url is missing");
  if (!evalRow || evalRow.tests_passed.length !== evalRow.tests_total) {
    failures.push("not every acceptance test passed");
  }
  if (label?.verdict !== "approve") {
    failures.push("gating verdict is not approve");
  }
  if (label?.edit_diff) {
    failures.push("gating run contains a human edit");
  }
  if (receipt.costUsd >= BOUNDS.maxCostPerRunUsd) {
    failures.push("run cost is not below the exclusive $5.00 cap");
  }
  if (receipt.wallTimeMs >= BOUNDS.demoTimeMinutes * 60_000) {
    failures.push("run exceeded the ten-minute demo ceiling");
  }
  if (adrs.filter((adr) => adr.id !== "ADR-000").length < 2) {
    failures.push("fewer than two self-written ADRs exist");
  }

  if (failures.length > 0) {
    throw new ValidationError(
      `Gating definition of done failed: ${failures.join("; ")}.`,
    );
  }
}

interface CheckResult {
  passed: boolean;
  output: string;
}

async function runCheck(root: string, check: AcceptanceTest): Promise<CheckResult> {
  const cwd = resolveRepoPath(root, check.cwd ?? ".");
  return new Promise((resolveResult) => {
    const child = spawn(check.command, check.args, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      signal: AbortSignal.timeout(60_000),
    });
    const output: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => output.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => output.push(chunk));
    child.on("error", (error) => {
      resolveResult({ passed: false, output: error.message });
    });
    child.on("close", (code, signal) => {
      resolveResult({
        passed: code === 0,
        output:
          Buffer.concat(output).toString("utf8").trim() ||
          `Process ended with ${signal ?? `exit ${String(code)}`}.`,
      });
    });
  });
}

async function applyProductFiles(root: string, files: FileWrite[]): Promise<void> {
  for (const file of files) {
    if (!file.path.startsWith("product/")) {
      throw new ValidationError(
        `Agent and gate writes are restricted to product/: ${file.path}`,
      );
    }
    if (Buffer.byteLength(file.content) > 5_000_000) {
      throw new ValidationError(`File exceeds the 5 MB v1 limit: ${file.path}`);
    }
    await writeAtomic(resolveRepoPath(root, file.path), file.content);
  }
}

async function deployLocalPreview(root: string): Promise<string> {
  const indexPath = resolve(root, "product/index.html");
  const indexStat = await stat(indexPath);
  if (!indexStat.isFile()) {
    throw new ValidationError("Preview deployment requires product/index.html.");
  }
  return pathToFileURL(indexPath).href;
}

function parseTestgenPayload(payload: unknown): TestgenPayload {
  if (!isRecord(payload) || !Array.isArray(payload.tests) || payload.tests.length === 0) {
    throw new ValidationError("Test generation must return at least one acceptance test.");
  }
  const ids = new Set<string>();
  const tests = payload.tests.map((candidate, index) => {
    if (
      !isRecord(candidate) ||
      typeof candidate.id !== "string" ||
      candidate.id.trim() === "" ||
      typeof candidate.title !== "string" ||
      candidate.title.trim() === "" ||
      typeof candidate.command !== "string" ||
      candidate.command.trim() === "" ||
      !Array.isArray(candidate.args) ||
      !candidate.args.every((arg) => typeof arg === "string") ||
      (candidate.cwd !== undefined && typeof candidate.cwd !== "string")
    ) {
      throw new ValidationError(`Acceptance test ${index + 1} is invalid.`);
    }
    if (ids.has(candidate.id)) {
      throw new ValidationError(`Duplicate acceptance test id: ${candidate.id}`);
    }
    ids.add(candidate.id);
    return {
      id: candidate.id,
      title: candidate.title,
      command: candidate.command,
      args: candidate.args,
      ...(typeof candidate.cwd === "string" ? { cwd: candidate.cwd } : {}),
    };
  });
  return { tests };
}

function parseCodegenPayload(payload: unknown): CodegenPayload {
  if (!isRecord(payload) || !Array.isArray(payload.files)) {
    throw new ValidationError("Code generation must return a files array.");
  }
  return {
    files: payload.files.map((candidate, index) => {
      if (
        !isRecord(candidate) ||
        typeof candidate.path !== "string" ||
        typeof candidate.content !== "string"
      ) {
        throw new ValidationError(`Code generation file ${index + 1} is invalid.`);
      }
      return { path: candidate.path, content: candidate.content };
    }),
  };
}

function parseCritiquePayload(payload: unknown): CritiquePayload {
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.violations) ||
    !payload.violations.every((value) => typeof value === "string") ||
    !Array.isArray(payload.flags) ||
    !payload.flags.every((value) => typeof value === "string")
  ) {
    throw new ValidationError("Critique must return string arrays for violations and flags.");
  }
  return {
    violations: payload.violations,
    flags: payload.flags,
  };
}

function parseAdrDraftPayload(payload: unknown): AdrDraftPayload {
  if (
    !isRecord(payload) ||
    typeof payload.title !== "string" ||
    typeof payload.context !== "string" ||
    typeof payload.decision !== "string" ||
    !Array.isArray(payload.alternativesRejected) ||
    !payload.alternativesRejected.every((value) => typeof value === "string") ||
    !Array.isArray(payload.consequences) ||
    !payload.consequences.every((value) => typeof value === "string")
  ) {
    throw new ValidationError("ADR draft payload is invalid.");
  }
  return {
    title: payload.title,
    context: payload.context,
    decision: payload.decision,
    alternativesRejected: payload.alternativesRejected,
    consequences: payload.consequences,
  };
}

function validateGateDecision(decision: GateDecision): void {
  if (
    !["approve", "reject", "edit"].includes(decision.verdict) ||
    decision.reasonText.trim() === ""
  ) {
    throw new ValidationError("Gate decision requires a verdict and prose reason.");
  }
  validateWrittenProse("gate reason", decision.reasonText);
  if (decision.verdict !== "edit" && decision.edits && decision.edits.length > 0) {
    throw new ValidationError("Only an edit verdict may include file edits.");
  }
}

function renderEditDiff(files: FileWrite[]): string {
  return files
    .map(
      (file) =>
        `--- ${file.path}\n+++ ${file.path}\n@@ complete replacement @@\n${file.content}`,
    )
    .join("\n");
}

function terminalAdrTitle(outcome: RunOutcome): string {
  switch (outcome) {
    case "shipped":
      return "Ship loop completed";
    case "halted_attempts":
      return "Ship loop halted at attempt bound";
    case "halted_budget":
      return "Ship loop halted at budget bound";
    case "rejected":
      return "Ship loop rejected at human gate";
  }
}
