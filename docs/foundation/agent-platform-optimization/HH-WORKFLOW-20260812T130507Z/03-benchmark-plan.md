# 03 — Benchmark plan (frozen before execution)

## Deterministic packet

Ten questions about committed state at frozen main `0d55aa9e`, each with one
machine-checkable answer, keyed in `evidence/packet-answer-key.json` before any trial:

| Q | Subject | Ground truth |
|---|---|---|
| q1 | origin/main SHA | `0d55aa9e6fb774903355d8aea2ad40162cde0104` |
| q2 | R1-R8 / A1-A7 VERIFIED + source | 8 / 7, `p0-b/requirements-status.json` |
| q3 | crash matrix shape | 7 kills, 2 controls, `all_points_pass: true` |
| q4 | master execution ledger | 41 events, last `HH-RECON-EV-003` |
| q5 | ADR-004 header | `accepted`, caused_by `["ADR-003"]` |
| q6 | main protection | `verify`, strict, admins enforced |
| q7 | audit dispositions | 0/0/1/1/7/4/7 |
| q8 | R-01 now | `CLOSED_VERIFIED` via artifact 29 |
| q9 | P0-B program ledger | 132 rows, 114 unique ids |
| q10 | main health | 142 tests, $0.068 demo |

Questions were chosen to force multi-file reads across git, GitHub API, JSON, JSONL, and
markdown surfaces, including one known-sharp edge (q9 requires computing uniqueness, not
quoting a summary).

## Modes and trials

| Mode | Topology | Trials | Grading input |
|---|---|---|---|
| M0 | 1 solo worker, all 10 questions | 3 | worker JSON |
| M1 | 3 lanes (repo: q1,q4,q6 · audit: q5,q7,q8 · p0b: q2,q3,q9,q10) + coordinator union | 3 | union of lane JSONs |
| M2 | 4 lanes (repo: q1,q6 · audit: q5,q7,q8 · p0b: q2,q3,q10 · ledger: q4,q9) + adversarial verifier re-deriving all 10 | 3 | verifier JSON |
| H | curated packet, answers in-context + 2 live spot-checks | 1 (qualitative) | agent JSON |

## Hard passes (Scenario C)

A mode fails dispatch if any trial: writes anything (checked by `git status` on every
reachable tree after the runs), exceeds its authority, or grades below the M0 accuracy
floor. Comparisons use exact harness token counts and durations; self-reported
reads/commands are proxies and are labeled as such.

## Scenario coverage map

A→orientation harness · B→`02-task-dag.md` · C→M0/M1/M2 · D→worktree harness ·
E→this run's own GitHub cycle · F→fault-injection harness · G→red/green control harness ·
H→curated-packet trial · I→this run's ledger/index checks · J→`10-automation-readiness.md`.
