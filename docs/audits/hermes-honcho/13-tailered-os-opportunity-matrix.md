# 13 — Tailered OS opportunity matrix

Evaluated against the eleven Tailered OS objectives named in the audit brief. Each is scored
on what the evidence supports, with the measurable success criterion stated. Where the
honest answer is "upstream does not help here," that is the answer given.

Two results dominate this artifact and should be read first:

- **POC-C** proved Tailered's ledger is not concurrency-safe. Three concurrent ship runs
  produced 4 duplicate route ids, 10 validator errors, and one started run with **no
  terminal eval** — violating `AGENTS.md:18`. The corruption happens *after* the agent
  returns, so **no agent runtime can fix it**.
- **TA-103** (Lane D) found the Dime program has **zero measurement of skill usage anywhere**,
  and **HA-307** found Hermes writes and prunes skills but never measures whether any of it
  helps. Neither system has closed this loop. Tailered is the only one of the three that
  already stores the outcome data required to close it.

## The matrix

| Objective | Where Tailered/Dime stands | Does upstream help? | Expected benefit | Effort | Risk | Reversibility | Success criterion |
|---|---|---|---|---|---|---|---|
| **One-shot execution** — intent to verified completion without babysitting | **Strong already.** Executable DoD (`src/ship.ts:486-524`) proves completion; Hermes only *infers* it (HA-115) | **No — Tailered is stronger** | none | — | — | — | Keep `assertGatingDefinitionOfDone` as the model |
| **Parallelism** — safely increase concurrent work | **Blocked internally** (POC-C). Dime separately runs 51 worktrees in production (TA-105) | **Pattern only** — Kanban CAS+TTL+heartbeat (HA-404) | High, but only after Gate 0 | Med | Med | High (append-only ledger) | 3 concurrent runs → 3 terminal evals, 0 duplicate ids, `validate` exit 0 |
| **Isolation** — prevent overlap and shared-state corruption | Dime: worktrees in heavy use. Tailered: single-run only | **Pattern only** — worktree-per-task (`kanban_db.py:7346`); Hermes's *own* `delegate_task` is **not** isolated (HA-401/402) | Medium | Low | Low | High | Two workers cannot write the same path without a claim |
| **Reusable procedures** | 479 `SKILL.md` in Dime; format identical to Hermes (TA-101) | **No — already present** | none | — | — | — | — |
| **Institutional memory** | Tailered: ADRs in context, **eval + label ledgers excluded** (`src/context.ts:47-50`) — deliberate (`agent-protocol.md:39`). Dime: no memory at all (DA-103) | **Contract only** — `MemoryProvider` ABC (HH-103) | Medium | Med | **High** if authority is wrong | High | Memory is optional, quarantined, and never authoritative |
| **Evidence** — every claim linked to source, action, test, decision, cost | **Strongest property Tailered has.** `caused_by` enforced by the validator; call traces immutable via `wx` | **No — Tailered is far stronger** | none | — | — | — | Keep |
| **Governance** — explicit human gates not bypassed by autonomy | Gate + label capture is load-bearing and enforced | **No — actively negative.** Hermes's skill writer is default-on with approval off (HA-304); `hermes -z` disables approvals (SEC-H-05) | none | — | — | — | Keep |
| **Cost control** | **Tailered: reserve/settle enforced, proven by POC-A.** Dime: post-hoc only (TA-111) | **No — actively negative.** Hermes has no reserve-before-spend (HA-502) and lossy async accounting (HA-513) | none | — | — | — | Keep; consider porting Tailered's reserve/settle *into Dime* (TA-112) |
| **Model independence** | Registry-only identity (`src/config.ts`), swap = string change | **Confirms the approach** — 34 declarative provider profiles (HA-209) | Low | — | — | — | Both systems already agree |
| **Auditability** — exact reconstruction of historical runs | Context snapshots + call traces stored once per hash, immutable | **No — Tailered is stronger** | none | — | — | — | Keep |
| **Compounding capability** — each task leaves reusable capability | **The real gap.** Tailered captures outcomes but never feeds them back; Dime has zero skill measurement (TA-103); Hermes writes skills but never measures them (HA-306/307) | **By counter-example only** | **Highest strategic value in the audit** | Med | Low | High | A procedure's retention decision is made from outcome data, not a clock |

## The one genuinely differentiating opportunity

Every other row above either says "Tailered is already stronger" or "borrow a pattern."
One row is different, and it is worth stating plainly.

**Hermes proves, by omission, exactly what Tailered is uniquely positioned to build.**

Hermes has the write leg (autonomous skill authoring), the store leg, and the prune leg —
and no measurement leg. Its curator decides what to keep by **wall clock** (30 d stale, 90 d
archive) and its consolidation prompt explicitly **forbids** using the only usage signal it
has: "DO NOT use usage counters… Judge overlap on CONTENT, not on use_count"
(`agent/curator.py:452-459`). The result is quota-driven growth and clock-driven deletion
with no feedback anywhere (HA-307, HA-308).

Tailered already stores what Hermes lacks. Every run writes a terminal `EvalRow` carrying
`outcome`, `tests_passed`/`tests_total`, `tokens_by_tier`, `wall_time_ms`, `cost_usd`, and
`caused_by` (`src/contracts.ts:116-132`); every gate writes a `GateLabel` with verdict, edit
diff, and reason (`:103-114`); every call writes a `RouteLog` with tier, tokens, cost, and
context telemetry. **The join between "which procedure was used" and "what did the run cost
and did it pass" is one field away** — a procedure id on the `RouteLog` and the `EvalRow`.

That is the compounding mechanism the Platform Brief already claims as the moat
(`docs/platform-brief.md:64`: "judgment that is captured compounds"), and it is achievable
without adopting a single line of upstream code.

**Success criterion:** a procedure's retention decision can be derived from
tokens-per-outcome on runs that used it versus runs that did not — the tokens-per-outcome
curve the Platform Brief already names as the native economic instrument (§7).

## Sequencing

1. **Gate 0 — ledger concurrency-safety.** Prerequisite for every parallelism claim.
   Borrow the CAS-claim pattern (HA-404), not the code. Until this lands, "safe parallel
   agent work" is not a property Tailered has, regardless of what runtime executes the work.
2. **Gate 1 — procedure-outcome join.** The differentiating move above. Cheap, reversible,
   and it uses ledgers that already exist.
3. **Gate 2 — memory as an optional adapter**, if institutional memory is wanted, using the
   `MemoryProvider` contract shape and a hard authority ceiling (see `18`).
4. **Gate 3 — Hermes as a process agent**, deferred, and only behind a measured POC-B that
   is currently BLOCKED on isolated infrastructure and authorized spend.

## What Tailered should keep building itself

Its evidence chain, its executable definition of done, its reserve/settle metering, and its
zero-dependency posture. All four are *stronger* than the upstream equivalents, and three of
them (evidence, DoD, metering) are the reason this audit can recommend so little adoption:
the platform's differentiating properties are precisely the ones the upstreams do not have.

## What Tailered should stop rebuilding

Nothing found. The audit looked for capabilities Tailered is reinventing that upstream has
already solved better, and the honest answer is that the overlap is small: Hermes solves a
different problem (one operator, many surfaces) and Honcho solves a problem Tailered does
not currently have (long-horizon user modelling). The nearest candidate — a memory layer —
is one Tailered has deliberately deferred, and `docs/blueprint-execution.md:34-42` already
refuses subsystems whose data dependency is unmet. That refusal remains correct.
