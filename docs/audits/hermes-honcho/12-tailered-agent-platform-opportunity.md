# 12 — Tailered AI agent-platform opportunity matrix

The sole question this artifact answers: **what can Hermes Agent and Honcho contribute to
`prez-tailered-ai/tailered-ai` as it becomes the repository in which agents are built,
evaluated, and deployed?**

Every row terminates in a Tailered AI disposition. Nothing here is inherited from any other
system; where an idea originated in an out-of-scope analysis, it was re-derived and proved
independently against Tailered AI's own code.

Dispositions: `KEEP TAILERED` · `REFERENCE` · `ADAPT` · `INTEROPERATE` · `DEFER` · `REJECT` ·
`REPLACE`.

---

## A. Agent runtime

| Capability | Tailered today | Upstream | Assessment | Disposition |
|---|---|---|---|---|
| Agent loop | Linear, deterministic, bounded ship loop ([`src/ship.ts:78-484`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/ship.ts#L78-L484)) | Hermes: one ~6,300-line function, doubly-nested retry loop, ~20 terminal return shapes (HA-101) | Tailered's is legible and one-sitting readable; Hermes's is powerful but is the single hardest artifact in that repo to reason about | **KEEP TAILERED** |
| Model/provider abstraction | Registry strings only; swap = string change ([`src/config.ts:27-39`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/config.ts#L27-L39)) | Hermes: 34 declarative provider profiles behind one ABC (HA-209, HA-122) | Same principle, more surface. Tailered gains the pattern only when it has real provider adapters | **REFERENCE** |
| Fallback / failover | None — a failed agent call halts the run and settles at ceiling ([`src/ship.ts:204-219`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/ship.ts#L204-L219)) | Hermes: 30 `FailoverReason` values, monotonic identity-deduped chain (HA-111, HA-112) | Real gap **only if** Tailered adds live providers. Halting is currently correct: it produces a terminal record | **DEFER** |
| Retries | Bounded per-check attempts (max 3) | Hermes: five independent retry counters that can extend a turn past the model's own loop (HA-123) | Tailered's single bound is stronger and auditable | **KEEP TAILERED** |
| Interruption / cancellation | None | Hermes: per-thread flags + socket abort; cannot hard-kill a child (HA-120, HA-416) | Needed before long-running agents. Note upstream's own limitation | **ADAPT** (design, not code) |
| Context management | Snapshot per repo-state hash, stored once per run, referenced by hash ([`src/context.ts:32-78`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/context.ts#L32-L78)) | Hermes: three-tier system prompt + per-message `api_content` sidecar | Different problems: Tailered snapshots a repo, Hermes preserves a conversation | **KEEP TAILERED** + **REFERENCE** |
| Context compression | None (v1 has no long conversation) | Hermes: 5 trigger sites, shared per-turn cap, soft-vs-exhausted distinction (HA-113) — but **deliberately discards outstanding commitments** (HA-508) | Adopt the trigger discipline, never the commitment-dropping template | **REFERENCE** |
| **Prompt caching** | Per-run context cache with measured `cache_hit`/`bytes`/`assembly_ms` | Hermes: `api_content` sidecar replays original wire bytes so the prefix stays byte-identical (HA-108) | **Genuinely superior mechanism** for multi-turn agents, and directly applicable when Tailered agents hold conversations | **REFERENCE — high value** |
| Tool execution | No model-driven tools; the agent returns whole files | Hermes: segment-planned parallel dispatch with reader/writer path reservations, pre-indexed result slots (HA-109) | The ordering/reservation design is the right pattern when Tailered adds tools | **REFERENCE** |

## B. Agent orchestration

| Capability | Tailered today | Upstream | Assessment | Disposition |
|---|---|---|---|---|
| Parent/child agents | None | Hermes `delegate_task`: same process, same filesystem, parent cwd (HA-401) | Upstream's model is weaker than what Tailered needs | **REJECT** |
| Task ownership / claims | None | Hermes Kanban: CAS claim + TTL + `worker_pid` liveness + heartbeat (HA-404) | **The correct primitive**, and the direct input to the concurrency prerequisite | **REFERENCE — prerequisite** |
| Task dependencies / DAG | Sequential loop steps in [`loops/ship.yaml`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/loops/ship.yaml) | Hermes Kanban: dependency links, review/blocked states, artifact handoff (HA-414) | Richest coordination model found; reimplementable in TypeScript | **REFERENCE** |
| Parallel execution | **Unsafe today** — see [25](25-concurrency-remediation-contract.md) | Hermes: two lanes, only one isolated | Blocked on Tailered's own ledger, not on upstream | **KEEP TAILERED** (after remediation) |
| Reviewer / verification agents | Constitutional critique step + human gate | Hermes: none comparable | Tailered already has critique-before-gate | **KEEP TAILERED** |
| Recovery agents | Terminal record + named blocker | Hermes: abandoned delegations recorded `unknown`, never resumed (HA-406) | Tailered's halt-and-name is stronger | **KEEP TAILERED** |

## C. Agent isolation

| Capability | Tailered today | Upstream | Assessment | Disposition |
|---|---|---|---|---|
| Process isolation | Process-agent boundary: one JSON request on stdin, one response on stdout ([`docs/agent-protocol.md`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/docs/agent-protocol.md)) | Hermes: 7 terminal backends incl. Docker/SSH/Modal/Daytona | Tailered's boundary is vendor-neutral and already correct in shape | **KEEP TAILERED** |
| Filesystem boundary | Writes restricted to `product/`; traversal rejected — **both proven by POC-A** | Hermes: `delegate_task` has none; Kanban has git worktrees | **Tailered is materially stronger** than Hermes's default lane | **KEEP TAILERED** |
| Worktree isolation | None | Hermes Kanban: real `git worktree add` per task | The right model for parallel workers, after remediation | **REFERENCE** |
| Execution sandbox | **None, and documented as none** (`--allow-local-execution` "is not a sandbox") | Hermes: "the only security boundary is the operating system" (`SECURITY.md` §2.2) | **Both systems agree containment lives in the OS.** Tailered must supply a disposable worker | **ADAPT** |
| Credential scoping | Not yet defined | Hermes: env filtering for shell/MCP/cron/exec children, fails closed — but "is not containment" (§2.3) | Adopt the filtering pattern; do not mistake it for isolation | **REFERENCE** |

## D. Agent knowledge and learning

| Capability | Tailered today | Upstream | Assessment | Disposition |
|---|---|---|---|---|
| Skills / procedures | None in-repo | Hermes: 193 skills, `SKILL.md` + YAML frontmatter, filesystem scan (HA-301) | Format is a solved, conventional problem — cheap to adopt as a *format* | **ADAPT (format only)** |
| Skill routing | N/A | Hermes: pure model judgment over a 60-char truncated description; no ranking, no embeddings (HA-302) | Weak. Tailered can do better with explicit task-kind routing it already has | **REJECT** |
| Autonomous skill authoring | None | Hermes: default-on background writer, approval **off**, `delete` permanently `rmtree`s (HA-304, HA-316) | Importing an unmeasured self-modifying writer would violate Tailered's evidence law | **REJECT** |
| **Procedure effectiveness measurement** | **Data exists, join absent** | **Neither upstream has it** (HA-306, HA-307) | **The single differentiating opportunity** — see [26](26-procedure-outcome-architecture.md) | **TAILERED NEW — build it** |
| Decision memory | ADRs in context; append-only; supersession by new file | Honcho: no supersession at all (HO-208) | **Tailered is dramatically stronger** | **KEEP TAILERED** |

## E. Agent memory

| Capability | Tailered today | Upstream | Assessment | Disposition |
|---|---|---|---|---|
| Short-term / session memory | Per-run context snapshots | Hermes: SQLite schema v25, strong crash recovery (HA-501, HA-517) | Sound reference if Tailered ever holds sessions | **REFERENCE** |
| Long-term contextual memory | **None** — ledgers deliberately excluded from context ([`src/context.ts:47-50`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/context.ts#L47-L50), documented at [`docs/agent-protocol.md`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/docs/agent-protocol.md)) | Honcho: its entire purpose | The one genuine capability gap — and one Tailered deliberately deferred | **DEFER / INTEROPERATE** |
| Memory provider abstraction | None | Hermes: 20-method ABC, 9 implementations, memory genuinely optional (HH-103, HH-201) | **The most transferable single idea in either repo** | **REFERENCE — high value** |
| Provenance of derived belief | `caused_by` enforced by the validator on every record | Honcho: `source_ids` are unvalidated model-supplied strings (HO-204) | **Tailered is far stronger** | **KEEP TAILERED** |
| Contradiction / supersession | Append-only ADR supersession, immutable accepted decisions | Honcho: `contradiction` level unreachable; no supersession (HO-207, HO-208) | **Tailered is far stronger** | **KEEP TAILERED** |
| Freshness / decay | Run-scoped by construction | Honcho: none; reinforcement monotonic (HO-209) | Tailered avoids the problem entirely today | **KEEP TAILERED** |
| Deletion semantics | `git revert`; artifacts immutable by design | Honcho: no `ON DELETE` in the physical schema; no message delete (HO-101, HO-113) | Any memory adopted must not inherit this | **REJECT (Honcho's model)** |

## F. Agent governance

| Capability | Tailered today | Upstream | Assessment | Disposition |
|---|---|---|---|---|
| **Hard cost ceiling before spend** | **Enforced and proven** ([`src/budget.ts:48-54`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/budget.ts#L48-L54); POC-A) | Hermes: **none anywhere** (HA-502); accounting async and documented-lossy (HA-513) | **Tailered's strongest property.** Adopting Hermes's model would violate [`AGENTS.md`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/AGENTS.md) laws 4 | **KEEP TAILERED / REJECT upstream** |
| Human gates on the irreversible | Deploy gate; every verdict a labelled record | Hermes: approval prompts, not a label corpus; `hermes -z` disables approvals entirely (SEC-H-05) | **Tailered is far stronger** | **KEEP TAILERED** |
| Approval enforcement point | Single chokepoint: writes validated in one function | Hermes: **no chokepoint**; ≥7 independent gates, `computer_use` default-allow (HA-201, HA-203) | **Tailered is far stronger** | **KEEP TAILERED** |
| Deterministic checks | Executable definition of done ([`src/ship.ts:486-524`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/ship.ts#L486-L524)) | Hermes: completion **inferred** from exit reason (HA-115) | **Tailered is far stronger — this is the platform's defining property** | **KEEP TAILERED** |
| Authority levels | Seats roster; founder owns irreversible actions | Hermes: `subagent_auto_approve` lets a child approve what the parent would not (HA-408) | Tailered's model is sound | **KEEP TAILERED** |

## G. Agent observability

| Capability | Tailered today | Upstream | Assessment | Disposition |
|---|---|---|---|---|
| Traces | Immutable per-call trace, `wx` exclusive create | Hermes: rich redacted file logging | Comparable; Tailered's immutability is stronger | **KEEP TAILERED** |
| Tokens / cost telemetry | Exact, per tier, per call, validator-checked | Hermes: OTLP carries **zero** LLM/token/cost signals (HA-512) | **Tailered is far stronger** | **KEEP TAILERED** |
| Context telemetry | `bytes`, `cache_hit`, `assembly_ms` on every route | Hermes: none equivalent | **Tailered is stronger** | **KEEP TAILERED** |
| Causal lineage | `caused_by` mandatory and enforced | Neither upstream has an equivalent | **Tailered is uniquely strong** | **KEEP TAILERED** |

## H. Agent deployment

| Capability | Tailered today | Upstream | Assessment | Disposition |
|---|---|---|---|---|
| Packaging | npm package, zero runtime deps, `bin` entry | Hermes: **cannot be packaged** — `setup.py` raises on wheel/sdist (HA-601) | Tailered's is normal; Hermes's forecloses dependency | **KEEP TAILERED** |
| Worker lifecycle | Process agent spawned per call | Hermes Kanban: real OS-process workers, PID liveness, TTL reclaim | Right reference for a worker fleet | **REFERENCE** |
| Scheduling / queues | None | Hermes cron; Honcho Postgres-table queue with `ON CONFLICT DO NOTHING` claim (HO-402) | Honcho's claim primitive is correct; its error handling is not (HO-404) | **REFERENCE (claim only)** |
| Health / readiness | `validate` + executable DoD | Honcho: `/health`, `/metrics` (unauthenticated, HO-112) | Tailered's is stronger and evidence-linked | **KEEP TAILERED** |
| Rollback | `git revert`; append-only ledgers | Neither upstream is comparable | **Tailered is stronger** | **KEEP TAILERED** |
| Versioning | Single package version | Hermes: **four inconsistent identifiers**, no semver policy (HA-609) | Tailered's is stronger | **KEEP TAILERED** |

---

## The shape of the answer

Counting dispositions across the eight domains: Tailered is **already stronger** on
governance, observability, evidence, isolation-of-writes, cost, and deployment discipline —
which is most of what an agent *platform* is. Upstream is stronger on exactly four things:

1. **Prompt-cache preservation** (Hermes) — a real mechanism, high value once agents hold
   conversations.
2. **The memory-provider contract** (Hermes) — the abstraction that makes memory optional.
3. **CAS claim + TTL + heartbeat ownership** (Hermes Kanban) — the prerequisite primitive for
   safe concurrency.
4. **Long-horizon contextual memory** (Honcho) — a capability Tailered does not have and has
   deliberately deferred.

Three of the four are patterns to reimplement. One is a service to interoperate with, under
gates. **None is a dependency to take.**

## The gap nobody has filled

Across all three systems, exactly one capability is missing everywhere: **nobody measures
whether a stored procedure makes an agent better.** Hermes writes, stores, and prunes
skills — and decides what to keep by wall clock, with its consolidation prompt explicitly
forbidding use of the one usage signal it has (HA-306, HA-307).

Tailered already writes the outcome data that measurement requires. That asymmetry is the
strategic finding of this audit and is specified in
[26-procedure-outcome-architecture.md](26-procedure-outcome-architecture.md).
