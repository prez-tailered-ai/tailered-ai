# 26 — Procedure-outcome measurement architecture

**The strategic finding of this audit.**

Across all three systems examined, exactly one capability is absent everywhere: **nobody
measures whether a stored procedure actually makes an agent better.** Tailered AI is the only
one of the three already writing the data that measurement requires.

This artifact specifies the architecture. **It does not implement it.** Implementation
requires separate authorization.

---

## 1. The evidence that the gap is real

Hermes markets itself as "**the self-improving AI agent**… the only agent with a built-in
learning loop." Three of the four legs of that loop exist. The fourth does not.

| Leg | Hermes implementation | State |
|---|---|---|
| Write | background review fork, `/learn`, `skill_manage` | IMPLEMENTED |
| Store | `~/.hermes/skills` + `.usage.json` | IMPLEMENTED |
| Prune | curator `apply_automatic_transitions` | IMPLEMENTED |
| **Measure** | — | **ABSENT** |

The specifics, each independently verified and one of them adversarially re-verified:

- **The entire per-skill usage record is counts, timestamps, and flags** —
  [`tools/skill_usage.py:664-681`](https://github.com/NousResearch/hermes-agent/blob/ed5e17f4b86da0c4f09c0694757b6074ae6b9d16/tools/skill_usage.py#L664-L681).
  Nothing records whether the turn that loaded the skill succeeded, what it cost, or whether
  the user corrected the result (HA-306).
- **Archival is decided by wall clock** — stale at 30 days, archived at 90
  ([`agent/curator.py:305-383`](https://github.com/NousResearch/hermes-agent/blob/ed5e17f4b86da0c4f09c0694757b6074ae6b9d16/agent/curator.py#L305-L383)).
- **The curator's own prompt forbids using the one signal it has**: *"DO NOT use usage
  counters as a reason to skip consolidation… Judge overlap on CONTENT, not on use_count"*
  ([`agent/curator.py:452-459`](https://github.com/NousResearch/hermes-agent/blob/ed5e17f4b86da0c4f09c0694757b6074ae6b9d16/agent/curator.py#L452-L459)).
- **No test asserts any before/after, effectiveness, or regression property of a skill.**
- Both autonomous writers carry **production quotas uncalibrated against any outcome** — *"A
  pass that does nothing is a missed learning opportunity"*
  ([`agent/background_review.py:183-186`](https://github.com/NousResearch/hermes-agent/blob/ed5e17f4b86da0c4f09c0694757b6074ae6b9d16/agent/background_review.py#L183-L186)),
  and *"If you end the pass with fewer than 10 archives, you stopped too early"*
  ([`agent/curator.py:545-548`](https://github.com/NousResearch/hermes-agent/blob/ed5e17f4b86da0c4f09c0694757b6074ae6b9d16/agent/curator.py#L545-L548)) (HA-308).
- The consequence is recorded in Hermes's own source: a consolidation pass *"archived whole
  clusters of active skills with zero verified consolidations… leaving active automations
  pointing at names that no longer resolve"*
  ([`tools/skill_manager_tool.py:473-481`](https://github.com/NousResearch/hermes-agent/blob/ed5e17f4b86da0c4f09c0694757b6074ae6b9d16/tools/skill_manager_tool.py#L473-L481)).

An adversarial verifier instructed to refute HA-307 reported: *"I tried to break this finding
and could not break its substance."*

**This is not a criticism that Hermes should have solved.** It is an observation that the
problem is unsolved in the field, and that Tailered is unusually well positioned to solve it.

## 2. Why Tailered is positioned to close it

Tailered already writes, on every run, exactly the data a measurement leg needs — and writes
it under a validator that refuses orphans.

| Record | Fields already captured | Citation |
|---|---|---|
| `EvalRow` | `outcome`, `tests_passed`/`tests_total`, `tokens_by_tier`, `wall_time_ms`, `cost_usd`, `blocker`, `caused_by` | [`src/contracts.ts:116-132`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/contracts.ts#L116-L132) |
| `GateLabel` | `verdict`, `edit_diff`, `reason_text`, `artifact_hash`, `context_snapshot` | [`src/contracts.ts:103-114`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/contracts.ts#L103-L114) |
| `RouteLog` | `task_kind`, `tier`, `model`, `attempts`, `tokens`, `cost_usd`, `status`, context telemetry | [`src/contracts.ts:151-167`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/contracts.ts#L151-L167) |
| `AgentCallTrace` | exact payload, projection, usage, causal edges — immutable via `wx` | [`src/contracts.ts:182-200`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/contracts.ts#L182-L200) |

Human judgment is already captured as structured labels, which
[`docs/platform-brief.md`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/docs/platform-brief.md)
calls "the platform's most valuable byproduct."

**The missing link is one field.** Nothing currently records *which procedure a run used*.

## 3. The measurement chain

```text
procedure version (content-hashed)
      │
      ├─ selected for ─────────────► agent run  (run_id)
      │                                  │
      │                                  ├─ RouteLog   : task_kind, tier, model, attempts,
      │                                  │               tokens, cost, context bytes/cache
      │                                  ├─ GateLabel  : verdict, edit_diff, reason
      │                                  └─ EvalRow    : outcome, tests_passed/total,
      │                                                  tokens_by_tier, wall_time, cost,
      │                                                  blocker
      │                                                        │
      └──────────────── attribution via caused_by ◄────────────┘
                                    │
                                    ▼
                        procedure effectiveness
       (outcome rate · attempts-to-green · tokens-per-outcome · cost-per-outcome ·
        human-edit rate · latency · regression state), sliced by task kind, model tier,
        and procedure version
```

## 4. The minimal change

Add an optional `procedure_id` (content-hash plus version) to `RouteLog` and `EvalRow`, and
record it wherever a procedure is selected.

Why this is small and safe:

- **Optional** — every existing ledger row stays valid, so `validate` still passes on an
  untouched repository. Backward compatibility is a property of the type, not a migration.
- **No new store** — measurement is a query over ledgers that already exist. This satisfies
  the blueprint's rule that a subsystem ships only when its capture dependency has data
  ([`docs/blueprint-execution.md`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/docs/blueprint-execution.md)).
- **Router stays pure** — `route()` remains `(taskKind, signals, registry)` with no run state
  ([`src/router.ts:12-48`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/router.ts#L12-L48)). Attribution is recorded, not decided, at routing time.
- **Deterministic** — effectiveness is computed by code from stored numbers, never narrated
  by a model, honouring the law that deterministic code computes money, tokens, and tests.

## 5. What it enables, in dependency order

| Capability | Requires | Notes |
|---|---|---|
| **Procedure scorecard** | `procedure_id` + existing ledgers | outcome rate, attempts-to-green, tokens- and cost-per-outcome, human-edit rate |
| **Outcome attribution** | `caused_by` (already enforced) | walk from a failure back to the procedure that shaped it |
| **Procedure lineage** | content-hash + `supersedes` edge | reuse the ADR supersession pattern; never edit an accepted procedure |
| **Regression detection** | ≥2 versions with comparable runs | flag a version whose outcome rate or cost-per-outcome degrades |
| **Promotion gate** | regression detection + a human gate | a new version is promoted only on evidence, with the verdict captured as a label |
| **Deprecation** | scorecard + lineage | retire on **measured** ineffectiveness — the thing wall-clock archival cannot do |
| **A/B testing** | deterministic assignment + enough runs | assign by run id hash; both arms produce terminal rows |
| **Task-specific routing** | per-`task_kind` scorecards | route to the procedure that measurably wins for that task kind |
| **Model-specific effectiveness** | slice by `tier`/`model` | a procedure that helps a cheap tier may be noise for a frontier tier |

## 6. Hard dependency on the concurrency prerequisite

Every metric above assumes **every started run has exactly one terminal row**. POC-C proved
that assumption currently fails under concurrency: one started run left no terminal record.

**A measurement system built on an incomplete ledger would compute confident, wrong numbers**
— and would do so silently, because the missing rows are exactly the runs that crashed, which
are the runs most likely to be failures. That is a selection bias pointing in the worst
possible direction: procedures would look *better* than they are, precisely because their
failures went unrecorded.

[25-concurrency-remediation-contract.md](25-concurrency-remediation-contract.md) is therefore
a strict prerequisite, not a parallel workstream.

## 7. Why this is defensible as strategic advantage

- It is **not available upstream** — Hermes has the writer and the pruner and explicitly
  disclaims the signal.
- It **compounds with use**: every run adds a labelled data point, and the corpus is the one
  asset that cannot be rented, which is the platform's own stated thesis.
- It is **cheap** to start: one optional field and a query.
- It converts procedural knowledge from an **article of faith** into an **evidence-linked
  asset**, which is the same move the platform already made for spend (reserve/settle),
  completion (executable DoD), and decisions (append-only ADRs).

The pattern is consistent: Tailered's differentiator is that claims must be backed by
records. Procedures are currently the one place where that discipline is not yet applied —
because they do not exist yet. Building them **with** measurement from day one avoids
importing the exact gap this audit found upstream.

## 8. Explicit non-goals

- Do not build an autonomous skill writer. The upstream one is default-on, unmeasured, and
  destructive-by-default (HA-304, HA-316) — that is the failure mode this architecture exists
  to avoid.
- Do not let a procedure become authoritative. A procedure proposes; it never asserts a fact
  or a number.
- Do not implement any of this in the audit-publication commit.
