# 11 — Tailered AI capability inventory and gap matrix

Built target-first: the Tailered AI inventory was established from source and by execution
**before** any upstream capability was compared against it, so that nothing already built
could be recommended as an upstream gain, and nothing upstream could be dismissed without
knowing what Tailered actually does.

Target: [`prez-tailered-ai/tailered-ai`](https://github.com/prez-tailered-ai/tailered-ai) @
[`6172653e`](https://github.com/prez-tailered-ai/tailered-ai/tree/6172653e0aca0981d0abaf4ad8e9d587667737e9)
— 3,615 lines of TypeScript, **zero runtime dependencies**, 18/18 tests green.

---

## Part 1 — The invariant register

> **ERRATUM — rows TA-003 and TA-004.** Both were recorded VERIFIED here on evidence later
> shown insufficient. TA-003 was **REFUTED at this baseline** and is VERIFIED only after the
> P0-A corrective closure. TA-004 conflated two claims: repository-root escape rejection was
> VERIFIED, capability-root containment was **REFUTED**. The rows below are left exactly as
> published. Corrections: [`27-erratum.md`](27-erratum.md) E-01 and E-02.

These are the guarantees any adoption must not weaken. Each was read in source; the ones
marked VERIFIED were additionally proven by executing the runtime.

| ID | Invariant | Citation | Evidence |
|---|---|---|---|
| TA-001 | **Reserve-before-spend**: the projected ceiling is reserved *before* the call; a reservation is denied when `settled + reserved + projected >= cap` | [`src/budget.ts:48-54`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/budget.ts#L48-L54); reserve at [`src/ship.ts:134-138`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/ship.ts#L134-L138) precedes invoke at [`:203`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/ship.ts#L203) | **VERIFIED** (POC-A) |
| TA-002 | Settlement above reservation halts the run **and is still ledgered** | [`src/budget.ts:76-91`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/budget.ts#L76-L91) | **VERIFIED** (POC-A) |
| TA-003 | Agent and gate writes are restricted to `product/` | [`src/ship.ts:557-569`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/ship.ts#L557-L569) | **VERIFIED** (POC-A) |
| TA-004 | Path traversal rejected; repository-relative paths only | [`src/files.ts:16-32`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/files.ts#L16-L32) | **VERIFIED** (POC-A) |
| TA-005 | Exactly one terminal `EvalRow` per started run | [`src/ship.ts:414-467`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/ship.ts#L414-L467) | VERIFIED single-run; **VIOLATED under concurrency** (POC-C) |
| TA-006 | Stateless router: a pure function of `(taskKind, signals, registry)` | [`src/router.ts:12-48`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/router.ts#L12-L48) | VERIFIED |
| TA-007 | Model identity sourced only from `tailered.config.json` | [`src/config.ts:27-39`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/config.ts#L27-L39) | VERIFIED |
| TA-008 | Company bounds may only **tighten**, never exceed platform limits | [`src/config.ts:76-90`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/config.ts#L76-L90) | VERIFIED |
| TA-009 | No shell: `spawn(..., shell:false)` on both execution paths | [`src/agent.ts:64`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/agent.ts#L64); [`src/ship.ts:536`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/ship.ts#L536) | VERIFIED |
| TA-010 | Replay artifacts immutable by filesystem flag (`wx` exclusive create) | [`src/files.ts:44-50`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/files.ts#L44-L50) | VERIFIED |
| TA-011 | `caused_by` mandatory on every record, validator-enforced | [`src/validate.ts:86-93`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/validate.ts#L86-L93) | VERIFIED |
| TA-012 | Deterministic money in integer micro-dollars, never model-sourced | [`src/money.ts`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/money.ts) | VERIFIED |
| TA-013 | Zero runtime dependencies | [`package.json`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/package.json); `npm ci` → 4 packages, 0 vulns | VERIFIED |
| TA-014 | **Executable** definition of done | [`src/ship.ts:486-524`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/ship.ts#L486-L524) | VERIFIED (demo) |

### TA-015 — the memory seam

`RunContextCache` excludes `evals`, `labels`, and `.tailered` from the context snapshot
([`src/context.ts:47-50`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/context.ts#L47-L50)),
while `decisions/` is **not** excluded. The agent therefore sees every ADR but never the eval
ledger or the label corpus.

This is deliberate and documented
([`docs/agent-protocol.md`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/docs/agent-protocol.md):
"Ledgers, build output, caches, and Git internals are excluded"). It is **the exact
architectural seam** where any memory layer would attach, and the reason a memory adapter is
an additive change rather than a redesign.

### TA-016 — the boundary bounds mutation and accounting, not execution

`testgen` returns `{command, args, cwd}` and the runtime spawns exactly that
([`src/ship.ts:531-555`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/ship.ts#L531-L555)).
`shell:false` removes metacharacter injection and `resolveRepoPath` confines the working
directory, but the binary is agent-chosen and executes. Documented as an accepted trust
boundary; **VERIFIED by POC-A**.

### TA-017 — the ledger is not concurrency-safe

Read-then-write id allocation
([`src/ledger.ts:117-127`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/ledger.ts#L117-L127))
over an unlocked append
([`src/files.ts:52-64`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/files.ts#L52-L64)),
plus `appendAdr` preceding `appendTerminalEval` in the same `finally`. **VERIFIED by POC-C.**
Full analysis and remediation contract:
[25-concurrency-remediation-contract.md](25-concurrency-remediation-contract.md).

---

## Part 2 — The gap matrix

Every row compares Tailered AI to the two upstream reference systems and terminates in a
Tailered disposition.

| Capability | Tailered AI today | Hermes | Honcho | Gap | Relative strength | Disposition |
|---|---|---|---|---|---|---|
| Reserve-before-spend ceiling | **Enforced, proven** (TA-001) | **None anywhere** (HA-502) | n/a | none | **Tailered strongest** | **KEEP TAILERED** |
| Post-hoc cost accounting | Exact, validator-checked | Async, best-effort, documented-lossy (HA-513) | Reports $0.00 (HO-319) | none | **Tailered strongest** | **KEEP TAILERED** |
| Executable definition of done | **Yes** (TA-014) | **No** — inferred from exit reason (HA-115) | n/a | none | **Tailered strongest** | **KEEP TAILERED** |
| Evidence chain / `caused_by` | Mandatory, enforced | Session transcript only | Provenance is unvalidated model strings (HO-204) | none | **Tailered strongest** | **KEEP TAILERED** |
| Immutable replay artifacts | `wx` exclusive create | SQLite, soft-archive | Soft delete, no referential actions (HO-101) | none | **Tailered strongest** | **KEEP TAILERED** |
| Human gate + preference labels | Load-bearing, captured | Approval prompts, not a corpus | n/a | none | **Tailered strongest** | **KEEP TAILERED** |
| Single approval chokepoint | Writes validated in one place | **No chokepoint**; ≥7 gates (HA-201) | n/a | none | **Tailered strongest** | **KEEP TAILERED** |
| Zero runtime dependencies | **Yes** (TA-013) | 92 direct / 249 locked (HA-612) | Postgres + pgvector (+Redis) | none | **Tailered strongest** | **KEEP TAILERED** |
| **Ledger concurrency-safety** | **No** (TA-017) | CAS + TTL + heartbeat in Kanban (HA-404) | `ON CONFLICT` claim (HO-402) | **REAL GAP** | Upstream pattern better | **REFERENCE → prerequisite** |
| **Prompt-cache preservation** | Per-run only | `api_content` sidecar, byte-identical prefix (HA-108) | n/a | **REAL GAP** (once multi-turn) | **Hermes stronger** | **REFERENCE** |
| **Memory-provider abstraction** | None | 20-method ABC, 9 impls, memory optional (HH-103) | n/a | **REAL GAP** | **Hermes stronger** | **REFERENCE** |
| **Cross-session contextual memory** | **None**, deliberately (TA-015) | via provider | Its entire purpose | **REAL GAP** | **Honcho stronger** | **DEFER / INTEROPERATE** |
| Worker filesystem isolation | None (single-run) | Split: Kanban worktrees yes, `delegate_task` **no** (HA-401) | n/a | Gap (post-remediation) | Kanban pattern better | **REFERENCE** |
| Task ownership / claims | None | CAS claim, TTL, PID liveness (HA-404) | `ON CONFLICT DO NOTHING` (HO-402) | Gap | Upstream better | **REFERENCE** |
| Subagent delegation | None | In-process, unisolated (HA-401/402) | n/a | Gap, but upstream's answer is weak | Neither strong | **REJECT (their model)** |
| Provider abstraction | Registry strings | 34 declarative profiles (HA-209) | n/a | Latent | Same principle | **REFERENCE** |
| Model failover | None (halt + record) | 30 failover reasons (HA-111/112) | n/a | Latent | Hermes broader | **DEFER** |
| Skills / procedures | None | 193 skills, `SKILL.md` format (HA-301) | n/a | Gap | Format is conventional | **ADAPT (format)** |
| **Procedure effectiveness measurement** | Data exists, join absent | **None** (HA-306/307) | n/a | **GAP IN ALL THREE** | **Nobody has it** | **TAILERED NEW** |
| Session persistence / resume | Per-run ledger | SQLite v25, strong recovery (HA-517) | Server-side | Latent | Comparable | **REFERENCE** |
| Deletion / erasure semantics | `git revert`, immutable by design | n/a | **No cascade, no message delete** (SEC-O-04, HO-113) | none | **Tailered stronger** | **KEEP TAILERED** |
| Contradiction / supersession | Append-only ADR supersession | n/a | **Unreachable level, no supersession** (HO-207/208) | none | **Tailered far stronger** | **KEEP TAILERED** |
| Packaging | npm, zero deps | **Cannot be packaged** (HA-601) | PyPI SDKs, unclear license (LIC-O-02) | none | **Tailered stronger** | **KEEP TAILERED** |

---

## Part 3 — What the matrix says

**Four real gaps.** Ledger concurrency-safety, prompt-cache preservation, the
memory-provider abstraction, and cross-session memory itself. Three are **patterns** to
reimplement; one is a **service** to interoperate with under gates.

**Everything else Tailered already does, and mostly does better** — which is the substantive
result of this audit, not a flattering one. The properties Tailered leads on (bounded spend,
proved completion, enforced lineage, immutable artifacts, a single write chokepoint) are
precisely the properties an agent platform most needs and that both upstreams most lack.

**Three structural facts make direct adoption unavailable regardless of merit:**

1. **Hermes cannot be depended upon.**
   [`setup.py`](https://github.com/NousResearch/hermes-agent/blob/ed5e17f4b86da0c4f09c0694757b6074ae6b9d16/setup.py)
   raises `RuntimeError` on `bdist_wheel` and `sdist`, and PyPI and Homebrew are explicitly
   unsupported. There is no wheel, no sdist, no published artifact (HA-601). Direct
   dependency is not a trade-off to weigh — it is unavailable.
2. **Honcho's server is AGPL-3.0**, usable only across a service boundary, never as linked
   source (LIC-O-04).
3. **Language mismatch.** Tailered is zero-dependency TypeScript; both upstreams are Python.
   Selective source reuse would mean adopting a runtime, a package manager, and a dependency
   tree — into a platform whose entire codebase is 3,615 lines.

The matrix therefore resolves almost everywhere to **KEEP TAILERED** or **REFERENCE**: take
the idea, write the code.

## Part 4 — The one gap nobody has filled

Across all three systems, exactly one capability is missing everywhere: **nobody measures
whether a stored procedure makes an agent better.**

Tailered is uniquely positioned to close it, because it already writes the outcome data —
`EvalRow` carries `outcome`, `tests_passed`/`tests_total`, `tokens_by_tier`, `wall_time_ms`,
`cost_usd`, and `caused_by`
([`src/contracts.ts:116-132`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/contracts.ts#L116-L132)) —
under a validator that refuses orphans. The join between "which procedure ran" and "what did
it cost and did it pass" is **one field**.

That is this audit's answer to *what should Tailered build itself because it is
strategically differentiating*, and it is specified in
[26-procedure-outcome-architecture.md](26-procedure-outcome-architecture.md).
