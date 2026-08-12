# P0-B concurrency contract — FROZEN

**Frozen at:** step `P0B-07`, before any primitive is wired into canonical state
**Branch:** `fix/p0-b-ledger-concurrency`, base `60adb63e`
**Source requirements:** `docs/audits/hermes-honcho/25-concurrency-remediation-contract.md` (R1–R8, A1–A7)

Freezing happens *before* integration on purpose. A contract written after the code is a
description of whatever was built; a contract written before it is something the code can fail.

Everything below is normative. Changing any frozen semantic requires a new step, a recorded
reason, and re-running the acceptance matrix — not an edit to this file.

---

## 1. The frozen semantics

### 1.1 Lock ownership

| Rule | Statement |
| --- | --- |
| L1 | Exactly one process may mutate canonical state at a time, enforced by a directory created with non-recursive `mkdir` at `.tailered/locks/company-ledger.lock`. |
| L2 | A lock is reclaimable **only** when its owner is proven dead **on this host** (`process.kill(pid, 0)` raising `ESRCH`). Lease expiry alone never authorises reclamation. |
| L3 | An expired **foreign-host** lock is **quarantined**, never reclaimed. Cross-host liveness cannot be probed, and a live owner elsewhere would corrupt exactly what the lock protects. |
| L4 | Missing or unreadable owner metadata fails closed. It is never read as "abandoned". |
| L5 | Release requires readable owner metadata **and** an exact token match. A process that cannot prove the lock is its own must not delete it. |
| L6 | A failed release fails the operation. Work success plus release failure is a **failure**. Both failing yields an `AggregateError` carrying both errors, work first. |
| L7 | Every release failure is recorded to `.tailered/incidents.jsonl` with `work_failed` distinguishing the two cases. |
| L8 | Canonical mutation requires a `LockHandle` whose lock is re-verified **at the moment of use**, not at the moment it was minted. |

### 1.2 Identifier allocation

| Rule | Statement |
| --- | --- |
| S1 | The increment is persisted **before** the identifier is returned. A crash after this point leaves a **gap**, never a reuse. |
| S2 | Gaps are legal. Reuse is not. Counters are monotonic and never repaired downward. |
| S3 | `ROUTE_CALL` is **one** family. One reservation yields `ROUTE-N` and `CALL-N`. Canonical maxima take the higher of the two halves so a legacy divergent row can never have either half reissued. |
| S4 | ADR identifiers are three digits (`ADR-004`); every other identifier is six (`ROUTE-000004`). |
| S5 | `ENOENT` is the only absence. Unreadable, malformed, schema-mismatched, and impossible-counter state each raise `SequenceStateError` with the class named. |
| S6 | A pre-P0-B repository bootstraps **once**. The marker is written **before** the state file, so marker-without-state is possible and state-without-marker is not. |
| S7 | State missing **after** bootstrap is an integrity failure requiring `tailered recover`. It is never an automatic rebuild. |
| S8 | Canonical maxima include identifiers **reserved** by started-but-unfinished runs, not only those consumed by canonical rows. |

### 1.3 Append and finalisation

| Rule | Statement |
| --- | --- |
| F1 | Identifier allocation and its durable persistence occur inside one critical section. The append that consumes the identifier occurs inside a critical section that **re-verifies uniqueness**. See amendment A-01. |
| F2 | An exact retry — every byte and every causal reference identical — is an idempotent no-op. A conflicting retry raises a typed integrity error. Never a duplicate row. |
| F3 | Accepted ADRs are immutable. Creation stays `wx`; an existing id is an `AppendOnlyViolationError`. |
| F4 | Run-start evidence is durable **before** the first possible spend. Call-start evidence is durable **before** agent invocation. |
| F5 | Finalisation intent is written **before** any ADR or terminal mutation. |
| F6 | **No failure of ADR writing or budget assertion may skip the terminal `EvalRow`.** The failure is recorded *into* the terminal row's `blocker`, never thrown past it. |
| F7 | A successful receipt is returned only after the ADR, the terminal eval, the finalised marker, and every cross-reference have been independently verified. |
| F8 | An interrupted call remains attributable and is settled **conservatively** from its recorded ceilings, never optimistically. |

### 1.4 Recovery

| Rule | Statement |
| --- | --- |
| V1 | `validate` **observes**. It never repairs. |
| V2 | `recover` is explicit, operator-invoked, and records what it did. |
| V3 | Recovery refuses to proceed while a **verified live owner** exists. |
| V4 | Ambiguous cross-host or corrupt ownership is **quarantined**, never guessed at. |
| V5 | Recovery never automatically repeats an external side effect. |

### 1.5 The durability boundary

| Claimed | Not claimed |
| --- | --- |
| Process-crash and `SIGKILL` recovery | Sudden power loss or kernel panic |

`writeAtomic` (`src/files.ts:124`) does not `fsync` the temp file or the parent directory.
`appendJsonLine` (`src/files.ts:142`) does `fsync` the file but not its parent directory. **No
P0-B artifact describes any path as power-loss durable.** Closing this would require directory
`fsync`s in `src/files.ts` plus per-filesystem evidence; both are out of scope and recorded as
residual risk.

---

## 1.6 Amendments

Freezing is only meaningful if changing it is visible. Every amendment records what changed, why,
and what it cost.

### A-01 — F1 split into allocation and append. **Needs PREZ ratification.**

**Raised:** step `P0B-10`, during integration
**Status:** implemented as stated in §1.3 F1; flagged for founder review

**The contradiction.** As originally frozen, F1 required identifier allocation, uniqueness
verification, and append to happen inside *one* critical section. F4 requires call-start evidence
to be durable *before* agent invocation. A route log's identifier must therefore exist **before**
the agent call, and its row cannot be appended until **after** the agent responds, because the row
carries the usage the call produced.

**F1 and F4 cannot both hold literally.** Satisfying F1 as written would mean holding the
repository-wide lock across the agent invocation — a network call of unbounded duration — which
would serialise every concurrent run and defeat the concurrency the acceptance matrix exists to
demonstrate. Satisfying F4 by allocating after the response would leave an invoked agent with no
durable record, which is the attribution failure R4 forbids.

**Resolution.** The safety property F1 was protecting is *"two writers must never derive the same
identifier from the same state."* That is preserved by durability rather than by lock duration:

- S1 persists the increment **before** the identifier is returned, so a reserved identifier is
  taken from the moment it is issued;
- S8 folds identifiers reserved by started-but-unfinished runs into the canonical maxima;
- the append re-verifies uniqueness inside its own critical section, and re-reads after the
  `append:after-uniqueness` barrier — a second reader finding a late row would prove mutual
  exclusion had been violated, so the check is an assertion, not a substitute for the lock.

**What this costs.** The window between allocation and append is now bounded by the agent call
rather than by the lock. Nothing else may take that identifier during the window, but a crash
inside it leaves a reserved-and-unconsumed identifier — a gap. Gaps are legal under S2; this
amendment makes them ordinary rather than exceptional.

**Why it is flagged rather than merely recorded.** It changes a frozen semantic. The rule was
that changing one requires a new step, a recorded reason, and re-running the acceptance matrix.
The first two are satisfied here; the third happens at P0B-17. PREZ should confirm the resolution
before the branch merges.

---

## 2. R1–R8 → code, test, evidence

Status is stated per requirement. **`PENDING` means not yet satisfied on this branch**, with the
step that will satisfy it named. Nothing here is marked satisfied on the strength of intent.

| # | Requirement | Code | Test | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| **R1** | Concurrency-safe identifiers; read-then-write over an unlocked append prohibited | `src/lock.ts`, `src/sequence.ts` (`allocateIdentifiers`, `allocateRouteCallPair`) | `test/sequence.test.ts` (22), `test/barrier.test.ts` GREEN ×2 | `evidence/hardening-negative-control.json` (`MUT-C1`, `MUT-D1`) | **SATISFIED** |
| **R2** | A started run appends exactly one terminal `EvalRow`, including when ADR writing fails | `src/ship.ts` finalisation state machine | crash-matrix families | — | **PENDING — P0B-13** |
| **R3** | Idempotent writes; duplicate detection must not depend on a read another process can invalidate | `src/ledger.ts` appends under `F1` | append idempotence families | — | **PENDING — P0B-10** |
| **R4** | Crash-safe finalisation; partial route logs attributable to a `run_id` | `src/ship.ts`, run-start records | crash matrix, 7 kill points | — | **PENDING — P0B-12/13/18** |
| **R5** | Atomic or recoverable ledger mutation; a torn line detectable by `validate` | `appendJsonLine` (O_APPEND + `fsync`), `src/validate.ts` | torn-write family | — | **PENDING — P0B-15/16** |
| **R6** | Deterministic contention tests — "a test that passes because the race did not happen is not evidence" | `src/barrier.ts`, barrier at `allocate:after-read` | `test/barrier.test.ts` RED + GREEN | RED reproduces the collision deterministically; GREEN proves `enter,exit,enter,exit` nesting | **SATISFIED for allocation; PENDING for the four finalisation boundaries — P0B-13** |
| **R7** | `validate` exits 0 after N ∈ {2,3,10} concurrent runs, zero duplicate ids, every ADR unique | whole integration | acceptance matrix | `evidence/A6-prefix-n{2,3,10}.json` currently records the **defect**, not the fix | **PENDING — P0B-17** |
| **R8** | Abandoned-worker recovery; ownership distinguishes "in progress" from "abandoned" without guessing | `src/lock.ts` (`LockOwner` carries pid, host, timestamps), `tailered recover` | recovery + quarantine families | `MUT-A2` proves ownership proof is load-bearing | **PARTIAL — ownership state exists; `recover` PENDING — P0B-14** |

## 3. A1–A7 → verification method

| # | Criterion | How it is verified | Status |
| --- | --- | --- | --- |
| **A1** | N concurrent runs → exactly N terminal `EvalRow`s, N ∈ {2,3,10} | count rows, compare to N; N=10 run ≥3× | **PENDING — P0B-17** |
| **A2** | Zero duplicate identifiers of any kind | parse all `.jsonl`, assert id-set size equals row count | **PENDING — P0B-17** |
| **A3** | `validate --repo` exits **0** | exit code read **directly**, never through a pipe | **PENDING — P0B-17** |
| **A4** | Every ADR id unique; no accepted ADR modified | hash all `decisions/*.md` before and after | **PENDING — P0B-17** |
| **A5** | Killed mid-run → detectable, attributable, recoverable | real `SIGKILL` at 7 kill points | **PENDING — P0B-18** |
| **A6** | The contention test fails on the pre-fix code | run against `6172653e`; it **must** reproduce | **SATISFIED** — `evidence/A6-prefix-n{2,3,10}.json`: 1/2, 1/3, 2/10 runs shipped; `Duplicate route log id: ROUTE-000006`; validator exit 1. Also reproduced deterministically in-process by `test/barrier.test.ts` RED. |
| **A7** | Existing behaviour unchanged | full suite, `validate`, `demo` green single-run | **SATISFIED so far** — 79/79 tests, `validate` exit 0, `demo` `costUsd` 0.068 byte-identical to the recorded baseline. Re-verified at P0B-19. |

**A6 is not optional, and it is met twice.** The cross-process harness reproduced the defect
against the pre-fix commit, and the in-process barrier test reproduces it deterministically
rather than by luck — which is what R6 demands and what the original N-run harness, on its own,
could not provide.

---

## 4. Barrier placement

Six boundaries are frozen. Each is inert unless a handler is installed **in-process**; no
environment variable, file, socket, or signal can populate the registry, so a deployed process
cannot be paused by anything outside its own code.

| Barrier point | Boundary | Placed |
| --- | --- | --- |
| `allocate:after-read` | state read, next id decided, nothing persisted | **yes** — `src/sequence.ts` |
| `append:after-uniqueness` | uniqueness proven, row not yet appended | P0B-10 |
| `adr:before-create` | before the `wx` create | P0B-11 |
| `finalize:before-intent` | before finalisation intent is durable | P0B-13 |
| `finalize:before-terminal-eval` | the Race B site | P0B-13 |
| `finalize:before-marker` | before the finalised marker | P0B-13 |

---

## 5. What this contract deliberately does not promise

1. **Power-loss durability.** See §1.5.
2. **Identifier non-reuse across loss of both allocator files.** `S7` detects and refuses; it
   does not reconstruct. `S8` closes the in-flight case once P0B-12's run-start records exist —
   the scan is implemented and returns nothing until then.
3. **Cross-host mutual exclusion.** `L3` quarantines rather than guessing. Two hosts sharing one
   working tree is an unsupported topology, detected rather than silently mishandled.
4. **Protection from code already inside the process.** Barriers, and every guarantee here,
   assume the process is not adversarial to itself. Agent-authored code is contained by P0-A's
   capability roots, which is a separate control.
