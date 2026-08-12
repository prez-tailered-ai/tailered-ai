# 22 — Raw evidence and audit provenance

## What this file is

The canonical audit corpus is artifacts `00`-`21` plus `23`-`26`. This file holds two things
that belong in the record but not in the canonical analysis: the structured lane inventory,
and findings produced during execution that are **outside the current audit scope**.

## Lane inventory

18 independent lane reports were produced by 53 subagents, then rated findings were passed
to adversarial verifiers. Lanes maintained one-writer ownership: no lane wrote another
lane's conclusions, and no lane wrote an audit artifact — the coordinator was the sole writer.

| Lane scope | Findings |
|---|---|
| Hermes: runtime and request lifecycle | 23 |
| Hermes: tools, providers, gateway, MCP | 20 |
| Hermes: skills and procedural learning | 18 |
| Hermes: multi-agent, delegation, cron | 17 |
| Hermes: adversarial security | 21 |
| Hermes: state, memory, observability, cost | 18 |
| Hermes: CI, packaging, licensing, maintenance | 29 |
| Honcho: data model and API surface | 16 |
| Honcho: deriver pipeline and epistemology | 19 |
| Honcho: retrieval, dialectic, embeddings | 22 |
| Honcho: queue, workers, consistency | 17 |
| Honcho: security, tenancy, deletion | 17 |
| Honcho: benchmarks, SDKs, deployment, licensing | 27 |
| Integration: the real Hermes↔Honcho binding | 13 |
| Integration: 13-scenario adversarial failure matrix | 17 |

## OUT OF CURRENT SCOPE — NOT A TARGET OF THIS AUDIT OR IMPLEMENTATION PROGRAM

The findings below were produced during an earlier, broader execution of this audit that
also examined a separate application repository. **That repository is not a target of this
audit or of the implementation program.** These findings are retained **only** as audit
provenance — removing them would falsify the record of what was actually executed.

They are excluded from the canonical evidence ledger, carry **no weight** in any Tailered AI
disposition, and their local file paths have been removed. Where an underlying engineering
principle applies to Tailered AI, that principle was re-derived and independently proved
against Tailered AI in the canonical artifacts; it is never inherited from this section.

Count: 49 findings, titles only.

- `DA-101` [INFORMATIONAL] Dime Chat DOES persist conversation history, server-side, indefinitely
- `DA-102` [INFORMATIONAL] Trace v1 generation-audit layer is LIVE in production (runtime-proven), with a 90-day restricted-payload purge
- `DA-103` [INFORMATIONAL] There is NO cross-session memory and NO user model — proof of absence
- `DA-104` [MEDIUM] System prompt = static blueprint-or-fallback + platform catalog + route directive; production runs the FALLBACK
- `DA-105` [INFORMATIONAL] Retrieval grounding is a server-side pre-fetch injected as a fake turn pair — the model has NO tools
- `DA-106` [INFORMATIONAL] dimeAgent (Claude Code subprocess runtime) exists with strong env isolation but has ZERO product call sites
- `DA-107` [INFORMATIONAL] piAgent (in-process pi-agent-core runtime) exists with app-defined tools and a model allowlist — also zero product call sites
- `DA-108` [INFORMATIONAL] No procedural-learning or skill-reuse mechanism exists in the PRODUCT
- `DA-109` [INFORMATIONAL] Personalization today is four flags — three of them browser-local; no preference table exists
- `DA-110` [INFORMATIONAL] Dime Chat is OWNER-ONLY in production — paying subscribers are refused
- `DA-111` [LOW] The BROWSER owns the transcript sent to the model; the server never reconstructs history from the database
- `DA-112` [INFORMATIONAL] Two answer paths bypass the LLM entirely: deterministic math and route-forced refusals
- `DA-113` [INFORMATIONAL] Two additional model lanes exist as fail-closed frozen scaffolds (Dime 1.0, Research Alpha)
- `DA-114` [INFORMATIONAL] Production talks to Anthropic directly — no gateway is configured
- `DA-115` [LOW] Two concurrent persistence writers exist for the same thread/message tables
- `DA-116` [INFORMATIONAL] Retry, idempotency, abort and crash-recovery semantics are fully modeled at the turn/generation level
- `DA-117` [LOW] Account deletion enumerates the chat tables, but `dime_chat_messages` and `dime_chat_trace_events` are not in the list
- `DA-201` [INFORMATIONAL] Authoritative prediction truth lives in eight deterministic-pipeline tables, none of which any LLM module touches
- `DA-202` [INFORMATIONAL] VERIFIED NEGATIVE: zero paths exist by which model/LLM narration can write prediction-authoritative state
- `DA-203` [INFORMATIONAL] The chat-to-projections read path is a single auth-gated SELECT with no write capability in the module
- `DA-204` [MEDIUM] Chat context pool falls back to the read-write DATABASE_URL credential; SELECT-only is convention, not a grant
- `DA-205` [HIGH] The numeric-grounding allowlist is seeded from client-supplied user-message text — the exact vector by which a memory layer would launder remembered numbers into grounded claims
- `DA-206` [MEDIUM] games.updateProjections is an owner-gated tRPC mutation that writes arbitrary strings directly into model projection columns, bypassing the pipeline
- `DA-207` [LOW] The only self-modifying model path (drift detector patching engine constants) is human-gated by default, with a logged escape hatch
- `DA-208` [INFORMATIONAL] A complete calibration/backtest stack already exists and is sufficient to prove memory non-contamination empirically
- `DA-209` [INFORMATIONAL] No memory or personalization layer exists in the codebase today — the boundary can be designed rather than retrofitted
- `DA-210` [MEDIUM] feedGating is not a universal chokepoint: the chat context reads raw model columns, bypassing stripGameModelFields
- `DA-211` [INFORMATIONAL] Documented feed data contract matches the implemented gating, and correctly scopes itself to read procedures only
- `TA-101` [INFORMATIONAL] Skill arsenal is large, multi-source, and wired identically into three harnesses
- `TA-102` [INFORMATIONAL] Skills and governance artifacts are agent-authored under human ownership
- `TA-103` [MEDIUM] GAP: zero measurement of skill usage anywhere in the program
- `TA-104` [INFORMATIONAL] Subagent delegation and parallel dispatch already exist as first-class procedure
- `TA-105` [INFORMATIONAL] Worktree isolation is in heavy production use, not aspirational
- `TA-106` [INFORMATIONAL] Four distinct agent runtimes share one corpus and one law set
- `TA-107` [INFORMATIONAL] Permission/approval gating for dangerous tools exists in three independent layers
- `TA-108` [INFORMATIONAL] Verification/gating: 42 workflows, 9 required contexts, db-push law, post-deploy smoke
- `TA-109` [INFORMATIONAL] design-federation and engineering-federation are the existing control loops, and are themselves CI-gated
- `TA-110` [INFORMATIONAL] /os/ is a full agent-governance program with test-backed invariants
- `TA-111` [MEDIUM] Cost observability exists and is measured, but is strictly post-hoc — no pre-spend ceiling in Dime
- `TA-112` [INFORMATIONAL] The sibling tailered-ai repo already implements a hard reserve/settle cost ceiling
- `TA-113` [INFORMATIONAL] Cron/scheduled runs exist at scale, but no scheduled run spends model tokens
- `TA-114` [LOW] Session persistence: durable for Claude Code and pi CLI, explicitly in-memory for the embedded runtime
- `TA-115` [INFORMATIONAL] Browser automation exists twice over, with a hard routing law
- `TA-116` [INFORMATIONAL] MCP: repo-level config is deliberately empty; integration comes from plugins and user scope, with a hardened deny posture
- `TA-117` [LOW] Task/kanban coordination is real but split across three non-unified systems
- `TA-118` [INFORMATIONAL] One-shot execution ledger: hash-chained, tamper-evident, with honestly stated limits
- `TA-119` [INFORMATIONAL] A parallel-lane execution engine with structural violation detection exists on the current branch
- `TA-120` [INFORMATIONAL] platform/tailered-os/ is an embedded but operationally isolated app with its own path-scoped CI and a hard upstream pin gate
- `TA-121` [INFORMATIONAL] Harness bootstrap is self-healing and offline, and injects law on every single prompt

## Structured source data

Each lane returned a JSON object validated against a fixed schema (summary, subsystem map,
findings with mandatory citations, claim matrix, blockers). Regenerate the canonical ledger
from those objects with the tooling described in
[23-reproduction-instructions.md](23-reproduction-instructions.md).

