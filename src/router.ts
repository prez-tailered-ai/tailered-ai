import {
  type AgentCallStatus,
  type ContextTelemetry,
  type ModelRegistry,
  type RouteDecision,
  type RouteLog,
  type RouteSignals,
  type TaskKind,
  type TokenUsage,
} from "./contracts.js";

export function route(
  taskKind: TaskKind,
  signals: RouteSignals,
  registry: ModelRegistry,
): RouteDecision {
  if (!Number.isSafeInteger(signals.attempts) || signals.attempts < 0) {
    throw new TypeError("Router attempts signal must be a non-negative integer.");
  }

  if (taskKind === "codegen" && signals.attempts === 2) {
    return {
      task_kind: taskKind,
      tier: "frontier",
      model: registry.frontier,
      reason: "Third code-generation attempt escalates after two failed mid-tier attempts.",
      signals: { ...signals },
    };
  }

  const tier =
    taskKind === "testgen" || taskKind === "critique" || taskKind === "codegen"
      ? "mid"
      : taskKind === "judge"
        ? "frontier"
        : "cheap";

  return {
    task_kind: taskKind,
    tier,
    model: registry[tier],
    reason:
      taskKind === "codegen"
        ? "Code generation remains mid-tier until the third attempt."
        : `${taskKind} maps to the ${tier} tier by task policy.`,
    signals: { ...signals },
  };
}

export function createRouteLog(input: {
  id: string;
  callId: string;
  runId: string;
  decision: RouteDecision;
  usage: TokenUsage;
  costUsd: number;
  status: AgentCallStatus;
  context: ContextTelemetry;
  traceRef: string;
  causedBy: string[];
  createdAt: string;
}): RouteLog {
  return {
    id: input.id,
    call_id: input.callId,
    run_id: input.runId,
    task_kind: input.decision.task_kind,
    tier: input.decision.tier,
    model: input.decision.model,
    reason: input.decision.reason,
    attempts: input.decision.signals.attempts,
    tokens: { ...input.usage },
    cost_usd: input.costUsd,
    status: input.status,
    context: { ...input.context },
    trace_ref: input.traceRef,
    created_at: input.createdAt,
    caused_by: [...input.causedBy],
  };
}
