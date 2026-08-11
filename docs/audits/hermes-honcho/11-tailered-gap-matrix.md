# 11 — Tailered capability inventory and gap / duplication matrix

Built target-first: the Tailered and Dime capability inventory was established from source
*before* upstream capabilities were compared against it, so that nothing already built could
be recommended as an upstream gain.

## Part 1 — Tailered AI invariant register (what adoption must not weaken)

Established by reading `tailered-ai @ 6172653e` end to end and by execution.

| ID | Invariant | Citation | Evidence |
|---|---|---|---|
| TA-001 | Reserve-before-spend: ceiling reserved *before* the call; denial when `settled + reserved + projected >= cap` | `src/budget.ts:48-54`; reserve `src/ship.ts:134-138` precedes invoke `:203` | **VERIFIED** (POC-A) |
| TA-002 | Settlement above reservation halts the run and is still ledgered | `src/budget.ts:76-91`; `src/ship.ts:404-406` | **VERIFIED** (POC-A) |
| TA-003 | Agent and gate writes restricted to `product/` | `src/ship.ts:557-569` | **VERIFIED** (POC-A) |
| TA-004 | Path traversal rejected; repo-relative only | `src/files.ts:16-32` | **VERIFIED** (POC-A) |
| TA-005 | Exactly one terminal `EvalRow` per started run | `src/ship.ts:414-467`; `AGENTS.md:18` | VERIFIED single-run; **VIOLATED under concurrency** (POC-C) |
| TA-006 | Stateless router, pure function | `src/router.ts:12-48` | VERIFIED |
| TA-007 | Model identity only from `tailered.config.json` | `src/config.ts:27-39`; `src/ship.ts:121` | VERIFIED |
| TA-008 | Company bounds may only tighten, never exceed platform `BOUNDS` | `src/config.ts:76-90` | VERIFIED |
| TA-009 | No shell: `spawn(..., shell:false)` on both paths | `src/agent.ts:64`; `src/ship.ts:536` | VERIFIED |
| TA-010 | Replay artifacts immutable by `wx` exclusive create | `src/files.ts:44-50`; `src/ledger.ts:40-66` | VERIFIED |
| TA-011 | `caused_by` required on every record, validator-enforced | `src/validate.ts:86-93,170-172,185-187,226-228` | VERIFIED |
| TA-012 | Deterministic money in integer micro-dollars | `src/money.ts`; `AGENTS.md:33` | VERIFIED |
| TA-013 | Zero runtime dependencies | `package.json:26-29`; `npm ci` → 4 pkgs, 0 vulns | VERIFIED |
| TA-014 | Executable definition of done | `src/ship.ts:486-524` | VERIFIED (demo) |

**TA-014a — institutional memory seam.** `RunContextCache` excludes `evals`, `labels`, and
`.tailered` from the context snapshot (`src/context.ts:47-50`), while `decisions/` is *not*
excluded. So the agent sees every ADR but never the eval ledger or label corpus — even
though `docs/platform-brief.md:34` calls the label corpus "the platform's most valuable
byproduct." This is deliberate and documented (`docs/agent-protocol.md:39`), and it is the
exact seam where any memory layer would attach.

**TA-015 — the boundary bounds mutation and accounting, not execution.** `testgen` returns
`{command, args, cwd}` and the runtime spawns it (`src/ship.ts:531-555`). Documented as an
accepted trust boundary (`README.md:59`). VERIFIED by POC-A.

**TA-016 — the ledger is not concurrency-safe.** Read-then-write id allocation
(`src/ledger.ts:117-127`) over an unlocked append (`src/files.ts:52-64`), plus `appendAdr`
(`src/ship.ts:420`) preceding `appendTerminalEval` (`:466`) in the same `finally`. VERIFIED
by POC-C.

## Part 2 — Dime program inventory (measured, Lane D)

102 flat skill dirs and 479 `SKILL.md` across `.claude/`; 16 in `.agents/skills/`; 35 slash
commands; 4 subagent definitions; 42 GitHub Actions workflows (12 scheduled); **51 git
worktrees currently registered**; a self-healing three-hook SessionStart bootstrap; a
per-prompt law capsule; a repo-level MCP/Bash deny list; a governed `/os/` program with
test-backed invariants; a hash-chained execution event ledger.

Dime Chat specifically: 6 persistence tables + a live Trace v1 audit layer; retrieval
grounding; answer routing; response validation gates; a deterministic non-LLM math path;
**no tools parameter on the model call**; **owner-only access in production**; two fully
implemented agent runtimes with **zero product call sites**.

## Part 3 — The gap / duplication matrix

| Capability | Tailered | Dime | Hermes | Honcho | Gap | Relative quality | Adoption |
|---|---|---|---|---|---|---|---|
| Reserve-before-spend cost ceiling | **Yes**, enforced (TA-001) | No — post-hoc only (TA-111) | **No, anywhere** (HA-502) | n/a | Dime lacks it | **Tailered strongest by far** | **KEEP TAILERED**; port to Dime |
| Post-hoc token/cost accounting | Yes, exact | Yes (`aiCostMeter`) | Yes but async, best-effort, documented-lossy (HA-513) | n/a | none | Tailered/Dime stronger | KEEP |
| Executable definition of done | **Yes** (TA-014) | CI-gated (TA-108) | **No** — heuristic (HA-115) | n/a | none | **Tailered strongest** | KEEP TAILERED |
| Evidence chain / `caused_by` | **Yes**, validator-enforced | `/os/` ledger, hash-chained (TA-118) | Session transcript only | Provenance exists but derived beliefs outlive sources (HH-212) | none | **Tailered strongest** | KEEP TAILERED |
| Immutable replay artifacts | **Yes** (`wx`) | Trace v1 (DA-102) | SQLite, soft-archive | — | none | Tailered strongest | KEEP |
| Ledger concurrency-safety | **No** (TA-016) | n/a (worktrees) | CAS+TTL+heartbeat in Kanban (HA-404) | `SKIP LOCKED` (Lane B) | **Real gap in Tailered** | Hermes Kanban pattern better | **REFERENCE** → Gate 0 |
| Worker filesystem isolation | No | **Yes** — 51 worktrees (TA-105) | Split: Kanban yes; `delegate_task` **no** (HA-401/402) | n/a | Tailered lacks | Dime already at parity | REFERENCE |
| Subagent delegation | No | **Yes** (TA-104) | Yes, but in-process and unisolated | n/a | none for Dime | Dime's worktree model safer | REJECT |
| Skills as reusable procedure | No | **Yes**, 479 files, same format | Yes, 193 files | n/a | none | Identical convention | **REJECT (already present)** |
| Agent-authored procedures | No | **Yes** (19/22 skill commits Co-Authored-By) | Yes, default-on, unattended | n/a | none | Dime keeps a human owner | REJECT |
| **Procedure outcome measurement** | Data exists, join absent | **No instrument at all** (TA-103) | **No** (HA-306/307) | n/a | **Gap in all three** | **Nobody has it** | **BUILD — differentiating** |
| Cross-session memory | No (deliberate, TA-014a) | **No** (DA-103) | Via provider | **Yes** — its whole purpose | Real gap if wanted | Honcho strongest | **INTEROPERATE, gated** |
| Memory provider abstraction | No | No | **Yes** — 20-method ABC, 9 impls (HH-103) | n/a | Real gap | **Hermes strongest** | **REFERENCE** |
| Prompt-cache preservation | Per-run cache (`src/context.ts`) | Not engineered | **Yes** — `api_content` sidecar (HA-108) | n/a | Dime gap | Hermes strongest | **REFERENCE** |
| Provider-agnostic inference | Registry strings | Anthropic direct (DA-114) | 34 declarative profiles (HA-209) | LLM-dependent | none material | Both fine | KEEP |
| Approval gating for dangerous tools | Mutation boundary + no shell | **Yes**, 3 layers (TA-107) | **No single chokepoint** (HA-201); `computer_use` default-allow (HA-203) | n/a | none | **Tailered/Dime stronger** | REJECT |
| Human gate + preference labels | **Yes**, load-bearing | Owner authority ladder | Approval prompts, not a label corpus | n/a | none | Tailered strongest | KEEP |
| Scheduled agent runs | No | Yes, but token-free by policy (TA-113) | Yes, full cron | Dream scheduling | Policy, not capability | — | DEFER |
| Browser automation | No | **Yes**, twice, with a routing law (TA-115) | Yes | n/a | none | Dime at parity | REJECT |
| MCP integration | No | Yes, hardened deny list (TA-116) | Yes, but `trust: full` default (HA-207) | Ships an MCP server | none | **Dime stronger** | REJECT |
| Session persistence / resume | Per-run ledger | Durable + Trace v1 | SQLite v25, strong recovery (HA-517) | Server-side | Dime embedded runtime in-memory (TA-114) | comparable | KEEP |
| Zero runtime dependencies | **Yes** (TA-013) | No (product) | 92 direct / 249 locked (HA-612) | Postgres+pgvector(+Redis) | — | **Tailered strongest** | KEEP |

## Part 4 — What the matrix says

**Zero `ADOPT`. Zero `REPLACE`.** The rows where upstream is genuinely stronger number
four: the memory-provider abstraction, the prompt-cache mechanism, the CAS ownership
pattern, and cross-session memory itself. Three of the four are **patterns**, and the fourth
is a service.

Three structural facts make direct adoption unavailable regardless of merit:

1. **Hermes cannot be depended upon.** `setup.py:49-50,66-67` raises `RuntimeError` on
   `bdist_wheel` and `sdist` unless `HERMES_NIX_BUILD=1`, and PyPI and Homebrew are
   explicitly unsupported (`platform-support.md:47-48`). There is no wheel, no sdist, no
   published artifact. A consumer **physically cannot** take a direct dependency (HA-601).
   Supported distribution is `curl | bash`, Docker, or Nix. This converts
   "direct dependency" from a trade-off into a non-option.
2. **Honcho is AGPL-3.0**, so its server is usable only across a service boundary, never as
   linked source (see `15`).
3. **Language mismatch.** Tailered is zero-dependency TypeScript; both upstreams are Python.
   Selective source reuse would mean adopting a runtime, a package manager, and a dependency
   tree — for a platform whose entire codebase is 3,615 lines.

The gap matrix therefore resolves, almost everywhere it is not already a duplicate, to
**REFERENCE**: take the idea, write the code.

## Part 5 — The one gap nobody has filled

Every other row is either "Tailered/Dime already stronger" or "borrow a pattern." One row is
a gap in **all three systems**: nobody measures whether a stored procedure helps.

Tailered is uniquely positioned to close it, because it already writes the outcome data —
`EvalRow` carries `outcome`, `tests_passed`/`tests_total`, `tokens_by_tier`, `wall_time_ms`,
`cost_usd`, `caused_by` (`src/contracts.ts:116-132`), and `RouteLog` carries per-call tier,
tokens, cost, and context telemetry. The join between "which procedure ran" and "what did it
cost and did it pass" is one field.

That is the audit's answer to *"what should Tailered build itself because it is
strategically differentiating."*
