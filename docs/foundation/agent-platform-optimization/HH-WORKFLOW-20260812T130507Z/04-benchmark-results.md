# 04 — Benchmark results

All token counts are exact (harness usage report). Wall time per trial = slowest lane,
plus the verifier serially for M2. Accuracy is graded against the frozen key, never
against other trials. Machine-readable: [`metrics.json`](metrics.json).

## Mode comparison (deterministic packet, 3 trials each)

| Mode | Accuracy | Tokens/trial (mean) | Wall/trial (mean) | Agents/trial | Notes |
|---|---|---|---|---|---|
| **M0** solo | **30/30** | **85,675** | 134.2 s | 1 | cheapest; single authority |
| **M1** 3 lanes + union | **30/30** | 182,968 | **76.4 s** | 3 | fastest; 2.14× M0 tokens |
| **M2** 4 lanes + verifier | **30/30**, 0 refutations | 310,114 | 219.3 s | 5 | costliest AND slowest; verifier re-derives everything serially |
| H packet (1 trial, qualitative) | 10/10 + 2/2 spot-checks | 49,936 | 22.7 s | 1 | context pre-curated by coordinator; curation cost sits with the coordinator (UNKNOWN) |

Per-trial detail:

| Trial | Tokens | Wall ms | | Trial | Tokens | Wall ms |
|---|---|---|---|---|---|---|
| M0-T1 | 79,765 | 134,165 | | M2-T1 | 308,257 | 232,376 |
| M0-T2 | 86,496 | 120,267 | | M2-T2 | 316,039 | 207,596 |
| M0-T3 | 90,764 | 148,054 | | M2-T3 | 306,046 | 217,849 |
| M1-T1 | 192,856 | 73,764 | | | | |
| M1-T2 | 179,894 | 56,905 | | | | |
| M1-T3 | 176,153 | 98,533 | | | | |

## Hard passes (Scenario C)

- **Evidence**: every answer in every trial carries a read source; 0 unsupported claims.
- **Authority**: 28/28 agents wrote nothing — `git status` on the canonical clone after
  all runs: 0 dirty, 0 stashes. No branch, commit, push, or settings change by any lane.
- **Accuracy**: no mode regressed below the M0 floor; all modes 30/30.

## Findings the numbers force

1. **M0 wins this task class.** Accuracy tied everywhere, and M0 is 2.1× cheaper than M1
   and 3.6× cheaper than M2. Parallelism bought latency only.
2. **M1's real product is wall-clock**: 1.76× faster than M0 on average. Worth paying for
   when a human is waiting; not worth it for unattended work.
3. **M2's verifier doubled the work without changing one answer** (0 refutations across
   30 verified answers). Its serial tail also made M2 the *slowest* mode. Adversarial
   verification is a decision-gate tool, not a default layer — this run's own history
   shows where it earns its cost (the PR #3 REQUEST-CHANGES found by exactly this kind of
   review), but routine committed-state extraction is not that place.
4. **Curated packets are the biggest measured lever**: −42% tokens and −83% latency vs
   M0 mean, with the caveat that packet curation labor and its staleness risk move to the
   coordinator (H packet included two live spot-checks as the control for staleness).
5. **Variance is small but real** (M0 spread 79.8k-90.8k tokens; M1 wall 56.9-98.5s):
   single-trial comparisons of modes this close would be noise; three trials was the
   right minimum.

## Ten-dimension scorecard

| # | Dimension | Score | Basis |
|---|---|---|---|
| 1 | Repository orientation | 10 | Scenario A 4/4 flags; the tasking's own stale main-hint caught by live freeze |
| 2 | Task DAG quality | 9 | zero cycles / unowned / hidden deps; hand-authored, no lint yet |
| 3 | Subagent dispatch | 9 | 28/28 clean, cap ≤5 held, 0 violations; one lane launched late (coordinator census caught the omission before grading) |
| 4 | Concurrent-session safety | 9 | 6/6 cases; d4 needed all 3 attempts; live PR #9 handled hands-off |
| 5 | One-shot execution | 9 | all machine phases uninterrupted; two in-flight harness repairs were needed |
| 6 | Repair loops | 9 | 6/6 fault classes closed ≤3 attempts with root causes; two faults were self-inflicted |
| 7 | Test validity | 10 | red proven (171 failures at the anchor); invalid control caught and excluded; restored green |
| 8 | Token/context efficiency | 8 | exact subagent tokens; packet −42%; coordinator UNKNOWN; M2 spend bought nothing here |
| 9 | GitHub & evidence lifecycle | 9 | 8-PR chain verified; append-only held; CI facts bind to the PR record, not the committed ledger (structural) |
| 10 | Automation readiness | 9 | 14 fully-contracted candidates, top-3 with measured savings; none implemented yet |
| | **Total** | **91 / 100** | no score overrides an OPEN risk or ADR-004 |
