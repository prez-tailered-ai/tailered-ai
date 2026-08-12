# 02 — Task DAG (Scenario B)

The DAG below is the frozen execution graph for this run. Every node names one owner.
Every changed path has exactly one writer: the coordinator. Read-only lanes own no path.

## Nodes

| ID | Task | Owner | Inputs | Outputs | Write paths | Depends on | Evidence | Stop condition |
|---|---|---|---|---|---|---|---|---|
| N0 | Preflight + live-state freeze | Coordinator | origin, GitHub API | frozen SHAs, protection state | none | — | `evidence/packet-answer-key.json` | wrong repo / missing merges |
| N1 | Historical reconstruction | Coordinator | git log, PR API | PR timeline, incident list | none | N0 | `evidence/history-prs.json` | — |
| N2 | Packet + answer-key freeze | Coordinator | N0 facts | 10-question packet, key | none | N0 | `evidence/packet-answer-key.json` | — |
| N3 | M0 trials ×3 | 3 read-only subagents | packet | answer JSON + usage | none | N2 | notifications (tokens, ms) | agent failure ×3 |
| N4 | M1 trials ×3 (3 lanes each) | 9 read-only subagents | lane packets | lane JSONs + usage | none | N2 | notifications | agent failure ×3 |
| N5 | M2 trials ×3 (4 lanes + verifier) | 15 read-only subagents | lane packets, lane outputs | verified JSON + refutations | none | N2; verifier per-trial after its 4 lanes | notifications | agent failure ×3 |
| N6 | Scenario A/D/F fast parts | Coordinator (scripted) | disposable clones | flags, logs | scratch only | N0 | `evidence/scen-harness.log` | detector MISS after 3 attempts |
| N7 | Scenario G + F2 (npm cycles) | Coordinator (scripted) | disposable clone | 5 exit codes, red/green proof | scratch only | N6 setup | `evidence/scenG-F2.log` | red control stays green |
| N8 | H context experiment | 1 read-only subagent + M0 reuse | curated packet | answer JSON + usage | none | N2 | notifications | — |
| N9 | Grading + scoring | Coordinator | N3-N8 outputs, key | metrics.json, 10 scores | RUN dir | N3-N8 | `metrics.json` | unresolved false VERIFIED |
| N10 | Reports + artifact 30 + manifest | Coordinator | all | 13 reports, pointer, manifest row | RUN dir; audit artifact 30; manifest 24; master ledger append | N9 | commits | — |
| N11 | Validation suite | Coordinator | branch worktree | 7 exit codes + scans | none | N10 | `evidence/validation.log` | gate red ×3 |
| N12 | GitHub cycle | Coordinator | branch | PR, CI runs | remote branch, PR | N11 | PR API | CI red ×3 |
| N13 | PREZ gate | PREZ | PR | merge decision | — | N12 | — | terminal for this session |

## Verification properties

- **Cycles:** none — edges flow N0→N13 strictly forward.
- **Unowned tasks:** none — every node names Coordinator, a counted subagent set, or PREZ.
- **Hidden dependencies:** the M2 verifier's dependence on its own trial's 4 lane outputs is
  declared (N5). No other cross-lane data flow exists; lanes share only the frozen packet.
- **One writer per changed path:** all repository writes (RUN dir, artifact 30, manifest,
  master-ledger append) are coordinator-only. Subagents are prompt-bound read-only and are
  verified afterwards by `git status` on every working tree they could reach.
- **Concurrency cap:** at most 5 subagents ran at any moment (ownership rule §7), enforced
  by wave scheduling; the wave log is in `execution-ledger.jsonl`.

## Single-writer set (must never be parallelized across actors)

Worktree mutation, ledger append, manifest edit, commit, push, PR lifecycle, CI repair,
merge action, evidence-file creation in the authoritative branch.

## Parallel-reader set (safe to fan out)

Committed-state extraction (`git show origin/main:`), GitHub API reads, evidence-file
digestion, adversarial re-verification, historical reconstruction, link/scan checks.
