# Concurrent-session overlap register

**Recorded:** 2026-08-12, at the P0-B continuation preflight
**Scope:** P0-B (`fix/p0-b-ledger-concurrency`)
**Frozen base:** `60adb63ef6be09b93237d75758d3b2e817019f9c` (the P0-A merge)
**Checkpoint head:** `df195c5ce36061e46b758da92a6be64621ba5a4e`

## Why this file exists

A second session is working in the same repository at the same time. Two agents editing the
same files with no shared record is the human-scale version of the exact defect P0-B exists to
fix, so the overlap is written down before any P0-B code changes, not after a conflict.

## The other session

`git worktree list` reports a second working tree of this same repository:

```text
/Users/danielwalker/src/tailered-ai   b847abd  [fix/p0-a-capability-root-symlink]
```

**Two corrections to the continuation directive, both verified against GitHub on 2026-08-12:**

1. The directive states this work is *"not visible through GitHub, so its state cannot be
   independently inspected here."* That is **no longer true**. The branch is pushed as
   `origin/fix/p0-a-capability-root-symlink` at `b847abd98a3c2bb528f3810e81ef0cf33818d18e`.
2. The directive states the repository *"currently has no open pull request."* There is one:
   **PR #4, "P0-A follow-up: reject symlinked capability roots"** — `OPEN`, not a draft,
   `MERGEABLE`, both `verify` checks `SUCCESS`, base `main`.

Neither correction changes the instruction. It is still another session's work, it is still not
P0-B's to touch, and P0-B still finishes against its frozen base. What changes is that the
overlap is now a **live merge race** rather than a private local edit: PR #4 can merge into
`main` at any moment without warning to this session.

Verified with `git merge-base --is-ancestor`: `b847abd` is **not** an ancestor of `origin/main`,
so PR #4 is unmerged as of this record.

### Update, same day: PR #4 merged mid-execution

**`2026-08-12T08:12:42Z` — PR #4 merged as `978fbcc31577f6378b8dca4564ceafa6473f1c5e`.** The
branch was deleted, so `origin/fix/p0-a-capability-root-symlink` no longer resolves. This was
discovered by the mandatory pre-commit overlap re-check, roughly forty minutes after the record
above was written. The live merge race this file predicted is exactly what happened.

Assessment against standing rule 8 — *stop only if `origin/main` advances with a conflicting
runtime change that materially invalidates the P0-B architecture*:

| Question | Answer |
| --- | --- |
| Did a runtime file change? | Yes — `src/files.ts`, `+38/-2`, and `test/containment.test.ts`, `+118/-1`. |
| Where, exactly? | One hunk, `@@ -67,17 +67,53 @@`, entirely inside `resolveContainedWritePath`. |
| Does it touch anything P0-B consumes? | No. P0-B uses `writeAtomic`, `writeNewFile`, `appendJsonLine`, `readJsonLines`, and `isNodeError`. A diff filtered to those five identifiers returns nothing. |
| Does P0-B call `resolveContainedWritePath`? | No. It is the `product/` capability-root gate; the lock, the allocator, and the incident log all live under `.tailered/`. |
| Would the branches conflict? | No. `git merge-tree --write-tree origin/main HEAD` exits 0. |

**Decision: continue against the frozen base `60adb63e`.** `main` is not merged into this branch,
per standing rule 3. The P0-B pull request will be composed against the newer `main` at review
time, and the mergeability probe above is re-run before every commit rather than assumed to hold.

The exclusion of `src/files.ts` and `test/containment.test.ts` stays in force for the rest of the
scope. It is no longer a courtesy to a concurrent session — those files now carry merged P0-A
work, and P0-B has no reason to touch them.

## Overlapping paths

Read from published remote refs only (`git diff --name-only origin/main
origin/fix/p0-a-capability-root-symlink`). The other session's **uncommitted** working tree was
not read, stashed, reset, cleaned, committed, rebased, or merged.

PR #4 changes 35 files. Two of them are source or test files P0-B could plausibly need:

| Path | Owner | P0-B rule |
| --- | --- | --- |
| `src/files.ts` | PR #4 | **Do not modify.** P0-B consumes `writeAtomic`, `readJsonLines`, and `isNodeError` as they exist at the frozen base. Any new write primitive lives in a P0-B-owned file. |
| `test/containment.test.ts` | PR #4 | **Do not modify.** P0-B's containment assertions go in P0-B-owned test files. |

The remaining 33 are documentation and evidence under
`docs/foundation/p0-agent-safety/{README.md,corrective/,handoffs/,p0-a/,execution-ledger.jsonl}`.
P0-B writes only under `docs/foundation/p0-agent-safety/p0-b/` and
`docs/foundation/agent-platform-foundation/`, so those do not overlap — with one exception noted
below.

### `execution-ledger.jsonl` — an append-only file both scopes could append to

`docs/foundation/p0-agent-safety/execution-ledger.jsonl` is the **P0-A** ledger and PR #4
appends to it. P0-B appends only to
`docs/foundation/agent-platform-foundation/program-ledger.jsonl`. Line-level append conflicts in
a JSONL file are resolvable but silent-corruption-prone, so the separation is deliberate and
must hold: **P0-B never writes to the P0-A execution ledger.**

## P0-B temporary file ownership

For the duration of Scope 1, P0-B owns:

```text
src/lock.ts          src/sequence.ts      src/ledger.ts
src/company.ts       src/ship.ts          src/validate.ts
src/cli.ts           src/contracts.ts     src/errors.ts
test/lock.test.ts    and every new test/*.test.ts P0-B introduces
docs/foundation/p0-agent-safety/p0-b/**
docs/foundation/agent-platform-foundation/**
scripts/foundation/**
```

`src/files.ts` and `test/containment.test.ts` are **excluded** and belong to PR #4.

## Standing rules for the rest of Scope 1

1. Leave the other worktree untouched. No stash, reset, clean, commit, rebase, or merge.
2. Before every new P0-B commit: `git fetch origin`, re-check the branch base, and record
   whether any remote commit has changed an overlapping file.
3. If PR #4 merges mid-execution, **do not** merge `main` into P0-B. Finish P0-B against the
   frozen base and compose afterwards in an explicit post-PR review.
4. Stop only if `origin/main` advances with a conflicting **runtime** change that materially
   invalidates the P0-B architecture. A documentation-only advance is not that.

## Overlap checks performed

| Date | `origin/main` | Advanced since base? | Overlapping file changed on a remote branch? | Action |
| --- | --- | --- | --- | --- |
| 2026-08-12 preflight | `60adb63e` | No — identical to the frozen base | Yes: `src/files.ts`, `test/containment.test.ts` on unmerged PR #4 | Recorded; excluded both files |
| 2026-08-12 pre-commit, `P0B-HARDEN` | `978fbcc3` | **Yes — PR #4 merged** | Same two files, now merged into `main` | Assessed non-conflicting; continued on the frozen base; `merge-tree` exit 0 |
