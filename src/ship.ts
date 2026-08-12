import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { hostname } from "node:os";
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
  type ADR,
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
import { newRunId, readAdrs, validateWrittenProse } from "./company.js";
import {
  AccountingInvariantError,
  AppendOnlyViolationError,
  AttemptsHaltError,
  BudgetHaltError,
  RejectedRunError,
  RunHaltError,
  ValidationError,
} from "./errors.js";
import {
  hashDirectory,
  isNodeError,
  resolveContainedWritePath,
  resolveRepoPath,
  writeAtomic,
  writeNewFile,
} from "./files.js";
import { barrier } from "./barrier.js";
import { CompanyLedger, canonicalRecordJson } from "./ledger.js";
import { createRouteLog, route } from "./router.js";

/** The single capability root agents and gates may write. */
const PRODUCT_ROOT = "product";

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

  // F4: run-start evidence is durable BEFORE the first possible spend. An unmatched start
  // record means the run was interrupted, and must never be read as success — the same
  // two-event rule the program ledger applies to itself.
  await writeRunArtifact(root, runId, "started.json", {
    schema_version: 1,
    run_id: runId,
    spec_id: spec.id,
    task: spec.text,
    hard_cost_ceiling_usd: config.bounds.maxCostPerRunUsdExclusive,
    owner: { pid: process.pid, host: hostname() },
    started_at: now().toISOString(),
    caused_by: [causeAdr.id],
  });

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
    const pair = await ledger.transact({ operation: "allocate-call", runId }, (tx) =>
      tx.allocateRouteCall(),
    );
    const routeLogId = pair.route_id;
    const callId = pair.call_id;
    const traceRef = ledger.callTraceRef(runId, callId);

    // F4: call-start evidence is durable BEFORE the agent is invoked. A call killed in flight
    // is still attributable to this run, this route, and these exact ceilings — which is what
    // lets recovery settle it conservatively instead of guessing what it spent.
    await writeRunArtifact(root, runId, `calls/${callId}.started.json`, {
      schema_version: 1,
      run_id: runId,
      call_id: callId,
      route_id: routeLogId,
      spec_id: spec.id,
      task_kind: taskKind,
      model: decision.model,
      tier: decision.tier,
      hard_cost_ceiling_usd: projection.maxCostUsd,
      hard_token_ceiling: projection.maxTokens,
      reservation_id: reservationId,
      started_at: now().toISOString(),
      caused_by: [routeLogId, spec.id],
    });

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
      const routeLog = createRouteLog({
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
      });
      await ledger.transact({ operation: "append-route", runId }, (tx) =>
        tx.appendRouteLog(routeLog),
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
    // Allocation and append share one critical section here: there is no agent call between
    // them, so amendment A-01's split does not apply.
    gateLabel = await ledger.transact({ operation: "gate-label", runId }, async (tx) => {
      const issued = await tx.allocate({ LABEL: 1 });
      const labelId = issued.LABEL[0];
      if (labelId === undefined) {
        throw new AccountingInvariantError("The allocator returned no gate label identifier.");
      }
      const label: GateLabel = {
        id: labelId,
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
      await tx.appendGateLabel(label);
      return label;
    });

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
    // R2, F5-F7, and proposed amendment A-02. Pre-fix, this block called
    // `budget.assertSettled()` and `appendAdr()` directly, and a throw from either escaped the
    // `finally` before `appendTerminalEval` ran — so a run that had genuinely happened, and
    // genuinely spent money, could leave no terminal record at all.
    //
    // The A-02 semantic (directed by PREZ, pending formal ratification): a terminal EvalRow is
    // NEVER written without its OWN terminal ADR, and a historical causal ADR is never
    // substituted. `docs/v1-contract.md:26` requires each terminal run to create an ADR;
    // pointing `adr_id` at an older decision would make the row structurally valid and
    // semantically false — the exact false-success class this program exists to remove.
    // Instead, the COMPLETE intended ADR and the COMPLETE intended EvalRow are made durable in
    // the finalization intent BEFORE either canonical write. A failure after that point leaves
    // a run that is detectable (unmatched start, unresolved intent) and deterministically
    // completable by `tailered recover`, which replays the exact recorded payloads. A run can
    // therefore be: finalized, or recoverable, or (through recovery) quarantined — but never
    // half-recorded and never `shipped` without its own decision.
    const finalizationNotes: string[] = [];

    if (!specWritten) {
      try {
        await ledger.writeSpec(runId, spec);
      } catch (error) {
        finalizationNotes.push(`spec record failed: ${describeError(error)}`);
      }
    }

    try {
      budget.assertSettled();
    } catch (error) {
      if (outcome === "shipped") {
        outcome = "halted_budget";
      }
      finalizationNotes.push(`accounting invariant failed: ${describeError(error)}`);
    }

    const accounting = budget.snapshot();

    await ledger.transact({ operation: "finalize", runId }, async (tx) => {
      // Reserve BOTH identifiers up front. The increments are durable before use (S1), and
      // the intent below makes the reservation attributable even after a crash (S8).
      const issued = await tx.allocate({ EVAL: 1, ADR: 1 });
      const evalId = issued.EVAL[0];
      const adrId = issued.ADR[0];
      if (evalId === undefined || adrId === undefined) {
        throw new AccountingInvariantError(
          "The allocator returned no terminal eval or ADR identifier.",
        );
      }

      // Build the EXACT payloads once. Recovery must be able to replay them byte-for-byte,
      // so every field — including timestamps — is fixed here, before anything is written.
      const createdAt = now().toISOString();
      const terminalAdr: ADR = {
        id: adrId,
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
        caused_by: [spec.id, ...(gateLabel ? [gateLabel.id] : [])],
      };

      const combinedBlocker = [...(blocker ? [blocker] : []), ...finalizationNotes].join(" | ");
      const intendedEval: EvalRow = {
        id: evalId,
        run_id: runId,
        spec_id: spec.id,
        outcome,
        tests_passed: [...passed].sort(),
        tests_total: spec.acceptance_tests.length,
        tokens_by_tier: accounting.tokensByTier,
        wall_time_ms: Math.round(performance.now() - startedAt),
        cost_usd: accounting.settledUsd,
        ...(previewUrl ? { preview_url: previewUrl } : {}),
        adr_id: adrId,
        ...(gateLabel ? { gate_label_id: gateLabel.id } : {}),
        ...(combinedBlocker ? { blocker: combinedBlocker } : {}),
        created_at: createdAt,
        caused_by: [adrId, spec.id, ...(gateLabel ? [gateLabel.id] : [])],
      };

      // F5: the COMPLETE intent — both exact payloads plus their hashes — is durable before
      // any canonical mutation. This is FinalizationIntentV2; the v1 intent carried only
      // summary fields and could not support byte-exact recovery.
      await barrier("finalize:before-intent", runId);
      await writeRunArtifact(root, runId, "finalization-intent.json", {
        schema_version: 2,
        run_id: runId,
        spec_id: spec.id,
        adr: terminalAdr,
        eval: intendedEval,
        accounting: {
          settled_usd: accounting.settledUsd,
          tokens_by_tier: accounting.tokensByTier,
        },
        payload_sha256: {
          adr: sha256Hex(canonicalRecordJson(terminalAdr)),
          eval: sha256Hex(canonicalRecordJson(intendedEval)),
        },
        intent_written_at: createdAt,
        caused_by: [spec.id, adrId],
      });

      // A-02 ordering: the run's OWN decision first, the evaluation that references it second.
      // A failure of either write propagates: the run stays recoverable, and no fallback ADR
      // is ever substituted.
      await tx.appendReservedAdr(terminalAdr);
      terminalAdrId = adrId;

      await barrier("finalize:before-terminal-eval", runId);
      await tx.appendTerminalEval(intendedEval);
      evalRow = intendedEval;

      // F7: the marker is written last and means every artifact above is on disk.
      await barrier("finalize:before-marker", runId);
      await writeRunArtifact(root, runId, "finalized.json", {
        schema_version: 2,
        run_id: runId,
        eval_id: evalId,
        adr_id: adrId,
        ...(gateLabel ? { gate_label_id: gateLabel.id } : {}),
        outcome,
        finalized_at: now().toISOString(),
        caused_by: [evalId, adrId, spec.id],
      });
    });
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
    // The receipt reports the CANONICAL row's blocker, which includes finalization notes
    // (budget-assertion failures, spec-record failures). Reporting only the pre-finalization
    // blocker understated what the ledger records.
    ...(evalRow.blocker ? { blocker: evalRow.blocker } : {}),
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

/**
 * Applies externally supplied file writes — agent code generation, critique
 * repair, and founder gate edits all arrive here.
 *
 * Every destination is proven to lie beneath the canonical `product/` subtree
 * before anything is written. A string prefix test is not sufficient:
 * `product/../decisions/ADR-000.md` satisfies it while resolving onto an
 * accepted, immutable decision.
 */
async function applyProductFiles(root: string, files: FileWrite[]): Promise<void> {
  const resolved: Array<{ target: string; content: string }> = [];
  for (const file of files) {
    if (Buffer.byteLength(file.content) > 5_000_000) {
      throw new ValidationError(`File exceeds the 5 MB v1 limit: ${file.path}`);
    }
    resolved.push({
      target: await resolveContainedWritePath(root, PRODUCT_ROOT, file.path),
      content: file.content,
    });
  }

  // Every destination is contained before the first byte is written, so a
  // rejected batch cannot leave a partially applied artifact behind.
  for (const write of resolved) {
    await writeAtomic(write.target, write.content);
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

/**
 * Write a durable run artifact. Idempotent: an exact retry of an interrupted run re-writes the
 * same bytes and is a no-op, while different content for the same path is an integrity error.
 */
export async function writeRunArtifact(
  root: string,
  runId: string,
  relativeName: string,
  value: unknown,
): Promise<void> {
  const path = resolve(root, "evals/runs", runId, relativeName);
  const content = `${JSON.stringify(value, null, 2)}\n`;
  try {
    await writeNewFile(path, content);
  } catch (error) {
    if (!isNodeError(error) || error.code !== "EEXIST") throw error;
    const onDisk = await readFile(path, "utf8");
    if (onDisk === content) return;
    throw new AppendOnlyViolationError(
      `evals/runs/${runId}/${relativeName} already exists with different content.`,
    );
  }
}

function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function describeError(error: unknown): string {
  if (error instanceof AggregateError) {
    return error.errors.map((inner) => describeError(inner)).join("; ");
  }
  return error instanceof Error ? error.message : String(error);
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
