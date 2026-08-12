# 11 — Risk register (this run, plus carried-forward)

## Risks observed or created by this run

| ID | Risk | Status | Control |
|---|---|---|---|
| BR-01 | Stale tasking hints (EXPECTED_MAIN_HINT predated PR #8) | CLOSED for this run | live-state freeze before any use; hints never override evidence |
| BR-02 | BSD `grep -q -v` false-negative classifier | CLOSED (repaired, documented) | output-emptiness tests; seeded red control required for any classifier |
| BR-03 | Derived artifacts outliving sources (`dist/test/` stale test) | CLOSED (proven, documented) | repairs clean or rebuild derived outputs before re-verifying |
| BR-04 | Unapplied mutation reads as green control | CLOSED (proven, documented) | assert the anchor exists; a control that cannot fail is INVALID |
| BR-05 | Concurrent open PR #9 claims `decisions/ADR-005.md` and its own benchmark run dir | OPEN — no collision with this branch (path census: zero overlap), but if both merge, `main` will carry two independent benchmark corpora; PREZ sequencing decides | recorded; no interaction; strict up-to-date protection forces the later PR to update |
| BR-06 | Coordinator token use not meterable | OPEN (instrumentation limit) | recorded as UNKNOWN, never invented; subagent tokens are exact |
| BR-07 | Benchmark generalization limit: packet measures committed-state verification, not design work | OPEN (stated limit) | conclusions scoped accordingly in `05-subagent-topology.md` |

## Carried forward unchanged (owned elsewhere)

- P0-B assurance boundary: power loss / kernel panic / storage loss / fsync durability /
  cross-host — NOT verified (artifact 29; P0-B report).
- P0-B process-ledger id reuse (114/132 unique) — recorded in artifact 29; retro-editing
  prohibited; future ledgers must use attempt-scoped ids.
- One disclosed machine path in `p0-b/concurrent-session-overlap.md` (P0-B residual
  risk 6).
- Machine-account merge authority (a bot with push can pass the founder gate) — V-00,
  outside this run's scope; branch protection now at least forces the PR + verify path.
- Hermes/Honcho upstream risks: unchanged, reference-only, DEFERRED (ADR-004).

## What cannot be scored away

No score in `04-benchmark-results.md` overrides: the OPEN rows above, the assurance
boundary, or any prohibition in ADR-004. A 100/100 benchmark would still authorize
nothing.
