export const V1_FEATURES = [
  "charter_interview",
  "repo_mint",
  "ship_loop",
  "dashboard_readonly",
] as const;

export const OUT_OF_SCOPE = [
  "seat_marketplace",
  "billing",
  "multiuser_auth",
  "ui_polish",
  "red_team_seat",
  "tailered_bench",
] as const;

export const BOUNDS = Object.freeze({
  maxAttemptsPerCheck: 3,
  maxCostPerRunUsd: 5,
  demoTimeMinutes: 10,
});

export const MODEL_REGISTRY = Object.freeze({
  frontier: "best-available",
  mid: "mid-available",
  cheap: "cheap-available",
});

export type ModelTier = keyof typeof MODEL_REGISTRY;
export type TaskKind =
  | "testgen"
  | "codegen"
  | "critique"
  | "narrate"
  | "adr_draft"
  | "judge";
export type GateVerdict = "approve" | "reject" | "edit";
export type RunOutcome =
  | "shipped"
  | "halted_attempts"
  | "halted_budget"
  | "rejected";
export type ADRWriteStatus = "proposed" | "accepted";
export type ADRRenderStatus = ADRWriteStatus | "superseded";

export interface Charter {
  id: "ADR-000";
  what: string;
  for_whom: string;
  winning_looks_like: string;
  constraints: string;
  prose: string;
}

export interface ADR {
  id: string;
  title: string;
  context: string;
  decision: string;
  alternatives_rejected: string[];
  consequences: string[];
  status: ADRWriteStatus;
  caused_by: string[];
  supersedes?: string;
}

export interface RenderedADR extends ADR {
  rendered_status: ADRRenderStatus;
}

export interface AcceptanceTest {
  id: string;
  title: string;
  command: string;
  args: string[];
  cwd?: string;
}

export interface Spec {
  id: string;
  text: string;
  acceptance_tests: AcceptanceTest[];
  caused_by: string[];
}

export interface FileWrite {
  path: string;
  content: string;
}

export interface GateDecision {
  verdict: GateVerdict;
  reasonText: string;
  edits?: FileWrite[];
}

export interface GateLabel {
  id: string;
  run_id: string;
  spec_id: string;
  artifact_hash: string;
  verdict: GateVerdict;
  edit_diff?: string;
  reason_text: string;
  context_snapshot: string;
  created_at: string;
  caused_by: string[];
}

export interface EvalRow {
  id: string;
  run_id: string;
  spec_id: string;
  outcome: RunOutcome;
  tests_passed: string[];
  tests_total: number;
  tokens_by_tier: Record<ModelTier, number>;
  wall_time_ms: number;
  cost_usd: number;
  preview_url?: string;
  adr_id: string;
  gate_label_id?: string;
  blocker?: string;
  created_at: string;
  caused_by: string[];
}

export interface RouteSignals {
  attempts: number;
}

export interface RouteDecision {
  task_kind: TaskKind;
  tier: ModelTier;
  model: string;
  reason: string;
  signals: RouteSignals;
}

export interface TokenUsage {
  input: number;
  output: number;
}

export interface RouteLog {
  id: string;
  run_id: string;
  task_kind: TaskKind;
  tier: ModelTier;
  model: string;
  reason: string;
  attempts: number;
  tokens: TokenUsage;
  cost_usd: number;
  created_at: string;
  caused_by: string[];
}

export interface AgentRequest {
  runId: string;
  taskKind: TaskKind;
  model: string;
  tier: ModelTier;
  signals: RouteSignals;
  spec: string;
  contextSnapshot: string;
  failureOutput?: string;
}

export interface AgentProjection {
  maxCostUsd: number;
  maxTokens: number;
}

export interface AgentResponse {
  payload: unknown;
  usage: TokenUsage & { costUsd: number };
}

export interface TestgenPayload {
  tests: AcceptanceTest[];
}

export interface CodegenPayload {
  files: FileWrite[];
}

export interface CritiquePayload {
  violations: string[];
  flags: string[];
}

export interface AdrDraftPayload {
  title: string;
  context: string;
  decision: string;
  alternativesRejected: string[];
  consequences: string[];
}

export interface ProcessAgentConfig {
  command: string;
  args: string[];
  timeoutMs: number;
  projections: Record<
    ModelTier,
    {
      maxCostUsd: number;
      maxTokens: number;
    }
  >;
}

export interface RunReceipt {
  runId: string;
  outcome: RunOutcome;
  costUsd: number;
  tokensByTier: Record<ModelTier, number>;
  wallTimeMs: number;
  previewUrl?: string;
  evalId: string;
  gateLabelId?: string;
  adrId: string;
  blocker?: string;
}
