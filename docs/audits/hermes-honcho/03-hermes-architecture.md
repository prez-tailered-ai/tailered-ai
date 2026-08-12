# 03 — Hermes architecture

Repository `NousResearch/hermes-agent` @ `ed5e17f4b86da0c4f09c0694757b6074ae6b9d16`,
MIT, 21,728 commits, 803 MB working tree, ~4,017 Python files and ~1,417 TypeScript files.
Static analysis; the system was not executed except for the isolated detector harness
described in `05`.

## What it is

A **single-tenant personal AI agent** that runs one agent core across a CLI, a messaging
gateway (~20 platforms), a TUI, and an Electron desktop app. Its own development guide
states the shape plainly (`AGENTS.md`): it "learns across sessions (memory + skills),
delegates to subagents, runs scheduled jobs, and drives a real terminal and browser," and
"is extended primarily through **plugins and skills**, not by growing the core."

This is a fundamentally different object from Tailered AI. Hermes optimizes for **one
operator's leverage across many surfaces**; Tailered optimizes for **one company's
auditable, bounded, replayable loop**. Neither is a substitute for the other, and most of
this audit's dispositions follow from that.

## Subsystem map

```
                     ┌───────────── ingress surfaces ─────────────┐
   CLI (cli.py)   TUI/tui_gateway   gateway/ (~20 platforms)   ACP adapter   api_server
                     └──────────────────┬─────────────────────────┘
                                        │  AIAgent construction (agent/agent_init.py)
                                        ▼
        ┌──────────────────── one turn: agent/conversation_loop.py ────────────────────┐
        │  prologue                     loop                        finalize          │
        │  turn_context.build_turn_ ->  outer: api_call_count <  ->  turn_finalizer.   │
        │  context (:430)               max_iterations (:1634)       finalize_turn(:70)│
        │   · session/task/turn ids     inner: retry < max_retries                     │
        │   · system prompt (cached)          (:2427)                · budget summary  │
        │   · idle + preflight compact  · rebuild api_messages       · micro-compaction│
        │   · pre_llm_call hook           from api_content sidecar   · durable persist │
        │   · MEMORY PREFETCH  ←─────────┐ (:1838, :1883-1897)       · hooks + result  │
        │   · crash-persist user row     │· cache breakpoints replan · SKILL REVIEW ───┼─┐
        └────────────────────────────────┼──────────────────────────────────────────────┘ │
                                         │                                                │
   ┌─────────────────────────────────────┴──────────┐                    ┌────────────────▼─────────┐
   │ memory: MemoryProvider ABC (20 methods)        │                    │ background_review fork   │
   │  9 providers · honcho · hindsight · mem0 · …   │                    │ writes ~/.hermes/skills  │
   └────────────────────────────────────────────────┘                    └──────────────────────────┘
                                        │
        ┌───────────────────────────────┴───────────────────────────────┐
        │ tools/registry.py (~86 tools) → dispatch (:801, NO gate)      │
        │  terminal · process · execute_code · browser · files · patch  │
        │  delegate_task · cronjob · skill_manage · kanban · MCP · CUA  │
        └───────────────────────────────────────────────────────────────┘
                                        │
   ┌────────────────────────────────────┴──────────────────────────────────┐
   │ execution backends (7): local (DEFAULT) · Docker · SSH · Singularity  │
   │                          Modal · Daytona · Vercel Sandbox             │
   └───────────────────────────────────────────────────────────────────────┘
                                        │
   ┌────────────────────────────────────┴──────────────────────────────────┐
   │ persistence: ONE SQLite file ~/.hermes/state.db, schema v25, 8 tables │
   │  sessions · messages · session_model_usage · system_prompts ·         │
   │  state_meta · gateway_routing · compression_locks · async_delegations │
   │  + FTS5 virtual tables                                                │
   └───────────────────────────────────────────────────────────────────────┘

   coordination (separate lane): hermes_cli/kanban_db.py — SQLite tasks, CAS claims,
   TTL + heartbeat + PID liveness, real OS-process workers, git worktrees per task
```

## Two structural properties that shape everything

`hermes-agent/AGENTS.md` names them as the lens for reviewing any change, and the code
honours both.

**1. Per-conversation prompt caching is sacred.** "Anything that mutates past context, swaps
toolsets, or rebuilds the system prompt mid-conversation invalidates that cache and
multiplies the user's cost."

This is not aspirational (HA-108). Every API call rebuilds `api_messages` by structurally
cloning history (`conversation_loop.py:1838`) and **replaying each message's `api_content`
sidecar so the wire prefix is byte-identical to what was originally sent**
(`:1883-1897`). The system prompt is built once per session in three tiers
(stable / context / volatile, `agent/system_prompt.py:152`); Anthropic `cache_control`
breakpoints are re-planned per request (`agent/prompt_caching.py:338`) and again per retry
after a failover (`:2492`). Tool schemas are resolved **once** at construction and are
identical on every call for the session's life (HA-117).

It is a strong tendency rather than a strict invariant — four code paths can rebuild the
system prompt mid-conversation (HA-107) — but the engineering is real and it is the single
most transferable idea in the runtime.

**2. The core is a narrow waist; capability lives at the edges.** "Every model tool we add
is sent on every API call, so the bar for a new *core* tool is high." Capability arrives as
CLI command + skill, a service-gated tool, or a plugin.

Both properties are worth borrowing as *principles* by Tailered AI. The narrow-waist rule
applies the moment Tailered agents gain a model-facing tool surface: every tool schema is
paid for on every call, so the bar for a core tool is permanently high. The prompt-cache
rule applies the moment Tailered agents hold multi-turn conversations — Tailered's context
cache is currently per-run and keyed by repo-state hash
([`src/context.ts:32-78`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/context.ts#L32-L78)),
which is the right primitive for a repository but not yet for a conversation.

## Provider layer: genuinely provider-agnostic for inference

One declarative `ProviderProfile` dataclass (`providers/base.py`) plus **34 plugin profiles**
under `plugins/model-providers/`, with a lazy registry and user-overridable plugin
directories (HA-209, HA-122). Failover is monotonic, identity-deduped, and re-derives
`api_mode` per entry, never revisiting an exhausted entry (HA-111). Failure classification
is large and deliberate: 30 `FailoverReason` values driving ~14 one-shot in-retry recoveries
plus 8 terminal ladders (HA-112).

The README claim "**Use any model you want… no code changes, no lock-in**" is `CONFIRMED`
for inference.

The **tool gateway is not** provider-neutral: `tools/managed_tool_gateway.py` is hardwired
to `nousresearch.com` and entitlement is a live Nous Portal account check (HA-209). The
lock-in claim is therefore scoped to inference, not to the full capability surface.

## Where the documentation and the code disagree

The audit's claim-to-code method found a consistent pattern: the runtime is *more* complex
than its own documentation, and the docs lag.

| Documented claim | Code reality | Verdict |
|---|---|---|
| `max_iterations` default 500 (`AGENTS.md:367`) | constructor defaults are **90** (`run_agent.py:446`, `agent/agent_init.py:470`) | `STALE`, **downgraded to LOW on verification** — every shipped entry path passes 500 explicitly, so the drift affects only direct library instantiation (HA-103) |
| "one-turn grace call" | `_budget_grace_call` is never set true anywhere | `DOCUMENTATION_ONLY` — dead code (HA-102) |
| `AGENTS.md` agent-loop pseudocode | contradicts the implementation in three material ways | `MISLEADING` (HA-104) |
| "never a synthetic user message injected mid-loop" | violated by at least **eleven** distinct sites (count raised on re-verification); the durable-persistence invariant is scoped to seven `_EPHEMERAL_SCAFFOLDING_FLAGS` and two Codex recovery nudges escape it | `MISLEADING` (HA-105, HA-106) |
| skill trigger = "a reminder to the model" (example config) | spawns an unattended background writer; defaults disagree (10 vs 15) | `MISLEADING` (HA-315) |
| `trajectory_compressor.py` (name implies runtime) | offline training-data tooling, not on the request path | naming hazard (HA-116, HA-507) |

None of these are security issues. They matter because they establish the **reliability of
the documentation as an evidence source**: for this repository, it is low, and every claim in
this audit was therefore taken from code.

## Scale and complexity as an adoption factor

- `agent/conversation_loop.py:run_conversation` is **one ~6,300-line synchronous function**
  with a doubly-nested loop and roughly 20 distinct terminal return shapes (HA-101) — inside
  a 7,757-line file.
- Verified line counts: `gateway/run.py` **28,226**; `cli.py` **18,915**;
  `hermes_cli/web_server.py` 18,110; `tui_gateway/server.py` 14,430;
  `hermes_cli/main.py` 12,814; `hermes_cli/kanban_db.py` 11,320; `hermes_state.py` 11,165;
  `run_agent.py` 8,303; `tools/approval.py` 4,553; `tools/delegate_tool.py` 4,356.
  Ten source files exceed 10,000 lines (HA-611). Total non-test Python is ~865K lines.
- Five distinct retry counters can extend a single turn beyond the model's own tool loop,
  each with an independent budget (HA-123).

For comparison, the entire Tailered AI platform is **3,615 lines with zero runtime
dependencies**. This asymmetry is the practical reason no `ADOPT` or `REPLACE` disposition
appears in `17`: the attractive properties of Hermes are architectural patterns that
Tailered can implement in tens of lines, while importing the implementations would mean
importing an operational surface two orders of magnitude larger than the system it serves.
