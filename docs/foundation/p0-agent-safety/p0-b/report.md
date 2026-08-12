# P0-B completion report — ledger concurrency and crash-safe finalization

**Branch:** `fix/p0-b-ledger-concurrency` · **Implementation head:** `f2dfed8943856a1f86fa88fe940a9a4bc231eb85`
(the evidence-closure commit on top is documentation-only) · **Composed foundation:** PR #4 + PR #5
(`978fbcc3`, via merge `4594ce99`) and PR #6 (`482bc04a`, via merge `9db25ad3`).
**Amendments:** A-01 and A-02, PREZ-ratified 2026-08-12 (`gate-ledger.jsonl`).
**Requirement status source:** [`requirements-status.json`](./requirements-status.json) —
derived counts: requirements `VERIFIED: 8`, acceptance `VERIFIED: 7`.

## The defect, red then green, same instrument

`evidence/concurrency-harness.mjs` has one committed lineage and measured both directions.

| N=10 | pre-fix `6172653e` | final head `f2dfed89` |
| --- | --- | --- |
| runs shipped | 2 of 10 | 10 of 10 (three independent runs) |
| collision halts | 8 | 0 |
| duplicate ids | `ROUTE-000006`, `CALL-000006` | 0 |
| `validate` exit | 1 | 0 |
| verdict | `all_clean: false` | `all_clean: true` |

## The crash matrix (A5, R2, R4)

`evidence/crash-matrix.json`, internally bound to the head and the Node version. Seven real
`SIGKILL`s at nonce-authenticated barriers, each proven reached before the kill and each child
proven dead by `ESRCH`:

| Point | Pre-recovery validate | Recovery | Post validate | Terminal rows |
| --- | --- | --- | --- | --- |
| `allocate:after-read` | nonzero | RECOVERED (abandoned, conservative) | 0 | 1 |
| during agent invocation | nonzero | RECOVERED (ceiling settlement) | 0 | 1 |
| `append:after-uniqueness` | nonzero | RECOVERED | 0 | 1 |
| `finalize:before-intent` | nonzero | RECOVERED | 0 | 1 |
| `adr:before-create` | nonzero | RECOVERED (exact replay) | 0 | 1 |
| `finalize:before-terminal-eval` | nonzero | RECOVERED (exact replay) | 0 | 1 |
| `finalize:before-marker` | nonzero | RECOVERED (marker only) | 0 | 1 |

Controls: the no-kill run finishes clean end-to-end; a deliberately broken recovery (terminal-eval
replay deleted from a copied build) is **detected** by post-recovery validation — the matrix can
go red. A run killed after its intent legitimately replays to the intent's outcome, including
`shipped`, because its own ADR now exists; the never-`shipped` rule binds the abandoned path.

## Failures caught and retained this scope

Every one is recorded evidence, none was deleted:

1. The first negative-control harness measured nothing and exited 0 (no `node_modules`; placeholder `tsc`).
2. Its second run credited three properties to mutations that merely failed to compile.
3. The first concurrency-harness version reported `all_clean: true` over destroyed runs.
4. Threat-matrix attempts 6–7: exit 0 with all 18 cases `MINT_FAILED` (environment faults; the script does not fail on universal mint failure — a known sharp edge, worked around by inspecting the verdict column).
5. The seeded `CALL-000001` budget fixture was **absorbed** by the allocator's reservation scan — the system defended itself; the fault moved to the sanctioned barrier seam.
6. Crash-matrix run 1: 4 of 7 points failed, exposing a real recovery defect (reconstructing `spec.json` over the authoritative one) and a wrong harness rule.
7. Closing-regression attempts 1–6: my driver loop's zsh word-splitting fault; the wrapper recorded the truth.
8. The status report's hand-counted "four of eight / five of seven" headline; counts are machine-derived now.

## Residual risks

| Risk | Status |
| --- | --- |
| Sudden power loss / kernel panic / storage loss | **NOT VERIFIED.** `writeAtomic` performs no directory `fsync`. No artifact claims otherwise. |
| Cross-host mutual exclusion | Unsupported topology; detected and quarantined, never guessed. |
| Conservative settlement may overstate spend | By design; never understates under the exclusive cap. |
| `.tailered` state is same-filesystem local | Two hosts sharing a tree over NFS is out of scope. |
| Intent/marker duplicate the `outcome` field | Tension with `v1-contract.md:60` recorded in PREZ-DECISIONS.md; drift is a validation error, so divergence cannot be silent. |
| Committed overlap register names a local worktree path | Deliberate: it documents a machine-local hazard (`concurrent-session-overlap.md`). |

## Assurance boundary

VERIFIED: tested process-crash and `SIGKILL` recovery. NOT VERIFIED: sudden power loss, kernel
panic, or storage-device loss.
