# P0-B design decisions that require PREZ ratification

**Status: `NEEDS_PREZ`. P0B-14 (recovery) does not begin until both decisions are made.**
Recovery and validation are designed around these two semantics. Building them first and
ratifying later would put redesign risk on the wrong side of the work.

---

## A-01 — F1/F4 contradiction: allocation and append are separate critical sections

**Raised:** step P0B-10, during integration. Implemented. Recorded in
[`concurrency-contract.md`](./concurrency-contract.md) §1.6.

**The exact frozen language in conflict.**

> F1 (original): "Identifier allocation, uniqueness verification, append, and durable
> settlement occur inside **one** critical section."

> F4: call-start evidence is durable **before** agent invocation.

A route log's identifier must exist before the agent call — the call-start record and the
trace reference it. The route row cannot be complete until the agent returns, because it
carries the usage the call produced. Holding the repository-wide lock across the agent
invocation would satisfy F1 literally and would serialize every concurrent run.

**The amended language (as implemented).**

> F1 (amended): "Identifier allocation and its durable persistence occur inside one critical
> section. The append that consumes the identifier occurs inside a critical section that
> re-verifies uniqueness."

**The invariant preserved.** No two writers can derive the same identifier from the same
state. Enforced by durability instead of lock duration: the counter is persisted before the
identifier is returned (S1); reservations are durable and visible to rebuilds through
call-start records and the finalization intent (S8); the append re-proves lock ownership and
re-verifies uniqueness at the moment of use.

**The behavior changed.** An identifier may now be reserved-but-unconsumed for the duration
of an agent call. A crash in that window leaves a legal gap plus an orphan call-start record.

**Supporting tests.** `test/sequence.test.ts` (reservation visibility, never-reissued),
`test/barrier.test.ts` (deterministic serialization), `test/ledger.test.ts` (append-time
re-verification), acceptance matrices `A1-fixed-*` and `compose-n*`.

**New failure mode.** The reserved-unconsumed window. P0B-15 must detect it; P0B-14 must
settle it conservatively.

**If PREZ rejects A-01.** The only strictly-F1 architecture is holding the lock across the
agent call. It is correct and available; it serializes all concurrent runs; P0B-17 must
re-run under it, and P0B-14/15 simplify (no reserved-unconsumed state).

**Proposed decision statement.**

> PREZ accepts A-01: F1 is satisfied by durable pre-allocation plus re-verified append rather
> than a lock hold spanning agent invocation. The reservation window must remain detectable by
> validation and conservatively settleable by recovery.

---

## A-02 — terminal-ADR semantics: no fallback, recoverable instead

**Raised:** by PREZ review of the 2026-08-12 status report, which found that the then-current
code substituted the run's *causal* ADR when the terminal ADR could not be written. That row
was structurally valid and semantically false — `docs/v1-contract.md:26` requires each
terminal run to create its own ADR. This is the false-success class the program exists to
remove. **Implemented as directed; formal ratification pending.**

**The exact frozen language that changes.**

> F6 (original): "No failure of ADR writing or budget assertion may skip the terminal
> `EvalRow`." The failure is recorded into the terminal row's `blocker`.

**The proposed language (as implemented).**

> F6 (A-02): A budget-assertion failure is recorded into the terminal row's `blocker` and
> downgrades a `shipped` outcome (unchanged). A terminal-ADR failure does **not** skip, forge,
> or fall back: the run is left in a **recoverable** state — durable `started.json`, durable
> FinalizationIntentV2 carrying the exact intended ADR and the exact intended `EvalRow` —
> and `tailered recover` completes it by replaying those payloads. The evaluation is appended
> only **after** its own terminal ADR exists. A run that cannot be completed is quarantined by
> recovery. A terminal `EvalRow` therefore never references anything but its own terminal ADR,
> and a run is never `shipped` without its own decision.

**What R2 means under A-02.** "Exactly one terminal `EvalRow` per started run" becomes a
guarantee of the system *including recovery*, not of the single process alone. In-process
machinery failure leaves zero rows and a complete intent; recovery produces the one row.
At-most-one is enforced unconditionally by `#appendUnique` on `run_id`.

**Supporting tests.** `test/ledger.test.ts`: a finalization conflict leaves a recoverable run
(intent v2 present, no duplicate row, no fallback reference, no `finalized.json`); a clean run
finalizes with its own ADR and the written row byte-equal to the intent.

**What PREZ must review.** This section; the finalize block in `src/ship.ts`; the two tests
above; the FinalizationIntentV2 shape (exact ADR payload, exact EvalRow payload, SHA-256 of
both canonical serializations).

**If PREZ rejects A-02.** The alternatives are: (a) restore the causal-ADR fallback —
recreates the semantically-false-row defect; or (b) in-process retry of the ADR write and a
hard failure with no intent — loses deterministic recovery. Neither is recommended.

**Proposed decision statement.**

> PREZ accepts A-02: a terminal `EvalRow` must reference the run's own terminal ADR and is
> appended only after that ADR exists. ADR failure leaves a recoverable state completed by
> `tailered recover` from the exact recorded intent; irrecoverable runs are quarantined; no
> fallback reference is ever written.

---

## One recorded tension, for awareness, not decision

`finalization-intent.json` and `finalized.json` each carry `outcome`, which
`docs/v1-contract.md:60` guards against as terminal-state duplication. They are per-run
recovery markers, not a second ledger; P0B-15 will fail validation on any disagreement between
intent, marker, and `EvalRow`, which converts the drift risk into a detected state. If PREZ
prefers, the field can be dropped from the marker; it cannot be dropped from the intent
without losing exact replay.
