# 17 — Adoption decision matrix

Every material component receives exactly one disposition: `ADOPT`, `ADAPT`, `REFERENCE`,
`INTEROPERATE`, `REPLACE`, `DEFER`, or `REJECT`.

`REPLACE` is used **zero** times. The seven-part evidence bar for it
(existing system understood, upstream materially stronger, migration cost acceptable,
license acceptable, invariants survive, regression risk bounded, rollback exists) is not met
by any component, principally because Tailered's platform is 3,615 lines with zero runtime
dependencies and a green executable definition of done, while both upstreams are large
multi-language systems whose most attractive properties are architectural rather than
importable.

## Decisions

| # | Upstream component | Tailered/Dime component affected | Disposition | Boundary | Why |
|---|---|---|---|---|---|
| 1 | `MemoryProvider` ABC + `MemoryManager` lifecycle (`agent/memory_provider.py:81`, 20 methods, 9 implementations) | New: memory adapter seam at Tailered `src/context.ts` / Dime chat context assembly | **REFERENCE** | Reimplement the contract, ~150 lines TS | The abstraction is the best idea in either repo and is what makes memory *optional*. Importing Python is not possible; the contract is. |
| 2 | Fail-open bounded prefetch (8 s join, 3+2 s turn-1 caps, stale-result discard, skip-on-overlap) | Any Dime memory pilot | **REFERENCE** | Design pattern | Correct discipline: memory degradation must degrade context only (HH-201). |
| 3 | Honcho as a memory **service** | Dime Chat personalization only | **INTEROPERATE — heavily gated** | HTTP, separate process, **one workspace per user** | Never as a library (AGPL, `15`). Gates below are cumulative and all are mandatory. |
| 4 | `honcho_conclude` model-write tool | — | **REJECT** | — | Model-authored durable belief, no checkpoint, no provenance, cross-peer reachable (HH-106, HH-114). |
| 5 | Memory-as-"authoritative" injection into the user message | — | **REJECT** | — | Trust elevation of LLM-derived content in the untrusted channel (HH-104, SEC-HH-01). |
| 6 | Hermes skill **format** (`SKILL.md` frontmatter) | Dime `.claude/skills/` (102 skills) | **REJECT (already present)** | — | Identical convention already in use. Adoption is a no-op, not a gain. |
| 7 | Autonomous skill writer + curator (`background_review.py`, `curator.py`) | — | **REJECT** | — | Unmeasured loop (HA-307), quota-driven with no quality signal (HA-308), default-on with approval off (HA-304), destructive delete without archive (HA-316). |
| 8 | The *idea* of outcome-linked procedural measurement | Dime skills; Tailered `evals/` | **REFERENCE** | Design lesson | Hermes proves the gap by omission. Tailered already stores the outcome data Hermes lacks — the join is cheap and is the differentiating move. |
| 9 | Kanban ownership model (CAS claim + TTL + `worker_pid` liveness + heartbeat) | Tailered ledger concurrency (Gate 0) | **REFERENCE** | Reimplement in TS | Correct ownership primitive. ~11,320 lines of SQLite Kanban is not importable; the pattern is. |
| 10 | Worktree-per-task workspace (`git worktree add`, `kanban_db.py:7346`) | Tailered parallel runs; Dime already uses worktrees | **REFERENCE** | Pattern | Dime already runs worktree isolation; Tailered would need it only after Gate 0. |
| 11 | `delegate_task` in-process subagents | — | **REJECT** | — | No filesystem/process isolation, advisory-only stale check (HA-402), config-driven privilege escalation (HA-408). Weaker than Dime's existing worktree practice. |
| 12 | Prompt-cache preservation (`api_content` sidecar, per-attempt breakpoint replanning) | Dime Chat; Tailered `RunContextCache` | **REFERENCE** | Design lesson | Genuinely well engineered (HA-108) and directly relevant to Dime Chat cost. Tailered's cache is per-run; this is the per-conversation analogue. |
| 13 | "Narrow waist" tool-schema discipline (every core tool is paid for on every call) | Dime agent tool surfaces | **REFERENCE** | Design lesson | `hermes-agent/AGENTS.md` states it as law; it is a good, cheap constraint to adopt in principle. |
| 14 | Hermes as a Tailered **process agent** (Architecture D) | Tailered `docs/agent-protocol.md` boundary | **DEFER** | stdin/stdout JSON, disposable worker | POC-A proves the boundary holds for mutation and accounting but **not execution**. Deferred behind Gate 0 and a measured POC-B, which is currently BLOCKED. |
| 15 | Hermes cost/accounting model | — | **REJECT** | — | No reserve-before-spend anywhere (HA-502); accounting is asynchronous, best-effort, and documented as losing deltas (HA-513). Adopting it would break `AGENTS.md:20`. |
| 16 | Hermes terminal backends (Docker/SSH/Modal/Daytona/Vercel) | Any future Tailered isolated worker | **DEFER** | — | Real capability, but Tailered needs one disposable worker, not seven backends. Revisit only if POC-B proceeds. |
| 17 | Honcho epistemic model as *canonical* store | Dime projections/warehouse | **REJECT** | — | Absolute. See `12-dime-ai-opportunity-matrix.md`: memory must never become sports-model evidence. |
| 18 | Honcho SDKs (`sdks/`) | — | **DEFER** | — | Only relevant if #3 proceeds; license per-SDK is assessed in `15`. |

### Mandatory gates on decision #3 (all cumulative)

Lane B's Honcho audit arrived after the table above was drafted and materially raised the
bar. The `INTEROPERATE` disposition survives only with every one of these:

| Gate | Because |
|---|---|
| `USE_AUTH=True`, asserted at deploy and smoke-tested | Auth is **off by default and fails open to full admin** with no startup warning (SEC-O-03) |
| **One workspace per user** — never per-peer separation inside a shared workspace | A peer-scoped key can join itself to any session in the workspace and read its messages (SEC-O-01, CRITICAL); `clone_session` has no workspace predicate (HO-102) |
| No cross-peer tool surface exposed to the model | Unvalidated model-controlled `peer` argument enables cross-peer read **and write** (HH-106) |
| Memory treated as **best-effort, never load-bearing** | Memory is silently lost at three points and the status endpoint reports errored items as completed (HO-404 CRITICAL, HO-406, HO-214, HO-414) |
| Application-level erasure proven by test, or non-derived memory only | Deletion does not cascade to derived conclusions, higher-order conclusions, or peer cards; there is **no individual-message delete** (SEC-O-04, HO-101, HO-113) |
| Cost metered on the consumer side | Upstream's own cost calculator reports **$0.00** for every reasoning level (HO-319) and its efficiency metric excludes ingestion (HO-508) |
| Explicit provider configuration | All content goes to **OpenAI by default**, contrary to the README (SEC-O-13) |
| No upstream benchmark number used in any decision | The headline claim is unreproducible from the repo and the in-repo LoCoMo comparison excludes adversarial questions for Honcho but not the baseline (HO-501, HO-502 CRITICAL) |

If any gate cannot be met, decision #3 degrades to **DEFER**, and the memory seam (#1) is
built against a provider that can meet them — which is precisely why the seam is specified
independently of any vendor.

## Dispositions by count

`REFERENCE` 7 · `REJECT` 7 · `DEFER` 3 · `INTEROPERATE` 1 · `ADOPT` 0 · `ADAPT` 0 · `REPLACE` 0.

**Zero components are adopted as-is.** One is integrated behind a service boundary, and only
under gates. The dominant outcome is `REFERENCE` — the durable value in these two
repositories is architectural knowledge, not importable code.

## If only three things are taken

The audit was asked to name the few components worth using if most are not. They are:

1. **The `MemoryProvider` contract** (#1) — makes memory a replaceable adapter that can fail
   without taking the agent down. Reimplement, do not import.
2. **The fail-open bounded-prefetch discipline** (#2) — the operational half of #1, and the
   reason a memory outage is a quality event rather than an availability event.
3. **The CAS-claim ownership pattern** (#9) — the correct primitive for the ledger
   concurrency work that POC-C proved is required *before* any parallelism story is true.

Everything else is either already present, unmeasured, or refused.

---

## Draft ADR for founder decision — NOT accepted by this audit

Under `AGENTS.md:17` humans own intent and machines own implementation, and under
`AGENTS.md:27` accepted decisions are immutable. An adoption decision is intent. This audit
therefore **does not** append to `decisions/`. The text below is a draft for the founder to
accept, edit, or reject at a gate.

```markdown
<!-- tailered: {"id":"ADR-004","status":"proposed","caused_by":["ADR-003"]} -->
# ADR-004: Treat Hermes and Honcho as reference architectures, not dependencies

## Context

An evidence-first audit of NousResearch/hermes-agent (MIT, ed5e17f4) and
plastic-labs/honcho (AGPL-3.0, a92fb1e0) assessed both as candidate contributors to
Tailered AI, Tailered OS, and Dime AI. Executed proof of concept established that
Tailered's process boundary contains agent mutation and accounting but not execution,
and that Tailered's own ledger is not concurrency-safe.

## Decision

Adopt no upstream component as a dependency. Reimplement three architectural ideas —
the memory-provider contract, fail-open bounded prefetch, and compare-and-swap task
ownership — in Tailered's own zero-dependency TypeScript. Integrate Honcho, if at all,
only as an external service behind a per-tenant boundary with authentication enabled,
and never as linked source. Make ledger concurrency-safety a prerequisite for any
parallel-execution work.

## Alternatives rejected

- Adopt Hermes as the Tailered process agent now: its accounting model has no
  reserve-before-spend and would violate the platform's fourth operating law.
- Adopt Hermes's autonomous skill writer: the learning loop is unmeasured, so the
  capability cannot be shown to help and cannot be governed by evidence.
- Use Honcho as a store of record for any Dime prediction input: derived belief must
  never enter authoritative model state.

## Consequences

- Tailered keeps its zero-dependency runtime and its executable definition of done.
- Memory becomes a replaceable adapter with an explicit authority ceiling.
- Parallelism work is gated behind ledger concurrency-safety rather than assumed.
- Any Honcho integration carries an AGPL service boundary and counsel review.
```
