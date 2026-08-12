# 17 — Adoption decision matrix (Tailered AI)

Every material component receives exactly one disposition, evaluated **strictly against
[`prez-tailered-ai/tailered-ai`](https://github.com/prez-tailered-ai/tailered-ai)** as the
repository in which agents will be built, evaluated, and deployed.

Dispositions: `KEEP TAILERED` · `REFERENCE` · `ADAPT` · `INTEROPERATE` · `DEFER` · `REJECT` ·
`REPLACE`.

`REPLACE` is used **zero** times. Its seven-part evidence bar — existing system understood,
upstream materially stronger, migration cost acceptable, license acceptable, invariants
survive, regression risk bounded, rollback exists — is met by no component. The dominant
reason is structural rather than qualitative: Tailered is 3,615 lines of zero-dependency
TypeScript with a proven executable definition of done, while Hermes **cannot be packaged at
all** and Honcho's server is AGPL.

---

## Decisions

| # | Upstream component | Tailered component affected | Disposition | Boundary | Rationale |
|---|---|---|---|---|---|
| 1 | `MemoryProvider` ABC + `MemoryManager` lifecycle (20 methods, 9 implementations) | New memory seam at [`src/context.ts`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/context.ts) | **REFERENCE** | Reimplement the contract in ~150 lines TS | The best single idea in either repo: it makes memory *optional*, so a memory outage degrades context quality and nothing else (HH-201). Python cannot be imported; the contract can. |
| 2 | Fail-open bounded prefetch (8 s join, 3+2 s first-turn caps, stale-result discard, skip-on-overlap) | Any Tailered memory adapter | **REFERENCE** | Design pattern | The operational half of #1 and the reason memory failure is a quality event, not an availability event (HH-105). |
| 3 | Honcho as a memory **service** | Tailered contextual-memory layer, if built | **INTEROPERATE — heavily gated** | HTTP, separate process, unmodified server, **one workspace per isolation unit** | Never as a library (AGPL, `15`). All eight gates below are mandatory and cumulative. |
| 4 | `honcho_conclude`-style model-write memory tool | — | **REJECT** | — | Model-authored durable belief with no checkpoint, no validated provenance, and cross-peer reach (HH-106, HH-114, HO-204). |
| 5 | Memory-as-"authoritative" injection into the user channel | — | **REJECT** | — | Trust *elevation* of LLM-derived content in the untrusted channel (HH-104, SEC-HH-01). Directly contradicts Tailered's knowledge hierarchy (`18`). |
| 6 | Hermes skill **format** (`SKILL.md` + YAML frontmatter) | Future Tailered procedures | **ADAPT** | Format only | Tailered has no skills system, so there is nothing to duplicate. The format is a conventional, widely-implemented shape — cheap to adopt, and it carries no upstream dependency. |
| 7 | Autonomous skill writer + curator | — | **REJECT** | — | Unmeasured loop (HA-307), quotas with no quality signal (HA-308), default-on with approval off (HA-304), `delete` permanently `rmtree`s (HA-316). Importing a self-modifying writer into a constitution requiring proved completion is the wrong trade. |
| 8 | The *idea* of outcome-linked procedural measurement | New: `procedure_id` on `RouteLog` + `EvalRow` | **REFERENCE → TAILERED NEW** | One optional field, a query | Hermes proves the gap by omission. Tailered already stores the outcome data. See [26](26-procedure-outcome-architecture.md). |
| 9 | Kanban ownership (CAS claim + TTL + `worker_pid` liveness + heartbeat) | Ledger concurrency ([25](25-concurrency-remediation-contract.md)) | **REFERENCE** | Reimplement in TS | The correct ownership primitive, and the direct input to the concurrency prerequisite. 11,320 lines of SQLite Kanban is not importable; the pattern is. |
| 10 | Worktree-per-task workspace (`git worktree add`) | Future parallel Tailered workers | **REFERENCE** | Pattern | The right isolation model for a worker fleet — but only meaningful *after* the ledger is concurrency-safe. |
| 11 | `delegate_task` in-process subagents | — | **REJECT** | — | Context-isolated but not process- or filesystem-isolated; concurrent siblings share a filesystem and lost updates are reported, not prevented (HA-401, HA-402 as corrected). Weaker than what a platform needs. |
| 12 | Prompt-cache preservation (`api_content` sidecar, per-attempt breakpoint replanning) | Tailered context assembly, once agents hold conversations | **REFERENCE** | Design lesson | Genuinely well engineered (HA-108) and a real cost reduction. Tailered's cache is per-run and repo-hash-keyed — correct for a repository, not yet for a conversation. |
| 13 | "Narrow waist" tool-schema discipline | Future Tailered tool surface | **REFERENCE** | Design lesson | Every core tool is paid for on every API call. A cheap, permanent constraint worth adopting before a tool surface exists rather than after. |
| 14 | Hermes as a Tailered **process agent** (Architecture D) | [`docs/agent-protocol.md`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/docs/agent-protocol.md) boundary | **DEFER** | stdin/stdout JSON, disposable worker | POC-A proved the boundary bounds mutation and accounting but **not execution**. Blocked behind ledger remediation, an external cost-ceiling wrapper that does not exist, and a measured POC-B that is currently BLOCKED. |
| 15 | Hermes cost/accounting model | — | **REJECT** | — | No reserve-before-spend anywhere (HA-502); accounting async, best-effort, documented-lossy (HA-513). Adopting it would violate the platform's fourth operating law. |
| 16 | Hermes terminal backends (Docker/SSH/Modal/Daytona/Vercel) | Future isolated Tailered worker | **DEFER** | — | Real capability, but Tailered needs **one** disposable worker, not seven backends. Revisit only if #14 proceeds. |
| 17 | Honcho epistemic model as a **store of record** | Tailered ledgers | **REJECT** | — | No supersession, unreachable contradiction level, unread confidence, unvalidated provenance, silent derivation loss (`08`). Tailered's ledger is strictly stronger. |
| 18 | Honcho SDKs (`sdks/`) | — | **DEFER** | — | Only relevant if #3 proceeds, and their license is unresolved: Apache-2.0/MIT declared with **no license text in the tree** (LIC-O-02/03). Counsel review. |
| 19 | Honcho queue/worker error handling | — | **REJECT** | — | Any processing error permanently drops a queue item, with no retry, dead letter, or requeue (HO-404); the status endpoint reports errored items as completed (HO-414). |
| 20 | Honcho `ON CONFLICT DO NOTHING` claim primitive | Ledger concurrency ([25](25-concurrency-remediation-contract.md)) | **REFERENCE** | Pattern | The claim itself is genuinely race-free (HO-402) even though the surrounding error handling is not. Worth taking as a second reference alongside #9. |

## Mandatory gates on decision #3

The `INTEROPERATE` disposition survives **only** with every one of these. If any cannot be
met, #3 degrades to **DEFER** and the memory seam (#1) is built against a provider that can
meet them — which is precisely why the seam is specified independently of any vendor.

| Gate | Because |
|---|---|
| `USE_AUTH=True`, asserted at deploy and smoke-tested | Auth is **off by default and fails open to full admin** with no startup warning (SEC-O-03) |
| **One workspace per isolation unit** — never several units inside one workspace | A peer-scoped key can join itself to any session in the workspace and read its messages (SEC-O-01, CRITICAL); `clone_session` has no workspace predicate (HO-102) |
| No cross-peer tool surface exposed to any model | Unvalidated model-controlled `peer` argument enables cross-peer read **and write** (HH-106) |
| Memory treated as **best-effort, never load-bearing** | Silently lost at three points; the status endpoint reports errored items as completed (HO-404, HO-406, HO-214, HO-414) |
| Erasure proven by test, or non-derived memory only | Deletion does not cascade to derived conclusions, higher-order conclusions, or peer cards; there is **no individual-message delete** (SEC-O-04, HO-101, HO-113) |
| Memory spend metered **inside Tailered's reserve/settle path** | Upstream's own cost calculator reports **$0.00** for every reasoning level (HO-319) and its efficiency metric excludes ingestion (HO-508). An unmetered second spend channel would violate the fourth operating law |
| Explicit provider configuration | All content goes to **OpenAI by default**, contrary to the README (SEC-O-13) |
| No upstream benchmark number used in any decision | The headline claim is unreproducible from the repo, and the in-repo LoCoMo comparison excludes adversarial questions for Honcho but not for its baseline (HO-501, HO-502 CRITICAL) |

## Disposition counts (recalculated, Tailered-only)

| Disposition | Count |
|---|---|
| `REFERENCE` | 7 |
| `REJECT` | 7 |
| `DEFER` | 4 |
| `ADAPT` | 1 |
| `INTEROPERATE` | 1 |
| `KEEP TAILERED` | (see [12](12-tailered-agent-platform-opportunity.md) — the dominant outcome across the eight capability domains) |
| `ADOPT` | **0** |
| `REPLACE` | **0** |

**What changed from the earlier, wider-scoped tally.** The previous count was
`0 ADOPT · 0 ADAPT · 0 REPLACE · 1 INTEROPERATE · 7 REFERENCE · 3 DEFER · 7 REJECT`. Two
dispositions moved once the scope was locked to Tailered AI:

- **Skill format: `REJECT` → `ADAPT`.** It was previously rejected as *already present*
  elsewhere. Tailered AI has **no** skills system, so the duplication argument does not apply
  here and the format becomes a cheap, dependency-free adoption.
- **`DEFER` 3 → 4**, adding the Honcho SDKs, which are only reachable through decision #3 and
  carry an unresolved license.

No disposition changed because of a finding that depended on any out-of-scope system. Where a
principle originated in earlier work, it was re-derived and proved against Tailered AI's own
code before being carried here.

## If only three things are taken

1. **The `MemoryProvider` contract** (#1) — makes memory a replaceable adapter that can fail
   without taking the agent down.
2. **The CAS-claim ownership pattern** (#9, with #20) — the correct primitive for the ledger
   remediation that POC-C proved is required before any parallelism claim is true.
3. **Outcome-linked procedural measurement** (#8) — not taken *from* upstream but revealed
   *by* it: the one capability no system examined has, and the one Tailered is uniquely
   positioned to build.

---

## Draft ADR for founder decision — NOT accepted by this audit

Under the constitution, humans own intent and machines own implementation, and accepted
decisions are immutable. An adoption decision is intent. This audit therefore **does not**
append to `decisions/`. The text below is a draft for the founder to accept, edit, or reject
at a gate.

```markdown
<!-- tailered: {"id":"ADR-004","status":"proposed","caused_by":["ADR-003"]} -->
# ADR-004: Treat Hermes and Honcho as reference architectures, not dependencies

## Context

An evidence-first audit of NousResearch/hermes-agent (MIT, ed5e17f4) and
plastic-labs/honcho (AGPL-3.0, a92fb1e0) assessed both as candidate contributors to
Tailered AI as it becomes the repository in which agents are built and deployed.
Executed proof established that Tailered's process boundary contains agent mutation
and accounting but not execution, and that Tailered's own ledger is not
concurrency-safe under parallel runs.

## Decision

Adopt no upstream component as a dependency. Reimplement three architectural ideas —
the memory-provider contract, fail-open bounded prefetch, and compare-and-swap task
ownership — in Tailered's own zero-dependency TypeScript. Adopt the SKILL.md procedure
format, and build the outcome-measurement leg that neither upstream implements.
Integrate Honcho, if at all, only as an external service behind a per-unit workspace
boundary with authentication enabled, never as linked source. Make ledger
concurrency-safety a prerequisite for any multi-agent execution.

## Alternatives rejected

- Adopt Hermes as the Tailered process agent now: it has no reserve-before-spend and
  publishes no installable artifact, so the platform's fourth operating law could not
  be honoured.
- Adopt Hermes's autonomous skill writer: the learning loop is unmeasured, so the
  capability cannot be shown to help and cannot be governed by evidence.
- Use Honcho as a store of record: derived belief must never enter canonical state.

## Consequences

- Tailered keeps its zero-dependency runtime and its executable definition of done.
- Memory becomes a replaceable adapter with an explicit authority ceiling.
- Parallelism is gated behind ledger concurrency-safety rather than assumed.
- Procedures are measurable from the day they exist.
- Any Honcho integration carries an AGPL service boundary and counsel review.
```
