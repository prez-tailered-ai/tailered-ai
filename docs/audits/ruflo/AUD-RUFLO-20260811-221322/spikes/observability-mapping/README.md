<!-- audit: {"audit_id":"AUD-RUFLO-20260811-221322","tailered_sha":"6172653e0aca0981d0abaf4ad8e9d587667737e9","ruflo_release":"v3.37.0","ruflo_sha":"6ce18b5a7fcd4939a2f72c2e3b8fdbdec660e5a9","generated":"2026-08-11T23:00:00Z","evidence_class":"MIXED","lane":"AUD-L7b","caused_by":["AUD-RUFLO-20260811-221322/01-audit-charter.md"]} -->

# Spike C — Observability mapping

## Question

Can Ruflo's event/telemetry output be mapped onto Tailered's `RouteLog` and `AgentCallTrace`
well enough to **enrich** a Tailered trace, without ever becoming the canonical ledger?

## Tailered's target shape

From `src/contracts.ts`:

- `RouteLog` (lines 151-167) — `id`, `call_id`, `run_id`, `task_kind`, `tier`, `model`,
  `reason`, `attempts`, `tokens {input, output}`, `cost_usd`, `status`, `context`,
  `trace_ref`, `created_at`, `caused_by`.
- `AgentCallTrace` (lines 182-200) — `id`, `route_log_id`, `run_id`, `task_kind`, `tier`,
  `model`, `status`, `signals`, `spec_id`, `context_ref`, `projection`,
  `usage {input, output, cost_usd}`, `payload`, `failure_output`, `error`, `created_at`,
  `caused_by`.
- `ContextTelemetry` (lines 169-175) — `repo_hash`, `snapshot_ref`, `bytes`, `cache_hit`,
  `assembly_ms`.

## Field-by-field mapping

Sources are the published `@claude-flow/cli@3.37.0` dist tree
(`/tmp/aud-ruflo-20260811/work/extract/cli/package/dist/src/…`) and observed runtime output.
Fidelity is judged against the Tailered semantics, not against Ruflo's own intent.

| Tailered field | Ruflo source (file:line / observed output) | Available? | Fidelity |
| --- | --- | --- | --- |
| `RouteLog.id` | none | **no** | Ruflo has no route-log record type at all |
| `RouteLog.run_id` / `AgentCallTrace.run_id` | no run concept; `hooks pre-task` emits a per-invocation `taskId` (`task-mspbjuxk`) | **no** | a task id is not a run id; it is not persisted with the task store (different id scheme — see below) |
| `call_id` | none | **no** | there is no per-model-call identity anywhere reachable |
| `task_kind` | `task_create.type` free string (`task-tools.js:50`); `hooks pre-task` → `complexity: "low"` | **partial** | free-form user string; no closed set, no mapping to Tailered's 6 `TaskKind` values. Requires a Tailered-side classifier. |
| `model` | `.claude-flow/agents/store.json` → `"model": "sonnet"`, `"modelRoutedBy": "default"` (observed); `ruvector/enhanced-model-router.js` route result | **yes, low value** | a hardcoded per-agent default, not the model a call actually used. **Violates Tailered's "model identity only from `tailered.config.json`" law** — Ruflo introduces a second active registry (`ruvector/model-prices.js` + agent store defaults). |
| `tier` | router `tier: 1..n` (`hooks-tools.js:1229,1247`) | **partial** | Ruflo's tier is a *complexity/handler* tier (tier 1 = deterministic codemod, $0), not Tailered's `frontier|mid|cheap` cost tier. Semantically different axis. |
| `reason` | `hooks pre-task` → `reason: "Primary agent for coder tasks based on learned patterns"` | **partial** | prose recommendation text for an *agent type*, not a routing justification for a model choice |
| `attempts` / `RouteSignals` | none | **no** | Ruflo has no attempt counter; Tailered's stateless router requires the caller to supply it, so this is fine — but Ruflo cannot supply it either |
| `tokens.input` / `tokens.output` | `.swarm/model-router-trajectories.jsonl` `outcome.tokens.{input,output}` (read at `hooks-tools.js:3416-3428`) | **conditionally** | the file **did not exist** after every command in this audit (VERIFIED absent). Written only by an executing model-router path that requires credentials. |
| `cost_usd` | same trajectory file: `outcome.cost_usd`; router `estimatedCost` | **conditionally / advisory** | see Spike D — floating-point, hardcoded per-tier estimates, static price table |
| `status` (`completed｜failed｜accounting_violation`) | task `status` (`pending｜in_progress｜completed`); command exit codes | **partial** | task status describes an assignment, not a model call. `accounting_violation` has no Ruflo analogue. |
| `error` / `failure_output` | stderr text only | **partial** | not structured; some failures are native SIGABRT with no capturable error object (Spike E) |
| `context` (`ContextTelemetry`) | `.claude-flow/metrics/codebase-map.json` → `{timestamp, projectRoot, structure{4 booleans}, scannedAt}` | **no** | no `repo_hash`, no `snapshot_ref`, no `bytes`, no `cache_hit`, no `assembly_ms`. Four booleans about file existence is not a context snapshot. |
| `trace_ref` / `context_ref` | none | **no** | no content-addressed snapshot store exists |
| `projection` (`maxCostUsd`, `maxTokens`) | router `estimatedCost` constants | **no** | an estimate is not a ceiling; nothing binds a call to it |
| `payload` | task `result` field (`task-tools.js` `task_complete`) | **partial** | free-form object, written only by an explicit `task_complete` call |
| `spec_id` | none | **no** | no spec concept |
| `created_at` | ISO timestamps throughout (`createdAt`, `timestamp`) | **yes** | good fidelity, ms precision |
| `caused_by` | **none anywhere** | **no** | no causal-link field exists in any Ruflo record. Every Ruflo record is a causal orphan. |

### The one record type with real structure

`.claude-flow/policy/state.json` `receipts[]` is the only hash-linked record Ruflo produces:

```json
{ "payload": { "receiptId": "sha256:99c7e199…", "previousReceiptHash": null, "sequence": 0,
               "issuedAt": 1786491606682,
               "request": { "identity": {"id":"legacy-cli","type":"legacy"},
                            "action": {"type":"mcp.tool.call","resource":"swarm_init",
                                       "network":false,"destructive":false},
                            "context": {"metadata":{"inputDigest":"sha256:a99a54cd…"}},
                            "requestId": "2a2e3d12-…" },
               "decision": { "outcome":"allowed", "mode":"legacy",
                             "reason":"legacy-default-allow", "matchedRules":[] },
               "policyHash": "sha256:00b63b2f…" },
  "hash": "sha256:006f9efe…" }
```

This gives `requestId` (≈ call id), `issuedAt`, `inputDigest` (≈ context hash), a
`previousReceiptHash` chain, and a verifiable ledger (`policy status` → `"ledger": {"valid":
true, "length": 27}`). It carries **no model, no tier, no tokens, and no cost** — it is an
authorization ledger, not a metering ledger. Its integrity key lives outside the repo (see
RUF-731 in Spike D), so it is **not portable evidence**.

## Findings

### RUF-720 — CRITICAL — `swarm status` fabricates telemetry for swarms that do not exist

```
$ ruflo swarm status zzz-not-a-swarm --format json      # exit 0
{
  "id": "zzz-not-a-swarm",
  "status": "running",
  "objective": "Add a --json flag to the Tailered dashboard CLI and document it",
  "strategy": "development",
  "agents": { "total": 3, "active": 1, "idle": 2, "completed": 0 },
  "progress": 5,
  "tasks": { "total": 0, "completed": 0, "inProgress": 0, "pending": 0 }
}
```

Every field is wrong in a different way, and the command exits 0:

- `id` — echoed straight back from argv. Source: `swarm.js:181`
  `id: swarmId || swarmState?.id || 'no-active-swarm'`. No validation against any store.
- `objective`, `strategy`, `status` — borrowed from the single-slot `.swarm/state.json`, which
  belongs to a **different** swarm.
- `agents` — the global agent registry, not this swarm's roster.
- `progress: 5` — a **hardcoded literal**. Source: `swarm.js:165-168`
  `else if (swarmState) { progress = 5; }`.
- `tasks.total: 0` — while `.claude-flow/tasks/store.json` held **5** tasks at that moment.
  `getSwarmStatus` reads `.swarm/tasks/` (a directory that is never created), not the store
  that `task create` writes.

Run with no argument, the same code prints `Swarm Status: no-active-swarm` with the *identical*
`5.0%` progress and `23s` elapsed — while two swarms sit in
`.claude-flow/swarm/swarm-state.json` with `status: "running"`.

**Ruflo's primary status surface is not evidence of anything.** Ingesting it into a Tailered
trace would inject fabricated state into an append-only ledger.
Evidence: `evidence/swarm-status.out`, `evidence/exitcodes.out`.

### RUF-721 — HIGH — `Tokens Used`, `Success Rate`, `Consensus Rounds` are structurally unpopulated

`swarm status` renders a "Performance Metrics" and "Coordination" block. Their sources:

- `tokensUsed` ← `swarmState?.tokensUsed` — never written by any code path observed.
- `successRate` ← computed from `.swarm/tasks/*.json` — a directory Ruflo never creates.
- `consensusRounds` / `messagesSent` / `conflictsResolved` ← counted from
  `.swarm/coordination/*.json` (`swarm.js:249-291`) — a directory Ruflo never creates.

Observed output: `Tokens Used: unknown`, `Success Rate: no data`, `Consensus Rounds: 0`,
`Messages Sent: 0`, `Conflicts Resolved: 0`. These are not "zero so far" — they are readings
from stores that no writer populates. A dashboard built on them would show a permanently
healthy, permanently idle system.

### RUF-722 — HIGH — no `caused_by` and no run scope anywhere

Every Ruflo record (`tasks/store.json`, `agents/store.json`, `swarm-state.json`,
`policy/state.json` receipts, `metrics/*.json`) lacks any causal-link field. There is no run
identifier that spans a swarm, its agents, its tasks, and its policy receipts.

Tailered's operating law is explicit: *"Every persisted record carries `caused_by`; unlinked
records invalidate the company format."* Ruflo cannot supply the field, and cannot supply the
run scope that would make one derivable. Any Tailered-side ingestion must **synthesise**
`caused_by` and `run_id` at the boundary, which means the Tailered adapter — not Ruflo — is the
origin of causality.

### RUF-723 — MEDIUM — two incompatible ID schemes for the same entity type

Observed in the same repository:

- `agent spawn -t coder --name alpha-coder` → `agent-1786491716323-ul4b66`
- `agent spawn -t coder` (later, different code path) → `coder-mspbik6r`
- `task create` → `task-1786491857674-4of0nc`
- `hooks pre-task` → `task-mspbjuxk` (never written to the task store)

Two timestamp formats, two prefix conventions, and a `hooks` task id that exists in no store.
Joining Ruflo telemetry across surfaces by ID is unreliable.
Evidence: `evidence/final.out`, `output-only-swarm/evidence/spawn.out`.

### RUF-724 — MEDIUM — `memory list --format json` truncates entry IDs

`memory retrieve --format json` → `"id": "entry_1786492024614_728445be3cccb9cb"`.
`memory list --format json` → `"id": "entry_1786492024614_"` (20 chars) for the same row.

This is in the JSON output, not a table column width, so a machine consumer cannot join a
listing to a retrieval by ID. Evidence: `subordinate-memory/evidence/mem1.out`,
`subordinate-memory/evidence/memory-db-direct-read.json`.

### RUF-725 — MEDIUM — `ruflo status --format json` aborts

The top-level status command terminated with SIGABRT (exit 134) in `better-sqlite3`'s native
destructor. There is no reliable "give me the whole picture" JSON surface.
Evidence: `evidence/final.out`.

## Verdict

**Ruflo telemetry cannot enrich a Tailered trace as-is, and must never be ingested
automatically.**

Of the 20 fields in `RouteLog` + `AgentCallTrace` + `ContextTelemetry`:

- **2 map cleanly** — `created_at`, and `payload` when `task_complete` is explicitly called.
- **6 map partially and require Tailered-side normalisation** — `task_kind`, `tier`, `model`,
  `reason`, `status`, `error`.
- **2 map only when credentialed execution occurs** — `tokens`, `cost_usd` (and then only as
  advisory floating-point; see Spike D).
- **10 have no Ruflo source at all** — `id`, `run_id`, `call_id`, `route_log_id`, `attempts`,
  `spec_id`, `context` (all five `ContextTelemetry` fields), `trace_ref`/`context_ref`,
  `projection`, `caused_by`.

The blocking issue is not coverage — it is **trustworthiness**. RUF-720 shows the primary
telemetry surface returns confident, well-formed, exit-0 JSON describing a swarm that does not
exist, mixing in another swarm's objective and the global agent registry, with a hardcoded
progress percentage. An append-only Tailered ledger has no mechanism to retract a fabricated
row.

**Recommended posture if Ruflo is ever adopted:**

1. Ruflo emits **nothing** directly into `evals/routes.jsonl` or the trace store.
2. A Tailered-owned adapter is the sole writer. It mints `run_id`, `call_id`, and `caused_by`
   itself, and stamps every Ruflo-derived field with an explicit provenance marker.
3. `swarm status` output is **excluded entirely** — it is not a data source.
4. Only two Ruflo artefacts are worth reading at all, and only as advisory attachments:
   the policy `receipts[]` chain (authorization events, hash-linked) and
   `.swarm/model-router-trajectories.jsonl` (token/cost outcomes, when it exists).

## What could not be determined without credentials

- The real content and fidelity of `.swarm/model-router-trajectories.jsonl`. It was **absent
  after every command in this audit** (VERIFIED). Its schema is known only from the reader at
  `hooks-tools.js:3400-3440` (`{type:"decision"|"outcome", ts, task_hash, complexity, tokens:
  {input,output}, cost_usd, ab_pair}`). Whether it is written per model call, per task, or per
  session is **UNKNOWN**.
- Whether an executing swarm emits richer per-call events over the MCP transport than the CLI
  exposes. **UNKNOWN.**
- Whether `tokensUsed` is ever populated by a credentialed path. **UNKNOWN** — no writer was
  found in the dist tree.
