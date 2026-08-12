# 08 — Repair loops and test validity (Scenarios F and G)

Raw logs: [`evidence/scen-harness.log`](evidence/scen-harness.log),
[`evidence/scenG-F2.log`](evidence/scenG-F2.log), plus red/green run summaries in
`evidence/*.summary.txt`. All runs: disposable clone, Node v24.11.1, true exit codes.

## Scenario G — the harness must prove it can go red

| Run | State | Exit | Detail |
|---|---|---|---|
| run1 | healthy control | 0 | 142/142 pass |
| run2 | "broken" control, attempt 1 | 0 | **INVALID** — mutation anchor `padStart(6` did not exist in `src/`; nothing was mutated; the green result proves nothing and is excluded from every pass count |
| run2b | broken control, attempt 2, real anchor | 1 | mutation `IDENTIFIER_WIDTH[prefix] - 1` at `src/sequence.ts:78` → **171 failing tests**, first failure retained |
| run3b | restored + `dist/` cleaned | 0 | 142/142 pass |

Verdict: the suite is falsifiable, and the invalid first control is exactly why the rule
"setup failure never counts as product evidence" exists — an unapplied mutation looks
identical to a passing product unless the harness asserts the anchor exists.

## Scenario F — injected faults, three-attempt discipline

| Fault | Detection | Repair | Attempts |
|---|---|---|---|
| f1 broken argv | true exit 9 retained | corrected argv → exit 0 | 2 |
| f2 injected failing test | exit 1 retained | **attempt 2 FAILED**: removing the test source left its compiled twin in `dist/test/` still running; attempt 3 cleaned derived outputs → exit 0, 142/142 | 3 |
| f3 false-green harness | claims "ok", true exit 3 | detector compares claim vs exit code → FALSE_GREEN_DETECTED | 1 |
| f4 invalid mutation target | path outside scratch allowlist | rejected before any write | 1 |
| f5 stale main | covered by Scenario A detector (stale hint + advanced origin both flagged) | fetch-first rule | 1 |
| f6 contradictory lane results | two lane JSONs disagree on q1 | contradiction flagged by field-level diff | 1 |

All classes closed within the three-attempt cap. Every failed attempt is retained under
its own evidence path; none was overwritten.

## Two durable lessons this run added to the trap registry

1. **BSD `grep -q -v` is a false-negative machine** (Scenario D, d4): `-q` with `-v`
   succeeds only when *zero* lines match. Any docs/runtime classifier built on it waves
   runtime changes through. Use output-emptiness tests instead.
2. **Derived artifacts outlive their sources**: a deleted failing test kept failing the
   suite from `dist/test/`. Repair loops that touch compiled projects must clean or
   rebuild derived outputs before declaring the repair complete.

Both entered the automation backlog as detector requirements
(`10-automation-readiness.md`).
