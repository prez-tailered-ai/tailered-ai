# Benchmark results

All lane token totals are exact (harness-reported). Coordinator tokens are UNKNOWN by
construction; proxies are stated. Wall times are single-trial (declared limitation).

## Mode comparison on the frozen QS-10

| Metric | M0 (coordinator only) | M1 (3 lanes) | M2 (4 lanes + verifier) |
|---|---|---|---|
| Agent tokens (exact) | 0 | 77,743 | 140,754 (88,248 lanes + 52,506 verifier) |
| Coordinator cost | 3 tool calls, ~16 commands, UNKNOWN tokens | verification piggybacked on M0 reads | verification delegated |
| Wall (work only) | 0.23s commands (+1 repair round-trip) | ≈30s (parallel lanes: 24.4/24.9/30.1s) | ≈188s (lanes ≈21s + verifier 167s) |
| Lane tool uses | — | 5+8+6 = 19 | 2+3+6+1 = 12 (+32 verifier) |
| First-pass accuracy | 7/10 clean (1 wrong, 2 partial) | 10/10 | 10/10, one answer **temporally stale** by verification time |
| Final accuracy | 10/10 after 1 narrow repair | 10/10 | 10/10 with drift caught |
| Unique value added | cheapest; instant | fresh-context grounding, added precision (exclusive-cap semantics, else-if precedence) | **caught what nothing else could**: C1 refuted because the repository changed (ADR-005 created) between lane answers and verification; plus 4 subtle traps flagged |
| Duplicated work | — | low (disjoint lanes) | low (disjoint lanes; verifier re-reads by design) |
| Contradictions | — | 0 | 1 (real, temporal — resolved with evidence) |

## What each mode proved

**M0** is unbeatable on cost for bounded questions — but its one-pass batched greps produced a
wrong count (113 via `grep -c '^test('` vs the runner's 142; loop-generated tests are invisible
to line-anchored grep) and two truncated answers. Cheap first passes need a repair round; the
authoritative instrument (the runner) beats the proxy (grep).

**M1** lanes were all correct and *more precise* than M0's first pass, at 77.7k tokens and 30s.
Fresh context found nuances the warm coordinator skimmed (exclusive-bound field naming,
exit-code precedence).

**M2's verifier refuted C1** — correctly. The lanes said "highest ADR = ADR-004"; between their
answers and verification, this very scope created `decisions/ADR-005.md`. Every mode without an
independent late verifier would have shipped a stale claim. The verifier also flagged: the
6-barriers-vs-7-kill-points conflation trap; the static-grep-vs-runner counting trap
(independent static count 114 vs runner 142 — corroborating M0's failure from a different
angle); and that the closing demo/audit evidence is valid only on its retry attempts (the
first attempts were the recorded harness-quoting FAILs).

## Selection under the frozen rule

- **Bounded, low-risk questions → M0**, with the repair-loop discipline attached.
- **Broad fresh research or multi-file grounding → M1-shape** (small disjoint lanes with tight
  packets; M2's tighter packets cut lane tool-uses from 19 to 12 at equal accuracy).
- **Claims that can drift, gate a merge, or carry integrity weight → add the single
  adversarial verifier** (M2's marginal 52.5k tokens bought the only catch that mattered).
- Never the largest mode by default: M2's lanes added nothing over M1's on static facts; the
  verifier is the only M2 component that earned its cost, and only for drift-prone claims.

## Scenario A (live) — orientation

The tasking hints included a stale `EXPECTED_MAIN_HINT` (the PR #7 merge SHA) while `main` had
advanced through PR #8. Preflight: 1 tool call, 13 commands, 3s wall; every identity fact
verified live; zero stale hints accepted; zero unrelated files touched. Hard pass met.

## Dimension scorecards

| # | Dimension | Score | Hard pass | Basis |
|---|---|---:|---|---|
| 1 | Orientation and startup | 9/10 | MET | stale hint caught in one fetch; 3s; deduction: preflight is still hand-rolled (automation #1) |
| 2 | Decomposition and dependencies | 8/10 | MET | frozen plan; zero cycles; one writer per path; deduction: M2 verifier serialized behind lanes longer than planned |
| 3 | Subagent dispatch | 9/10 | MET | smallest-mode rule applied with measured basis; no authority regression; verifier caught real drift |
| 4 | Concurrent-session safety | 10/10 | MET | 6/6 synthetic + 2 live composition events; zero cross-writes/rewrites |
| 5 | One-shot execution | 9/10 | MET | zero clarifying pauses; one denied-command reroute (rm -rf policy) self-served; terminal stop is the PREZ gate |
| 6 | Repair loops | 10/10 | MET | 6/6 injected classes + 2 unplanned live catches (INVALID env red; stale-dist ghost caught by dependent rerun) |
| 7 | Test validity | 9/10 | MET | healthy+broken controls in the crash matrix; anchor guards; deduction: threat-matrix script still exits 0 on universal mint failure (known sharp edge, documented) |
| 8 | Token/context efficiency | 8/10 | MET | exact lane tokens; 17.7k floor found; packets −35% tokens/−88% wall; deduction: coordinator tokens structurally UNKNOWN |
| 9 | GitHub/evidence lifecycle | 9/10 | MET (pre-push scope) | two-event ledger complete; SHA-bound artifacts; deduction: this run's own PR/CI stamps postdate the committed corpus by construction |
| 10 | Automation readiness | 9/10 | MET | 14 candidates, all with trigger/contract/verifier/rollback/gate; nothing treated as authorized |
| | **Total** | **90/100** | no hard blocker triggered | |
