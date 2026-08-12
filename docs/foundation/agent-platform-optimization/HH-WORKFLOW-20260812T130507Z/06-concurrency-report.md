# 06 — Concurrent-session safety (Scenario D)

All synthetic cases ran in disposable clones under a scratch fake origin seeded with
exactly `0d55aa9e`. The real remote was unreachable from the harness by construction.
Raw log: [`evidence/scen-harness.log`](evidence/scen-harness.log).

## Results

| Case | Setup | Result | Verdict |
|---|---|---|---|
| d1 disjoint edits | two worktrees, two branches, disjoint files | `git merge-tree` CLEAN; both merge without contact | PASS |
| d2 overlapping claims | both sessions edit one file | conflict detected **pre-merge** by `merge-tree`; recorded; no blind merge attempted | PASS |
| d3 stale ownership | registry entry with dead heartbeat | `W3-gone` flagged stale by heartbeat age | PASS |
| d4 docs vs runtime classification | one docs-only branch, one with a `.ts` commit | **attempt 1 FAIL** (false DOCS_ONLY), attempt 3 PASS after root-cause fix | PASS (repaired) |
| d5 abandonment | dirty uncommitted worktree left behind | flagged; file **preserved**, nothing cleaned | PASS |
| d6 base advance | fake-origin main advanced mid-session | branch updated by **merge, not rebase**; no force-push | PASS |

Safety invariant held throughout: the harness issued zero `stash`, `reset --hard`,
`rebase`, or force-push commands, lost no evidence, and recorded every overlap.

## The d4 defect is a real trap, kept on the record

The classifier used `git diff --name-only | grep -qvE '<docs patterns>'`. On this
platform's BSD grep, **`-q` combined with `-v` returns success only when zero lines match
the pattern** — not when at least one line survives the inversion. A worktree containing a
runtime `.ts` change classified as DOCS_ONLY: a false negative in the dangerous direction
(runtime change waved through as documentation). Fix: test output non-emptiness
(`[ -n "$(... | grep -vE ...)" ]`), never `-q -v`. Attempts: 3 of 3 allowed; failed
attempts retained in the log.

## Live concurrency observed during this run (not synthetic)

- **PR #9** (`audit/ruflo-post-p0b-workflow-readiness`, another session) was OPEN
  throughout this run, based on the same main `0d55aa9e`, claiming `decisions/ADR-005.md`
  and its own run directory `AGENT-WORKFLOW-20260812T122100Z/`. Path-collision census
  against this run's write set: **zero overlap** (different run directory; PR #9 touches
  neither `docs/audits/hermes-honcho/` nor the master execution ledger). Disposition:
  read-only inspection of its file list only; no interaction; recorded here and in the
  risk register.
- The program's own history already contains the real-world version of every synthetic
  case: the P0-B branch that moved three times while quarantined, the invalid-base
  collision, and the session-isolation override — see `09-github-lifecycle-report.md`.

## Rules this scenario re-proves

1. One writer per path; readers fan out freely.
2. Overlap is detected before merging (`merge-tree`), never discovered by merging.
3. Another session's work is reported, never stashed, cleaned, rebased, or "fixed".
4. Behind-main is resolved by merging main into the branch; rebase and force-push stay
   prohibited on published work.
5. Classifiers guarding the docs/runtime boundary must be proven able to go red
   (see `08-loop-engineering-report.md`).
