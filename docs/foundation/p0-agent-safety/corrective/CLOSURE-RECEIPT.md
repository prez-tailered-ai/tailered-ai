# P0-A corrective closure receipt

**P0-A is CLOSED.** This file is the durable record of the PREZ merge gate that closed it.

It contains **no P0-B implementation**. Its only purpose is to replace the
`PENDING PREZ MERGE` placeholder with the real merge SHA and to fix the foundation every
later scope must build on.

## The merge

| Item | Value |
|---|---|
| Repository | `prez-tailered-ai/tailered-ai` |
| Pull request | **#4** — *P0-A follow-up: reject symlinked capability roots* |
| PR state | **MERGED** |
| PR head SHA | `b847abd98a3c2bb528f3810e81ef0cf33818d18e` |
| **Merge SHA** | **`978fbcc31577f6378b8dca4564ceafa6473f1c5e`** |
| Merge timestamp | **2026-08-12T08:12:42Z** |
| Merged by | `prez-tailered-ai` |
| Merge parent 1 | `60adb63ef6be09b93237d75758d3b2e817019f9c` (the incomplete v1 merge) |
| Merge parent 2 | `b847abd98a3c2bb528f3810e81ef0cf33818d18e` (the corrective head) |
| Branch commits carried | `8244a77` (the fix) and `b847abd` (the adversarial-review corrections) |
| PREZ gate verdict | **PASS** |

Both parents were verified present on `978fbcc` before this receipt was written.

## CI on the merged head

| Run | Workflow | Head SHA | Conclusion |
|---|---|---|---|
| **31575978644** | `ci` | `b847abd98a3c2bb528f3810e81ef0cf33818d18e` | **success** |
| **31575981756** | `ci` | `b847abd98a3c2bb528f3810e81ef0cf33818d18e` | **success** |

Both ran against the exact PR head, not against an approximation of it.

## What the gate accepted

The merged implementation canonicalizes the repository root, separately walks the lexical
capability-root components, requires the capability root to exist, requires it to be a
directory, rejects it if it is a symbolic link, rejects symbolic links below it, and fails
closed when containment cannot be proven.

The merged tests cover `product -> decisions`, `product -> .`, `product -> outside the
repository`, the founder gate through a symlinked capability root, and — as a positive
control — a legitimate repository reached through an operator-controlled alias.

## The foundation rule

| SHA | Verdict |
|---|---|
| `60adb63ef6be09b93237d75758d3b2e817019f9c` | ⛔ **INVALID as a P0-B base, permanently.** P0-A v1. Still permits four capability-root symlink escape classes, including a write outside the repository and one through the founder gate. |
| **`978fbcc31577f6378b8dca4564ceafa6473f1c5e`** | ✅ **The minimum valid P0-B foundation.** |
| any later `main` containing `978fbcc` | ✅ valid |
| anything earlier | ⛔ invalid |

This is not a stylistic preference. Concurrency work built on an unsound write boundary
multiplies the blast radius of every race, which is the whole reason P0-A precedes P0-B.

## Superseded, not deleted

The earlier state — *"P0-A complete"* as of PR #3 — is **superseded**, never removed.
Execution-ledger events `P0A-EV-001` … `P0A-EV-013` remain byte-for-byte unchanged, and
`P0A-COR-EV-021` carries `status: SUPERSEDED` with `supersedes: ["P0A-EV-013"]`, naming
exactly which claim fell and on what evidence.

This receipt appends; it rewrites nothing.

## Status after this receipt

| Scope | Status |
|---|---|
| **P0-A** | **CLOSED** at `978fbcc31577f6378b8dca4564ceafa6473f1c5e` |
| **P0-B** | **AUTHORIZED** from `978fbcc` — **not implemented by this branch** |
| Production deployment | **NOT AUTHORIZED** |

This branch changes **no production file**. It contains documentation, ledger records,
handoff updates, and their evidence — nothing else.

## Residual risks carried forward, unchanged

These were disclosed at the gate and remain open. They do not block P0-B.

1. **TOCTOU.** A separate local process could change the filesystem after verification but
   before the final `rename()`. Node exposes no `openat`-style resolution to close it. The
   control remains the requirement to run in an isolated, disposable worker. This is
   distinct from the capability-root symlink class, which was a *pre-existing, observable*
   condition and **is** closed.
2. **Windows separator semantics.** Reasoned via platform-aware `relative()`/`sep`, not yet
   executed on Windows.
3. **The capability root is a fixed `product` constant**, not a generalized capability
   system. A multi-root model must extend the primitive rather than add a second check.

## Verification carried out for this receipt

The complete inherited P0-A gate was re-run on `978fbcc` before this receipt was
committed — `npm ci`, `check`, `test`, `validate`, `demo`, `audit`, the 18-case containment
threat matrix, and the protected-surface hash comparison. Results are recorded in
[`evidence/CLOSURE-verification.txt`](evidence/CLOSURE-verification.txt) and
[`evidence/CLOSURE-threat-matrix.txt`](evidence/CLOSURE-threat-matrix.txt).

The point of re-running rather than citing the PR's results: the PR proved the *branch* was
sound. This proves the *merge* is sound, which is the thing P0-B actually inherits.
