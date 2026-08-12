# 10 — Automation readiness (Scenario J)

Nothing below is implemented in this scope. Each candidate records its full contract;
priority is (expected saving × frequency × failure-rate-reduction) ÷ risk. Time and token
values are measured from this run where exact, otherwise labeled estimate.

| ID | Candidate | Current manual steps | Freq | Deterministic? | Verifier | Failure mode | Rollback | Data risk | Human gate | Owner | Prereq | Expected saving | Conf. | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| AUT-01 | Repository preflight script | ~10 commands: fetch, identity, protection, PR/worktree census, Node-floor check | every session | fully | its own output vs live API re-read | stale cache → wrong SHA | none needed (read-only) | none | no | coordinator | none | ~5 min/session; kills the stale-hint class (2 live hits in 2 days) | high | **1** |
| AUT-02 | Node engine-floor guard | manual `node --version` vs `package.json engines` | every gate run | fully | exits nonzero below floor | silently green on wrong node (already happened once) | n/a | none | no | coordinator | none | removes an entire INVALID class | high | **2** |
| AUT-03 | Context packet builder | hand-curating excerpts for lanes | per fan-out | mostly | packet answers spot-checked live (H trial: 2/2) | stale packet facts | rebuild | none | no | coordinator | AUT-01 | H trial: 49.9k tokens / 22.7s vs 85.7k / 134s solo — ~42% tokens, ~6× latency | high | **3** |
| AUT-04 | Command evidence collector (recorded-execution wrapper exists in-repo) | ad-hoc `> out 2> err; echo $?` | every material command | fully | self-test (wrapper already ships one) | pipeline exit-code laundering | n/a | none | no | coordinator | none | eliminates tail/grep inference class | high | 4 |
| AUT-05 | False-green detector | manual claim-vs-exit comparison | per harness | fully | seeded false-green control (f3 PASS) | trusts claims | n/a | none | no | coordinator | AUT-04 | catches f3-class + unapplied-mutation class (G run2) | med | 5 |
| AUT-06 | Docs/runtime diff classifier | ad-hoc grep (broke once: BSD `grep -qv`) | per PR | fully | seeded runtime-file control must go red | false DOCS_ONLY | n/a | none | no | coordinator | none | prevents runtime change riding a docs PR | high | 6 |
| AUT-07 | Worktree ownership registry + overlap detector | memory + `git worktree list` | multi-session days | fully | seeded stale-heartbeat control (d3 PASS) | stale entries | delete registry | none | no | coordinator | none | removes session-collision ambiguity (real incident, P0-B) | med | 7 |
| AUT-08 | PR lifecycle operator (draft→CI→ready→stop) | ~8 gh commands + polling | per PR | mostly | PR state re-read via API | merging without authority | close PR | none | **yes — merge stays human** | coordinator | AUT-01 | ~10 min/PR | med | 8 |
| AUT-09 | Ledger event pairing + hash checker | python one-offs | per run | fully | seeded unpaired-event control | accepts unmatched starts | n/a | none | no | coordinator | none | evidence-integrity floor | med | 9 |
| AUT-10 | Token budgeter | none (budget tracked by hand) | per fan-out | fully | usage-report reconciliation | invents counts when source absent | n/a | none | no | coordinator | exact usage source | keeps token claims exact-or-UNKNOWN | med | 10 |
| AUT-11 | Terminal report generator | hand-written | per session | partly model | schema check | fabricated numbers | regenerate | none | no | coordinator | AUT-09 | ~15 min/session | low | 11 |
| AUT-12 | Postmortem generator | hand-written | per incident | partly model | evidence-link resolution | narrative drift | regenerate | none | no | coordinator | AUT-09 | quality, not time | low | 12 |
| AUT-13 | Lane dispatcher + reusable seat contracts | hand-written lane prompts | per fan-out | partly model | grading vs frozen key | authority creep in prompts | n/a | none | no | coordinator | AUT-03 | consistency of the read-only contract | low | 13 |
| AUT-14 | Task-DAG generator | hand-written | per program | partly model | cycle/ownership lint | hidden deps | regenerate | none | no | coordinator | none | planning hygiene | low | 14 |

## Top recommendation

Implement AUT-01 + AUT-02 first (one script, trivially verifiable, kills the two failure
classes this program actually hit twice: stale state hints and the v22 silent-green). Then
AUT-03: the packet builder is the single largest measured efficiency lever (H trial), and
its verifier — live spot-checks inside the packet consumer — is already proven here.

Detector requirements added by this run: assert the mutation anchor exists before
trusting a broken control (G run2); clean derived outputs before declaring a repair
(F2); never build classifiers on BSD `grep -q -v` (d4).
