# P0-B architecture — FROZEN

**Frozen at:** step `P0B-07`, before integration. Companion to
[`concurrency-contract.md`](./concurrency-contract.md), which holds the normative rules.

## 1. The two defects

### Race A — read-then-write identifier allocation

Pre-fix, `src/ledger.ts` derived the next identifier from the current row count:

```ts
async nextRouteId(): Promise<string> {
  return formatLedgerId("ROUTE", (await this.routes()).length + 1);
}
```

and `appendRouteLog` separately re-read the file, checked uniqueness, and appended. Between the
read and the append, any other process could append. Two writers read the same length, computed
the same identifier, and one of them lost:

```text
writer 1: read routes.jsonl -> 5 rows -> ROUTE-000006
writer 2: read routes.jsonl -> 5 rows -> ROUTE-000006      <- same id
writer 1: uniqueness check passes, appends ROUTE-000006
writer 2: uniqueness check FAILS  -> "Route log ROUTE-000006 already exists" -> run halts
```

Observed at N=10: two of ten runs shipped, eight halted on collisions, and `validate` exited 1
with `Duplicate route log id: ROUTE-000006` and `Duplicate agent call id: CALL-000006`
(`evidence/A6-prefix-n10.json`).

### Race B — terminal-record loss through ADR collision

Finalisation attempted the ADR write and the terminal `EvalRow` in an order where a throw from
the ADR path escaped before the terminal row was written. A run that had genuinely happened, and
genuinely spent money, could leave **no terminal record at all** — violating the constitutional
invariant that every started run has exactly one terminal `EvalRow`.

Race A causes Race B: colliding ADR identifiers are what makes the ADR write throw.

## 2. Module layout

```text
src/barrier.ts    deterministic interleaving points; in-process registry, empty by default
src/lock.ts       one repository mutation lock; ownership proof; integrity incidents
src/sequence.ts   durable monotonic allocator; bootstrap-once; ROUTE/CALL pairing
src/ledger.ts     canonical appends, inside the critical section          [P0B-10]
src/ship.ts       run/call start records; finalisation state machine      [P0B-12/13]
src/validate.ts   observes every new failure state; never repairs         [P0B-15]
src/cli.ts        `tailered recover`                                       [P0B-14]
```

Nothing lives under `product/`. The lock, the allocator state, its bootstrap marker, and the
incident log are all under `.tailered/`, so an agent holding the `product/` capability root
granted by P0-A can neither observe nor corrupt any of them.

`src/files.ts` is **not modified by P0-B**. It carries merged P0-A work — see
[`concurrent-session-overlap.md`](./concurrent-session-overlap.md).

## 3. The critical section

Everything that can produce a duplicate happens between one acquire and one release:

```text
withCompanyLock(root, {operation, runId}, async (handle) => {
    assertLockHeld(handle)          <- ownership re-proven at the moment of use
    loadOrBootstrapState()          <- fail closed on anything but ENOENT
    deriveCanonicalMaxima()         <- consumed rows + reserved-by-started-run identifiers
    reconcile()                     <- upward only; gaps legal, reuse never
    barrier("allocate:after-read")  <- inert in production; the Race A decision point
    writeSequenceState()            <- DURABLE BEFORE THE ID IS RETURNED
    ... uniqueness check ...
    barrier("append:after-uniqueness")
    appendJsonLine()                <- O_APPEND + fsync
})
```

Release is not best-effort. Work success plus release failure is a failure, both failing yields
an `AggregateError`, and every release failure is recorded to `.tailered/incidents.jsonl`.

### Why a lock and not compare-and-swap

The audited reference pattern was a CAS claim with a TTL. It was rejected for this codebase for
one reason: **CAS on a plain append-only JSONL file has no atomic compare primitive.** Emulating
one needs a side file, which is a lock wearing a different name. A directory created by
non-recursive `mkdir` is atomic on every supported platform, needs no dependency, and leaves the
ledger files exactly as they are.

Reimplemented in zero-dependency TypeScript. Not imported. Ruflo is a rejected, read-only
external reference and contributes no code here.

## 4. Ownership, liveness, and quarantine

The lock owner file carries claimant identity and timestamps so "in progress" and "abandoned"
are distinguishable without guessing (R8):

```json
{ "schema_version": 1, "token": "<uuid>", "pid": 4242, "host": "...",
  "acquired_at": "...", "deadline_at": "...", "operation": "finalize", "run_id": "RUN-..." }
```

| Observation | Decision | Why |
| --- | --- | --- |
| same host, `process.kill(pid, 0)` → `ESRCH` | **reclaim** | provably dead |
| same host, signal succeeds | **wait**, even past the lease | a slow run and a dead one are indistinguishable by clock |
| same host, `EPERM` | **wait** | the process exists under another user; existing is enough to refuse |
| foreign host, lease expired | **quarantine** | cross-host liveness cannot be probed; stealing would corrupt what the lock protects |
| owner file missing or unreadable | **fail closed** | a half-written owner file is also what an in-flight acquisition looks like |

Age alone never authorises reclamation. That is the single decision most concurrency bugs are
made of.

## 5. Finalisation state machine (P0B-13, specified here, not yet built)

```text
        started ──> called ──> intent ──> adr? ──> terminal ──> finalized
           │           │          │         │          │
           │           │          │         └── failure recorded INTO the terminal row's
           │           │          │             blocker, never thrown past it        [F6]
           │           │          └── intent durable BEFORE any ADR or terminal mutation [F5]
           │           └── call-start durable BEFORE agent invocation                 [F4]
           └── run-start durable BEFORE the first possible spend                      [F4]
```

Durable markers, all under `evals/runs/<run-id>/`:

| File | Written | Carries |
| --- | --- | --- |
| `started.json` | before the first possible spend | run id, route id, call id, task, model, tier, hard cost ceiling, hard token ceiling, owner identity, start time, `caused_by` |
| `calls/<call-id>.started.json` | before agent invocation | call id, ceilings, start time |
| `finalization-intent.json` | before ADR and terminal mutation | the exact terminal row to be written |
| `finalized.json` | last | proof that every artifact and cross-reference was verified |

**An unmatched `started.json` means interrupted, never success** — the same two-event rule the
program ledger uses on itself. A receipt is returned only after ADR, terminal eval, marker, and
cross-references are independently verified (F7).

`started.json` is also load-bearing for the allocator: `deriveCanonicalMaxima` folds its reserved
identifiers into the maxima, which is what makes an identifier durable from the moment it is
issued rather than from the moment it is consumed (S8).

## 6. Recovery model (P0B-14, specified here, not yet built)

```text
validate  ── observes, never repairs, exits nonzero on any new failure state   [V1]
recover   ── explicit, operator-invoked, records what it did                   [V2]
```

`recover` completes a recorded finalisation intent idempotently, settles an interrupted call
**conservatively from its recorded ceilings** rather than optimistically, refuses to run while a
verified live owner exists (V3), quarantines ambiguous cross-host or corrupt ownership rather
than guessing (V4), and never automatically repeats an external side effect (V5).

Conservative settlement is deliberate: a run killed after the model responded but before the cost
was recorded really did spend money. Settling at the ceiling can overstate spend; settling at
zero understates it and lets the `$5.00` cap be exceeded by repeatedly killing runs. Overstating
is the safe direction, and it is recorded as an estimate rather than a measurement.

## 7. Testing strategy

| Layer | What it proves | Where |
| --- | --- | --- |
| Unit | each primitive's failure classes, one test per named mechanism | `test/lock.test.ts`, `test/sequence.test.ts` |
| Deterministic contention | the race is forced, not hoped for (R6) | `test/barrier.test.ts` |
| Negative control | each hardened property is load-bearing — reverting it kills a test | `evidence/hardening-negative-control.mjs` |
| Cross-process acceptance | N ∈ {2,3,10}, N=10 ≥3× | P0B-17 |
| Crash matrix | real `SIGKILL` at 7 kill points | P0B-18 |

The negative control exists because a test suite that has never been seen red is a description
of current behaviour, not a guarantee. It failed usefully twice before it worked — both discarded
runs are recorded in [`primitive-hardening.md`](./primitive-hardening.md) rather than deleted.
