# Handoff — P0-A to P0-B

> ## ⛔ `60adb63` IS NOT AN ACCEPTABLE P0-B BASE
>
> PR #3 merged P0-A implementation **v1** at `60adb63`, and v1 still permits four
> capability-root symlink escape classes — including a write outside the repository, and
> one through the founder gate. Starting P0-B there would build concurrency work on an
> unsound write boundary, which is exactly the ordering P0-A exists to prevent.
>
> **P0-A corrective merge SHA: `PENDING PREZ MERGE`**
>
> P0-B remains **BLOCKED** until the corrective follow-up merges and PREZ issues the
> authorization message naming that new SHA.

P0-B may not begin until PREZ merges the P0-A **corrective** PR. This file records the
exact merged-state assumptions P0-B is entitled to rely on.

## Prerequisite

| Item | Value |
|---|---|
| Original P0-A branch | `fix/p0-a-agent-write-containment` |
| Original P0-A base | `main` @ `5eea7766bdc770c5a6e75ad2da5aded85b2356a3` |
| v1 head / merge | `2f8fb9a` merged at **`60adb63`** — **incomplete, not a valid base** |
| Corrective branch | `fix/p0-a-capability-root-symlink`, based on `60adb63` |
| Corrective merge SHA | **`PENDING PREZ MERGE`** — do not invent it |
| P0-B starts from | the corrective merge SHA on `main`, nothing else |

**P0-B Step 1 must verify** that `main` contains the **corrective** merge, that all
containment tests pass (**20** containment tests, **38** total), and that baseline
validation is green — before any concurrency work begins.

## What P0-A guarantees to P0-B

These guarantees hold **only after the corrective merge**, not at `60adb63`.

1. **A single enforcement point for externally supplied write paths.**
   `resolveContainedWritePath(root, capabilityRoot, relativePath)` in `src/files.ts`.
   `applyProductFiles` in `src/ship.ts` is the only caller, and it covers agent codegen,
   critique repair, and founder gate edits.
2. **The capability root is verified, not derived.** Every component of `product/` from the
   canonical repository root down must exist, be a directory, and not be a symbolic link.
   A symlinked capability root is refused, so the boundary cannot be moved out from under
   the checks that measure against it.
3. **Protected surfaces are unreachable by agent or gate writes.** `decisions/`, `AGENTS.md`,
   `policies/`, `loops/`, `seats/`, ledgers and config all sit outside the capability root
   and are therefore out of reach — no denylist is involved.
4. **Batch atomicity of the decision.** Every destination in a write batch is resolved before
   any byte is written, so a rejected batch leaves no partial artifact.
5. **20 containment tests** in `test/containment.test.ts`, one per failure class, plus three
   legitimate controls including an operator-owned parent alias.
6. **All pre-existing invariants intact**: reserve/settle ordering, gate label capture, model
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
- **Do not resolve an authority boundary.** The lesson that cost this scope a merge cycle
  generalises: if P0-B introduces a lock path, a reservation directory or a run marker,
  its location must be *verified* the way `product/` now is, never `realpath`'d and
  trusted. Canonicalising a boundary hands its definition to whoever controls the link.

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
