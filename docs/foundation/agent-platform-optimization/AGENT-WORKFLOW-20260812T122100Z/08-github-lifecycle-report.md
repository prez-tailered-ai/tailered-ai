# GitHub and evidence lifecycle report

## This run (pre-push scope; the run's own PR/CI stamps postdate this committed file by construction and are recorded in the PR body and terminal response)

| Step | Measured |
|---|---|
| Preflight to trusted state | 3s, 1 tool call, 13 commands; stale main hint caught |
| Branch creation | `audit/ruflo-post-p0b-workflow-readiness` from live `0d55aa9e` via a fresh worktree; zero interference with 6 other active worktrees |
| Changed-file classification | decisions/ (1 new ADR, proposed), audit pointer (1 append-only), run corpus (all new files), zero `src/`/`test/`/config paths |
| Evidence discipline | every scenario writes into `evidence/`; failed attempts retained (D2 attempt1 INVALID kept; scenD/E transcripts verbatim) |
| Ledger | two-event rule in `execution-ledger.jsonl`; every material phase paired |
| SHA binding | corpus artifacts name `0d55aa9e` as base; scenario evidence embeds the disposable-clone heads it measured |

## Reference lifecycle (P0-B, measured on merged evidence)

Branch-to-merged-PR spanned 8 commits including two mid-flight compositions (PR #4/#5, PR #6),
zero force-pushes, zero rebases, one draft→ready transition after double-green CI, and a
132-event program ledger with zero unmatched starts. Costs worth cutting, now in the
automation backlog: hand-rolled preflights (~8 commands each, run ~6 times), and six FAIL
attempts from one shell-quoting class that the recorded wrapper surfaced but could not prevent
(collector candidate #3 adds an argv-array entry point).

## Rules validated

- Bind every CI conclusion to an exact head via the checks API; never to "latest".
- An intermediate commit is never amended away; corrections are new commits with named causes.
- Draft-first PRs: ready only after push AND pull-request contexts are green on the same head.
- Docs-only main advances compose freely; runtime advances require hunk-level review against
  the consumed surface before continuing.
