# P0-B checkpoint — steps 01-05 complete, implementation in progress

**Status: IN PROGRESS. This is not a completed scope and must not be read as one.**
No pull request has been opened. P0B-21 requires the full evidence corpus first.

## Completed and evidenced

| Step | Result | Evidence |
|---|---|---|
| P0B-01 | **PASS** — `main` descends from the P0-A merge `60adb63e`; no conflicting P0-B branch | verified live |
| P0B-02 | **PASS** — isolated worktree, branch `fix/p0-b-ledger-concurrency` from `origin/main` | base `60adb63e` |
| P0B-03 | **PASS** — program evidence root + `scripts/foundation/run-recorded.mjs` | `evidence/wrapper-selftest-*` |
| P0B-04 | **PASS** — baseline frozen: 33/33 tests, `validate` `valid: true`, demo `$0.068` | `evidence/baseline-*.attempt2.*` |
| P0B-05 | **PASS** — A6 red proof: the defect reproduces | `evidence/A6-prefix-n{2,3,10}.json` |

### The recorded-execution wrapper is itself proven (P0B-03)

Four self-tests, all recorded: a success stays a success; a command exiting 3 is recorded
`FAIL` and the wrapper **also** exits 3; a `SIGKILL` is recorded as `exit_code: null` with the
signal named rather than flattened into a number the process never returned; and a second
attempt at an existing evidence path is refused with exit 64. Zero environment **values** and
zero raw home paths appear in the ledger — names only.

Its first real use failed honestly: a zsh word-splitting mistake of mine passed the whole
`docker run …` string as one argv element, and the wrapper recorded `spawn … ENOENT` at exit
127 rather than reporting a green baseline. Attempt 1's failure is retained; attempt 2 is the
green baseline. That is the intended behaviour of the tool.

### A6 — the defect reproduces (acceptance criterion satisfied)

Against the pre-fix commit `6172653e`, with a deterministic agent making zero model calls:

| N | Runs that shipped | Identifier-collision halts | `validate` exit | Severe form |
|---:|---:|---:|---:|---|
| 2 | 1 / 2 | 1 | 0 | — |
| 3 | 1 / 3 | 2 | 0 | — |
| 10 | 2 / 10 | 8 | **1** | `Duplicate route log id: ROUTE-000006`, `Duplicate agent call id: CALL-000006` |

Race A has two manifestations and both are now measured: the **severe** form, where the
interleave slips past the uniqueness check and duplicate rows persist; and the **detected**
form, where the check catches the collision and a run that did real work is destroyed by
contention alone (`blocker: "Route log ROUTE-000001 already exists."`).

**A correction worth recording.** The first version of this harness scored only the severe
form and reported `all_clean: true` for a trial in which two of three runs had just been
killed by an identifier collision. That was a false green produced by asking the wrong
question — the same failure class this program exists to remove. The harness now fails on
either form, and additionally derives "started" from each run's own announced `runId` rather
than from the route log, because a run that dies before its first route append leaves no route
row and a route-only measure silently under-counts the runs that were lost.

## Implemented, typechecked, and unit-tested

- `src/lock.ts` — one repository mutation lock at `.tailered/locks/company-ledger.lock/`,
  acquired by atomic `mkdir`. Owner metadata carries schema version, token, pid, host,
  acquisition time, lease deadline, operation and run id.
- `src/sequence.ts` — durable allocator at `.tailered/ledger-sequence.json`. Persists the
  increment **before** returning an identifier, rebuilds from canonical ledgers and ADRs when
  absent, repairs upward only, records every repair, never reuses an identifier.

Both live outside `product/`, so an agent authorised to write the product subtree can neither
observe nor corrupt them — the constraint the P0-A handoff requires P0-B to preserve.

**15/15 tests pass** (`test/lock.test.ts`), including the ones that matter most:
a live same-host owner is never stolen even past its lease; an expired **foreign-host** lock is
quarantined rather than reclaimed, because cross-host liveness cannot be probed; unreadable
owner metadata fails closed; `withCompanyLock` releases even when the work throws; and a
rebuilt allocator never reissues an identifier canonical state already holds.

## Not yet done — the remainder of Scope 1

P0B-06 (ship-loop contention barriers), P0B-07 (frozen contract and architecture documents),
P0B-10/11 (atomic idempotent appends; concurrency-safe ADR allocation), P0B-12/13 (durable
run/call start records; crash-safe finalization so the terminal `EvalRow` can never be skipped),
P0B-14/15 (`recover` command with quarantine; extended validation), P0B-16/17/18 (remaining test
families; acceptance matrix N∈{2,3,10}×3; crash matrix across 7 kill points), P0B-19/20
(regression suite and evidence corpus), P0B-21 (commit, push, draft PR).

The new primitives are **not yet wired into `src/ledger.ts` or `src/ship.ts`**, so the defect
reproduced above is still present on this branch. Nothing here claims otherwise.

---

## Dated addendum — 2026-08-12, after the checkpoint (appended, never rewritten)

Everything above describes the branch **at `df195c5`** and was accurate when written. It is
now historical: later commits on this branch wired the primitives into `src/ledger.ts` and
`src/ship.ts` (`94074af`), composed the corrected P0-A foundation required by PR #5
(`4594ce99`, merging `origin/main` `38e08bfb`), and closed the transaction-encapsulation and
terminal-ADR-semantics gaps found by PREZ review. The sentence "the defect reproduced above is
still present on this branch" **no longer describes the branch head** — the same harness now
records N=2/3/10 clean (`evidence/A1-fixed-*`, `evidence/compose-n*`). Live status:
`requirements-status.json` and the program ledger, not this checkpoint.
