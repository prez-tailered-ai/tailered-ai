# P0-B primitive hardening

**Step:** `P0B-HARDEN`, inserted before P0B-06 by founder direction
**Branch:** `fix/p0-b-ledger-concurrency`
**Checkpoint corrected:** `df195c5ce36061e46b758da92a6be64621ba5a4e` (preserved, never rewritten)

The lock and allocator introduced at the checkpoint were promising but carried five defects of
the same family the scope exists to remove: a failure that reports as a success. This step
closes them before either primitive is wired into canonical state, because a fail-open primitive
that is already load-bearing is far harder to correct.

## A — a failed release now fails the operation

**Before.** `withCompanyLock` ended with:

```ts
} finally {
  await releaseCompanyLock(handle).catch(() => {
    // A release failure must not mask the original error.
  });
}
```

Every release failure was discarded. Work could succeed, release could fail, and the caller was
told the operation succeeded while the repository stayed locked or of ambiguous ownership. The
next acquisition would then block or fail for reasons nothing had recorded. `releaseCompanyLock`
also removed the lock directory when owner metadata was unreadable, because `current === null`
did not fail — so a lock whose ownership could not be proven was deleted anyway.

**After.** Three outcomes, each reported for what it is:

| Work | Release | Result |
| --- | --- | --- |
| succeeds | succeeds | the work's result |
| fails | succeeds | the work error |
| succeeds | **fails** | the release error — the operation fails |
| fails | **fails** | `AggregateError` carrying **both**, in that order |

`releaseCompanyLock` now calls `assertLockHeld` first, which requires the owner file to be
present, parseable, and to carry this handle's exact token. Missing, malformed, or mismatched
ownership is a `LockOwnershipError` and the directory is left alone: a process that cannot prove
the lock is its own must not delete it, because it may be deleting someone else's.

Every release failure is written to `.tailered/incidents.jsonl` (append-only, fsynced) with
`work_failed` recorded separately, so a failed operation is never conflated with a failed
release. The incident write is best effort by necessity — the fault that broke release can break
it too — but the error is always raised, so only the durable trace can be lost, never the
failure itself.

Code: [`src/lock.ts`](../../../../src/lock.ts) — `assertLockHeld`, `releaseCompanyLock`,
`withCompanyLock`, `recordIntegrityIncident`.

## B — allocator state fails closed

**Before.** `loadState` wrapped every read, parse, and schema check in one `try`/`catch` whose
handler returned an empty allocator. Malformed JSON, a permission error, a directory in place of
the file, or a schema mismatch all became "no allocator here", every counter reset to zero, and
the next allocation reissued identifiers the repository already held. `deriveCanonicalMaxima`
did the same for ADRs with `readAdrs(root).catch(() => [])`.

**After.** `ENOENT` is the only absence. Every other failure raises `SequenceStateError` with a
`reason` naming the class — `unreadable`, `malformed`, `schema`, `counter`, or
`missing_after_bootstrap`. ADR read failures propagate; the single narrow exception is an absent
`decisions/` directory on a fresh fixture, which is checked for explicitly rather than inferred
from a failed read.

**Bootstrap happens exactly once.** A repository that predates P0-B initialises its allocator
from canonical maxima, and that migration is recorded in
`.tailered/ledger-sequence.bootstrap.json` **before** the state file is written. Marker-without-
state is therefore possible and state-without-marker is not, which is the ordering that makes
the guarantee checkable: once the marker exists, a missing state file is an integrity failure
demanding `tailered recover`, not a licence to rebuild. A silent rebuild is what would let a
crashed run's identifier be handed to a second run.

Code: [`src/sequence.ts`](../../../../src/sequence.ts) — `loadSequenceState`,
`loadBootstrapRecord`, `loadOrBootstrapState`, `readAdrsAllowingAbsentDirectory`.

### The residual gap, stated plainly

A rebuild reads what canonical files *consumed*. It cannot see an identifier that was **issued
but not yet consumed** by a run still in flight. `deriveCanonicalMaxima` therefore also reads
run start records at `evals/runs/<run-id>/started.json` and folds their reserved identifiers into
the maxima.

**Those start records do not exist yet.** P0B-12 introduces them. Until it lands, the scan finds
nothing, and the honest statement of the guarantee is:

> An identifier is never reused **as long as `.tailered/ledger-sequence.json` survives**. If it
> is lost, the loss is detected and refused rather than silently repaired. Deliberate recovery
> from canonical state alone cannot restore identifiers that were issued to an in-flight run and
> not yet written to a canonical file.

This is recorded in the residual-risk ledger and closes when P0B-12 lands. The stronger
alternative — an immutable issuance journal appended before every allocation — is not
implemented, because P0B-12's start records provide the same protection using machinery the
scope already requires.

## C — lock ownership is enforced by the API, not by a comment

**Before.** `allocateIdentifiers(root, requests)` carried the note "The caller must already hold
the repository lock" and checked nothing. Any future caller could allocate unlocked and
reconstruct the original race.

**After.** `allocateIdentifiers(handle, request)` takes a `LockHandle`, which carries its own
repository root, and calls `assertLockHeld` before touching state. There is no signature by
which a caller can allocate without having acquired the lock, and a handle whose lock was
released, reclaimed, or never taken is rejected **at the moment of use** rather than trusted
from when it was minted. A handle is a claim about the past; the check is what makes it a claim
about now.

## D — ROUTE and CALL are one reservation

`src/ship.ts:144` derives the call identifier from the route identifier by prefix substitution:

```ts
const routeLogId = await ledger.nextRouteId();
const callId = routeLogId.replace(/^ROUTE-/u, "CALL-");
```

`CALL-000042` has always been the partner of `ROUTE-000042`. The checkpoint allocator broke that
by tracking `ROUTE` and `CALL` as independent families, which would drift the instant either
allocated alone and silently break every trace relationship that assumes the pairing.

**Frozen rule:** one `ROUTE_CALL` reservation yields both identifiers, inside one critical
section. Canonical maxima take the higher of the two halves, so a legacy row whose numbers
already disagree can never have either half reissued.

A second, quieter defect fixed here: the checkpoint allocator formatted every family to six
digits, so it would have minted `ADR-000004` for a repository whose decisions are `ADR-000`
through `ADR-003`. ADR identifiers are three digits on disk and are now formatted that way.

## E — the durability boundary

**Proven, and claimed:** process-crash and `SIGKILL` recovery. When a process dies, data already
handed to the kernel survives, so the atomic-rename and append paths behave as designed.

**Not proven, and NOT claimed:** sudden power loss or kernel panic. Reading the code:

| Path | Sync behaviour |
| --- | --- |
| `appendJsonLine` (`src/files.ts:142`) | opens `a`, writes, **calls `handle.sync()`** — the file's data is fsynced. The parent directory is not, so a *newly created* ledger file's directory entry is not durable. |
| `writeAtomic` (`src/files.ts:124`) | `writeFile` to a `wx` temp file, then `rename`. **Neither the file nor the parent directory is fsynced.** |

`.tailered/ledger-sequence.json` is written through `writeAtomic`. A power cut between the write
and the rename can therefore leave the counter at its previous value on some filesystems, which
would reissue an identifier — the exact failure this scope removes, in a scenario it does not
cover.

Making this claim true needs `fd.sync()` on the temp file before rename and an `fsync` on the
containing directory afterwards, plus per-filesystem evidence. Both are deliberately out of
scope here and are recorded as residual risk. **No P0-B artifact will describe any path as
power-loss durable.**

Adding those syncs also touches `src/files.ts`, which belongs to open PR #4 for the duration of
this scope — see [`concurrent-session-overlap.md`](./concurrent-session-overlap.md).

## Evidence

| Claim | Evidence |
| --- | --- |
| The hardened tree typechecks and every test passes | 73/73, `node:24` container, recorded |
| Each hardened property is load-bearing | [`evidence/hardening-negative-control.json`](./evidence/hardening-negative-control.json) |

### The negative control, and why it exists

A test that passes against hardened code proves nothing. It is evidence only if it **fails** when
the hardening is removed. `evidence/hardening-negative-control.mjs` copies the tree, reverts
exactly one property per variant, rebuilds, and runs the suite.

**Result: 8 of 8 mutations killed by tests, with a healthy control.**

Scope of that claim, stated precisely: the artifact's `every_property_is_load_bearing` field
means *all eight selected mutations were detected by the current test system*. Eight mutations
cannot prove that every property of the system is load-bearing; they prove it for the eight
properties they revert, and nothing more.

| Variant | Property reverted | Verdict |
| --- | --- | --- |
| `MUT-000-baseline-unmutated` | none — control | `CONTROL_HEALTHY` |
| `MUT-A1-swallow-release-failure` | a failed release fails the operation | `CAUGHT` |
| `MUT-A2-release-without-ownership-proof` | release proves ownership | `CAUGHT` |
| `MUT-B1-allocator-state-fails-open` | allocator state fails closed | `CAUGHT` |
| `MUT-B2-adr-read-failure-becomes-empty` | ADR read failures propagate | `CAUGHT` |
| `MUT-B3-silent-rebuild-after-state-loss` | state loss is an integrity failure | `CAUGHT` |
| `MUT-B4-bootstrap-marker-fails-open` | the bootstrap marker fails closed | `CAUGHT` |
| `MUT-C1-allocation-without-lock-proof` | allocation proves the lock is held | `CAUGHT` |
| `MUT-D1-route-and-call-counters-diverge` | one reservation covers the pair | `CAUGHT` |

The harness took three attempts, and the two discarded ones are the reason to trust the third:

1. **Attempt 1 reported all seven properties "caught at compile" and exited 0.** It had copied
   `src`, `test`, and the configs but not `node_modules`, so `npx tsc` resolved to the
   placeholder `tsc` package on the public registry. Nothing was ever measured. The harness now
   copies `node_modules` and invokes `node_modules/.bin/tsc` directly.
2. **Attempt 2 still reported three properties "caught at compile."** All three were artifacts of
   how the mutations were written — an `if (false && ...)` short-circuit defeats TypeScript's
   null narrowing, and deleting a function's only call site leaves an unused import that
   `noUnusedLocals` rejects. A mutation that will not compile looks like a load-bearing property
   but is really a badly written experiment. All three were rewritten as faithful reverts that
   compile, so the tests do the catching.
3. **Attempt 2 also reported `MUT-B1` as `PARTIALLY_CAUGHT`**, and it was right: one expected
   test targets `loadBootstrapRecord`, a different function that mutation never touched. The
   mis-attribution was mine. That expectation moved to its own variant, `MUT-B4`.

Two guards now make a repeat harder to miss: a **control variant** that must compile and pass,
without which every other verdict is declared environment noise, and an **anchor check** that
marks a mutation `INVALID` unless its target text matches exactly once — because a mutation that
silently fails to apply produces a green run indistinguishable from a property no test can kill.
