# 25 — Ledger concurrency remediation contract

> **Fulfilment notice (2026-08-12, post-closure).** This contract has been **implemented and
> merged**: PR #7 (`81bdfd7a`, implementation `f2dfed89`), R1–R8 8/8 and A1–A7 7/7 VERIFIED.
> See [`29-post-closure-remediation-receipt.md`](29-post-closure-remediation-receipt.md).
> The contract text below is unedited and remains the specification of record.

**Status: PREREQUISITE. Blocking for multi-agent execution in `prez-tailered-ai/tailered-ai`.**

This defect was found by executing the target system, not by reading it. It is the single
hard prerequisite before Tailered AI expands into high-concurrency agent execution, and it
**cannot be repaired by any external agent runtime** — the corruption occurs after the agent
returns, inside Tailered's own append path.

**This contract specifies the fix. It does not apply it.** No remediation is implemented in
the audit-publication commit; implementation requires separate authorization.

---

## 1. The evidence

Three `tailered ship` runs launched simultaneously against one minted company, same
deterministic agent, Node v24.11.1, target commit
[`6172653e`](https://github.com/prez-tailered-ai/tailered-ai/tree/6172653e0aca0981d0abaf4ad8e9d587667737e9).

| Run | Exit | Result |
|---|---|---|
| 1 | 2 | `halted_attempts` — `Route log ROUTE-000007 already exists.` |
| 2 | 1 | **crashed outside the run loop** — `ADR-002 already exists. Accepted ADRs are never edited.` No receipt emitted. |
| 3 | 0 | `shipped` |

Resulting repository state:

```text
route ids : ROUTE-000001 ×3, ROUTE-000004 ×3, ROUTE-000007, ROUTE-000008   (4 duplicates)
validate  : TRUE exit code 1, 10 integrity errors
runs with route logs : 3      runs with terminal eval : 2
STARTED RUN WITH NO TERMINAL EVAL : RUN-20260811223523147-3d5cc699
```

The exit code was read directly rather than through a pipe, because `cmd | tail` returns
`tail`'s status and had produced a false pass earlier in this audit.

### Validator output (verbatim)

```text
Duplicate route log id: ROUTE-000001
Duplicate route log id: ROUTE-000001
Duplicate route log id: ROUTE-000004
Duplicate route log id: ROUTE-000004
Duplicate agent call id: CALL-000001
ROUTE-000001 has no terminal eval for RUN-20260811223523147-3d5cc699.
Duplicate agent call id: CALL-000001
ROUTE-000004 has no terminal eval for RUN-20260811223523147-3d5cc699.
Duplicate agent call id: CALL-000004
Duplicate agent call id: CALL-000004
```

## 2. The constitutional invariant that was violated

> "Every started run appends exactly one terminal `EvalRow`."
> — [`AGENTS.md`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/AGENTS.md), operating law; restated in [`docs/v1-contract.md`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/docs/v1-contract.md)

Run `…3d5cc699` started, consumed tokens, wrote two route logs, and left **no terminal
record**. The failure half of the tokens-per-outcome corpus — which
[`docs/v1-contract.md`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/docs/v1-contract.md)
calls first-class evaluation data — was silently lost.

**Scope calibration, stated honestly:** this is **not** a v1 contract violation. v1 contracts
one ship loop and never claims concurrent runs; the single-run demo and CI are green. It is a
**prerequisite defect for the agent-platform trajectory**, and the invariant it breaks is
written unconditionally.

## 3. Root cause — two independent race classes

### Race A — read-then-write identifier allocation

`nextRouteId` / `nextEvalId` / `nextLabelId` compute `rows.length + 1`
([`src/ledger.ts:117-127`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/ledger.ts#L117-L127)),
and the append functions re-check for the id before appending
([`src/ledger.ts:82-103`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/ledger.ts#L82-L103)).
Both are time-of-check/time-of-use over an unlocked `open(...,"a")`
([`src/files.ts:52-64`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/files.ts#L52-L64)).
Two processes read the same length and allocate the same id.

### Race B — terminal-record loss through ADR collision

Inside `taileredShip`'s `finally`, `appendAdr` runs at
[`src/ship.ts:420`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/ship.ts#L420)
**before** `appendTerminalEval` at
[`src/ship.ts:466`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/ship.ts#L466).
ADR files are created with `flag: "wx"`
([`src/files.ts:44-50`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/files.ts#L44-L50)),
so a concurrent id collision throws `AppendOnlyViolationError` **out of the `finally`** and
the terminal eval is never written.

Race B is the severe one: Race A produces a *detectable* duplicate, Race B produces a
*silent absence*.

## 4. Why no external agent runtime can fix this

The corruption happens strictly **after** `options.agent.invoke()` returns, in Tailered's own
finalisation path. A Hermes-derived process agent, or any other runtime, sits on the far side
of the [`docs/agent-protocol.md`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/docs/agent-protocol.md)
boundary and returns a JSON payload. It has no visibility into, and no influence over, ledger
id allocation or `finally` ordering.

**Consequence for adoption:** ledger concurrency-safety is a *prerequisite for*, not a
*beneficiary of*, any upstream execution adoption. Adopting Hermes's worker isolation would
not deliver safe parallel execution in Tailered.

## 5. Objectives this defect blocks

Every one of these is currently unattainable regardless of which runtime executes the work:

- parallel agent execution against one company repository;
- multi-agent task fan-out with a shared ledger;
- a worker fleet with more than one concurrent claimant;
- any tokens-per-outcome analysis that assumes ledger completeness;
- any promotion/regression gate that reads terminal outcomes (see
  [26](26-procedure-outcome-architecture.md), which depends on every started run having a
  terminal row).

## 6. The remediation contract

Eight requirements. Each is testable, and each maps to an acceptance criterion in §7.

### R1 — Concurrency-safe identifiers
Identifier allocation must be atomic with respect to concurrent processes. Acceptable
implementations: allocate-on-write with `EEXIST` retry and re-read; an advisory lock file
around allocate+append; or a monotonic allocator whose state is itself written with `wx`.
**Read-then-write over an unlocked append is prohibited.** The CAS-claim shape in Hermes's
Kanban (`claim_task`, `ON CONFLICT`-style claim + TTL) is the reference pattern —
**reimplemented in Tailered's zero-dependency TypeScript, not imported**.

### R2 — Terminal-row guarantee
A started run **must** append exactly one terminal `EvalRow`, including when ADR writing
fails. Reorder finalisation so `appendTerminalEval` cannot be skipped: the ADR write must be
attempted in a way whose failure is *recorded into* the terminal row's `blocker` rather than
thrown past it. No exception raised by ADR writing may escape the `finally` before the
terminal row is written.

### R3 — Idempotent writes
Re-appending a record that already exists must be a detectable no-op or a typed error, never
a duplicate row. `appendGateLabel`, `appendRouteLog`, and `appendTerminalEval` must remain
idempotent per `run_id`, and duplicate detection must not depend on a prior read that another
process can invalidate.

### R4 — Crash-safe finalisation
A process killed between the agent response and the terminal write must leave the ledger
either (a) with a terminal row, or (b) in a state a recovery pass can complete
deterministically. Partial route logs with no terminal row must be detectable and
attributable to a specific `run_id`.

### R5 — Atomic or recoverable ledger mutation
Each append must be atomic at the line level, or recoverable by a documented repair
procedure. A torn line must be detectable by `validate` rather than silently parsed.

### R6 — Deterministic contention tests
A test must reproduce contention **deterministically**, not by luck: inject a barrier between
allocation and append so two writers provably interleave. A test that passes because the race
did not happen is not evidence.

### R7 — Parallel-run validation
`validate --repo` must exit **0** after N concurrent runs for N ∈ {2, 3, 10}, with exactly N
terminal rows, zero duplicate `ROUTE-*`/`CALL-*`/`EVAL-*`/`LABEL-*` ids, and every ADR unique
and unmodified.

### R8 — Abandoned-worker recovery
A run whose process dies must be reclaimable: either finalised with a terminal row naming the
abandonment as its blocker, or explicitly quarantined. Ownership must carry enough state
(claimant identity, timestamp) to distinguish "in progress" from "abandoned" without guessing.

## 7. Acceptance criteria

All must hold before multi-agent execution is authorised:

| # | Criterion | Verification |
|---|---|---|
| A1 | N concurrent runs → exactly N terminal `EvalRow`s | count rows, compare to N, for N ∈ {2,3,10} |
| A2 | Zero duplicate ledger identifiers of any kind | parse all `.jsonl`, assert id-set size equals row count |
| A3 | `validate --repo` exits **0** | read the exit code **directly**, never through a pipe |
| A4 | Every ADR id unique; no accepted ADR modified | hash all `decisions/*.md` before and after |
| A5 | Killed mid-run → detectable, attributable, recoverable | SIGKILL between response and terminal write |
| A6 | The contention test fails on the pre-fix code | run it against `6172653e`; it **must** reproduce the defect |
| A7 | Existing behaviour unchanged | 18/18 tests, `validate`, and `demo` still green single-run |

**A6 is not optional.** A concurrency test that has never been seen red proves nothing; the
POC-C harness already demonstrates the failure and should be the basis of the regression test.

## 8. Explicit non-goals

- Do **not** introduce a database. The company format is plain files, and that is the product
  ([`docs/platform-brief.md`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/docs/platform-brief.md)).
- Do **not** add a runtime dependency. Tailered installs 4 packages with 0 vulnerabilities;
  that is a defended property.
- Do **not** weaken append-only semantics or `wx` immutability to make concurrency easier.
- Do **not** relax the exclusive `$5.00` cap or reserve/settle ordering as a side effect.
- Do **not** implement this inside the audit-publication commit.

## 9. Reproduction

The executed harness is described in
[23-reproduction-instructions.md](23-reproduction-instructions.md) (POC-C). It mints a company
in a temporary directory, launches three concurrent `ship` runs with a deterministic agent
that makes **zero model calls**, and reports ledger state plus the true `validate` exit code.
