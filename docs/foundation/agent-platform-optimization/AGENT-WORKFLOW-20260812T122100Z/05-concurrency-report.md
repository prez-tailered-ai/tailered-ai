# Concurrent-session safety report (Scenario E + live observations)

**Evidence:** `evidence/scenE-concurrent-sessions.txt` (synthetic disposable repo, real git
worktrees) plus two live events from this program's own history.

## Synthetic results (all six sub-cases)

| Case | Result | Mechanism |
|---|---|---|
| E1 disjoint edits | PASS | `git merge-tree --write-tree` exit 0 predicted the clean merge; both merged; both histories intact |
| E6 append-only ledger, both sessions | PASS | `merge-tree` exit 1 predicted the conflict BEFORE any merge; resolution took the union; 3/3 events retained, valid JSONL, zero loss |
| E2 overlapping path claim | PASS | conflict predicted before the second session committed; that session stopped and abandoned its edit explicitly — no stash, no reset |
| E3 main advances mid-work | PASS | behind-count detected on fetch; composed with a normal merge; old base stayed an ancestor; no rebase |
| E4 docs-only branch | PASS | changed-path classification (`docs/` only) → continue without stopping anyone |
| E5 abandoned session | PASS | dirty worktree + unmerged branch detected; left untouched; content preserved byte-for-byte |

Invariants held across all cases: zero cross-worktree writes, zero force-push, zero rebase,
zero accidental stash or reset.

## Live confirmations from this program (not simulated)

1. **PR #4 merged mid-P0-B** while the branch was frozen on an older base. The standing
   pre-commit re-check caught it; the branch continued on its base with a recorded assessment,
   then composed when PR #5 made composition mandatory (`concurrent-session-overlap.md`).
2. **This very session:** the tasking prompt's `EXPECTED_MAIN_HINT` pointed at the PR #7 merge
   SHA while `main` had already advanced through PR #8. The preflight caught the stale hint in
   one fetch; the branch was created from the true head.

## Rules this scope validates

- `merge-tree --write-tree` is the correct non-destructive overlap oracle; run it before every
  commit and before any composition decision.
- Append-only JSONL files merge by union; never resolve one side wholesale.
- An abandoned worktree is evidence, not garbage: record it, never clean it.
- Docs-only advances never justify stopping runtime work; runtime advances demand a read of the
  exact hunks against the consumed surface before continuing.
