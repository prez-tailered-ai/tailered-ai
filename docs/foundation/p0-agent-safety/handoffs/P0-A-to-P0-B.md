# Handoff — P0-A to P0-B

P0-B may not begin until PREZ merges P0-A. This file records the exact merged-state
assumptions P0-B is entitled to rely on.

## Prerequisite

| Item | Value |
|---|---|
| P0-A branch | `fix/p0-a-agent-write-containment` |
| P0-A base | `main` @ `5eea7766bdc770c5a6e75ad2da5aded85b2356a3` |
| P0-A final SHA | recorded in the PR; PREZ records the **merge** SHA on approval |
| P0-B starts from | the PREZ-approved merge SHA on `main`, nothing else |

**P0-B Step 1 must verify** that `main` contains the P0-A merge, that the containment tests
pass, and that baseline validation is green — before any concurrency work begins.

## What P0-A guarantees to P0-B

1. **A single enforcement point for externally supplied write paths.**
   `resolveContainedWritePath(root, capabilityRoot, relativePath)` in `src/files.ts`.
   `applyProductFiles` in `src/ship.ts` is the only caller, and it covers agent codegen,
   critique repair, and founder gate edits.
2. **Protected surfaces are unreachable by agent or gate writes.** `decisions/`, `AGENTS.md`,
   `policies/`, `loops/`, `seats/`, ledgers and config all sit outside the capability root
   and are therefore out of reach — no denylist is involved.
3. **Batch atomicity of the decision.** Every destination in a write batch is resolved before
   any byte is written, so a rejected batch leaves no partial artifact.
4. **15 containment tests** in `test/containment.test.ts`, one per failure class.
5. **All pre-existing invariants intact**: reserve/settle ordering, gate label capture, model
   registry sourcing, append-only ADRs, terminal `EvalRow` per started run, `$0.068` demo.

## What P0-A explicitly does NOT fix — this is P0-B's scope

P0-A deliberately changed nothing about identifier allocation or finalization. The following
remain **open and reproducible** on the P0-A branch:

1. **Read-then-write identifier allocation.** `nextEvalId()`, `nextLabelId()`, `nextRouteId()`
   compute `rows.length + 1` and are not atomic with the append that follows.
2. **Check-then-append races.** `appendRouteLog` / `appendTerminalEval` / `appendGateLabel`
   verify uniqueness separately from appending.
3. **Terminal-record loss.** `appendAdr` runs before `appendTerminalEval` inside the same
   `finally`, so an ADR id collision throws past the terminal write and a started run leaves
   **no terminal `EvalRow`** — violating the constitution's unconditional law.
4. **ADR id collision** under concurrent `writeAdr` with `wx` exclusive create.
5. **No durable "run started" marker**, so exactly-once cannot yet be proven after an
   interruption.

Reproduction, root cause, and the full remediation contract:
[`docs/audits/hermes-honcho/25-concurrency-remediation-contract.md`](../../../audits/hermes-honcho/25-concurrency-remediation-contract.md)
(requirements R1-R8, acceptance criteria A1-A7).

## Interaction P0-B must preserve

- **Do not weaken containment to make concurrency easier.** If a lock file or reservation
  lives on disk, it must not be writable through the `product/` capability, and it must not
  be placed inside `product/` where an agent could observe or corrupt it.
- **`applyProductFiles` resolves before writing.** If P0-B introduces a critical section
  around ledger commits, containment resolution should stay *outside* it — it touches only
  the product subtree and must not extend lock hold time.
- **Rerun the P0-A tests.** P0-B Step 16 requires the containment suite to stay green;
  P0-B may not regress P0-A.

## Conventions to inherit

Evidence layout, the execution-ledger event shape, disposable-fixture discipline,
deterministic agents, direct exit-code reading, one-test-per-failure-class, hash-based
assertions, and recording caveats rather than hiding them. All described in
[`../README.md`](../README.md).

## Known residual carried into P0-B

The TOCTOU boundary documented in
[`../p0-a/containment-contract.md`](../p0-a/containment-contract.md): a local process with
write access to the company repository could swap a verified directory for a symlink between
check and rename. P0-B's concurrency work **increases the number of concurrent local
processes**, so if P0-B introduces additional write paths it should not widen that window.
