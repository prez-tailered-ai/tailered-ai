# Automation-readiness backlog

Nothing here is authorized by listing it. Every item requires its own later gate; benchmark
tooling was the only automation permitted in this scope. Priority is by (frequency × time
saved × error class removed) ÷ risk. "Verifier" names the independent mechanism that checks
the automation's own output, per the program's central rule.

| # | Candidate | Trigger | Input contract | Output contract | Verifier | Failure mode | Rollback | Human gate | Owner | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Repository preflight script** (`scripts/benchmarks/agent-workflow/` candidate) | session start; before any commit | repo path, expected-hint list | JSON: remote, heads, behind/ahead, protection, ADR max, open PRs, worktrees+dirt, verdict per hint | re-run twice, diff; spot git commands | stale cache of a moving main | none needed (read-only) | none | coordinator | **P0** — every session pays this cost by hand today (~8 commands); it caught the stale-hint injection this run |
| 2 | **Context-packet builder** | lane dispatch | question + symbol/path seeds | ≤N-byte packet with path:line provenance | answer re-grounded against repo by coordinator | silent omission on open-ended questions | fall back to repo access | none | coordinator | **P0** — 62 ms to build, ~35% lane-token cut, 0-tool-call lanes |
| 3 | **Command evidence collector** (exists: `scripts/foundation/run-recorded.mjs`) | every material command | argv, cwd, evidence stem | attempt-numbered triple + ledger pair, true exit | its own recorded self-tests | shell word-splitting BEFORE the wrapper (hit twice in this program) | n/a | none | coordinator | **P1** — extend with an argv-array entry point so the D1 class dies |
| 4 | **Overlap monitor** | before every commit; on fetch | worktree list + claimed paths | overlap verdict + merge-tree prediction | `git merge-tree --write-tree` exit | claims file goes stale | none (read-only) | none | coordinator | **P1** — the manual version caught PR #4/#5/#8 mid-flight |
| 5 | **False-green detector** (harness lint) | any new harness/script | harness path | findings: exit-0-on-empty, pipe-masked status, missing control, unanchored mutation | seeded broken control must fail | novel false-green shapes | n/a | none | coordinator | **P1** — four instances caught by hand in two days |
| 6 | **Worktree ownership registry** | worktree add/remove; session start | worktree→branch→owner→paths | registry JSONL, append-only | cross-check against `git worktree list` | orphan entries after crashes | prune-with-record | none | coordinator | **P2** |
| 7 | **Task-DAG generator** | scope start | objective + constraints | DAG with owners, write paths, evidence per node | cycle check; one-writer-per-path check | over-decomposition (idle lanes) | n/a | PREZ for scope boundaries | coordinator | **P2** |
| 8 | **Lane dispatcher with floor guard** | any planned dispatch | task size estimate, packet | dispatch or "inline: below the 17.7k-token floor" | post-hoc tokens vs floor | floor drifts with harness versions | n/a | none | coordinator | **P2** — encodes this run's central topology finding |
| 9 | **PR lifecycle operator** | corpus complete | branch, body template, evidence index | draft PR → CI watch → ready-when-green | checks API read twice | marking ready on a stale head | close PR, keep branch | PREZ merges | coordinator | **P2** |
| 10 | **Token budgeter** | lane dispatch | per-lane budget | cutoff + UNKNOWN-safe accounting | harness-reported totals | budgets starve a lane mid-answer | raise budget once | none | coordinator | **P3** |
| 11 | **Terminal report generator** | scope end | ledger + metrics | terminal-ledger table skeleton | hash of cited artifacts | template drift from schema | n/a | PREZ reads | coordinator | **P3** |
| 12 | **Postmortem generator** | any FAIL/INVALID cluster | retained attempt evidence | failure-class writeup with named cause | cited artifacts exist | cause misattribution | n/a | none | coordinator | **P3** |
| 13 | **CI repair loop** | red check on own branch | failing run id | narrow fix + dependent rerun, ≤3 attempts | CI API state | fixing out-of-scope causes | stop BLOCKED | none | coordinator | **P3** |
| 14 | **Reusable agent-seat contracts** | recurring lane shapes | lane id, objective, sources, schema, budget, stop | versioned seat file | seat output validates against schema | seat rot as repo evolves | version pin | PREZ for new seats | coordinator | **P3** |

**Implement first:** #1 preflight + #2 packet builder. Both are read-only (no rollback burden),
both are verified by mechanisms that already exist, and together they attack the two largest
measured costs of this run: manual orientation and lane overhead.
