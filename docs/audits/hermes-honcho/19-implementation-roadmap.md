# 19 — Gated implementation roadmap

Gates, not phases. Each gate states its objective, the exact components affected, its
acceptance criteria, its tests, its security and cost gates, its rollback, and the evidence
required before the next gate opens. Narrow and reversible first. **No big-bang migration
is proposed, and no gate depends on adopting upstream code.**

Gates 0-2 are Tailered; gates D0-D2 are Dime and run independently. Gate 3 is the only one
that touches an upstream runtime, it is last, and it is currently blocked.

---

## Gate 0 — Ledger concurrency-safety (Tailered) — **PREREQUISITE**

**Why first.** POC-C proved three concurrent ship runs corrupt the ledger: 4 duplicate route
ids, 10 validator errors, and one started run with no terminal eval, violating
`AGENTS.md:18`. Every parallelism claim in the Tailered OS objectives is false until this is
fixed, and **no agent runtime can fix it** because the corruption happens after the agent
returns.

**Components:** `src/ledger.ts` (id allocation and append), `src/files.ts` (`appendJsonLine`),
`src/ship.ts:414-467` (the `finally` ordering).

**Changes, smallest first:**
1. Reorder the `finally` so `appendTerminalEval` cannot be skipped by a failing `appendAdr`
   — wrap the ADR write so its failure is recorded *in* the terminal eval's `blocker`
   rather than thrown past it. This alone restores `AGENTS.md:18` under contention.
2. Replace read-then-write id allocation with a collision-tolerant append: retry on
   `EEXIST`/duplicate with a re-read, or allocate from a lock file. The CAS-claim shape from
   Hermes's Kanban (`kanban_db.py:claim_task:4353`, HA-404) is the reference pattern —
   reimplemented in TypeScript, not imported.

**Acceptance criteria (all must hold):**
- N concurrent runs against one company produce exactly N terminal `EvalRow`s.
- Zero duplicate `ROUTE-*`, `CALL-*`, `EVAL-*`, `LABEL-*` ids.
- `validate --repo` exits **0**, verified directly and not through a pipe (a `cmd | tail`
  reading of `$?` produced a false pass during this audit).
- Every ADR id is unique and no accepted ADR is modified.

**Tests:** extend `test/ship.test.ts` with a concurrency case at N=3 and N=10.
**Security gate:** none — no new surface. **Cost gate:** none — no model calls.
**Rollback:** `git revert`; the ledger format is unchanged and append-only.
**Evidence to open the next gate:** the POC-C harness rerun, green, with output attached.

---

## Gate 1 — Procedure-outcome join (Tailered) — **the differentiating move**

**Why.** The only capability gap shared by all three systems: nobody measures whether a
stored procedure helps. Hermes writes and prunes skills but never measures them (HA-306,
HA-307); its curator decides by wall clock and its consolidation prompt explicitly forbids
using the one usage signal it has (`agent/curator.py:452-459`). Dime has zero skill-usage
instrumentation anywhere (TA-103). Tailered already stores the outcome data.

**Components:** `src/contracts.ts` (add an optional `procedure_id` to `RouteLog` and
`EvalRow`), `src/router.ts` (`createRouteLog`), `src/validate.ts` (validate when present).

**Acceptance criteria:**
- `procedure_id` is optional, so every existing ledger row stays valid — verified by
  `npm run validate` on an untouched repo.
- Tokens-per-outcome can be computed for runs that used a procedure versus those that did
  not, from the ledgers alone, with no new store.
- No change to routing behavior: `route()` remains pure and stateless (TA-006).

**Tests:** `test/router.test.ts` for the field; a ledger-query test computing the split.
**Cost gate:** none. **Rollback:** the field is additive and optional; drop it.
**Evidence:** a computed tokens-per-outcome comparison over ≥2 runs.

---

## Gate 2 — Memory as an optional adapter (Tailered) — only if institutional memory is wanted

**Why gated.** `docs/blueprint-execution.md:34-42` refuses subsystems whose data dependency
is unmet, and the Context Engine hierarchy is a v3 item. This gate does **not** open until a
real need exists; it is specified here so that if it opens, it opens correctly.

**Design constraints, taken from the audit:**
- Reimplement the `MemoryProvider` contract shape (HH-103) in TypeScript — 4 required
  members, optional lifecycle hooks. Memory must be **optional**: absence degrades context
  quality only (HH-201 is the proof this is achievable).
- Fail-open with bounded waits and stale-result discard (HH-105 pattern).
- **Implement the hooks Honcho leaves empty**: session switch and pre-compress (HH-107,
  HH-108). Their absence is a known defect class, not a design choice.
- Memory is **never** authoritative and never enters a trusted prompt region (HH-104).
- No model-authored durable belief without a human checkpoint (HH-114).

**Acceptance criteria:** with the provider forcibly failing, every existing test still
passes and `validate` still exits 0. **Rollback:** remove the provider; the contract is
additive.

---

## Gate 3 — Hermes behind the process boundary (Tailered) — **DEFERRED, BLOCKED**

**Status: cannot open today.** POC-B is BLOCKED (see `16`): it requires installing Hermes's
dependency tree in isolated infrastructure and spending real inference, neither of which
this audit was authorized to do.

**What POC-A already established.** The boundary holds for **mutation** and **accounting**
(overspend → `halted_budget`; writes outside `product/` → halt; traversal → halt) but **not
for execution** — an agent-chosen binary in a `testgen` payload executes.

**Preconditions before this gate may open:**
1. Gate 0 complete.
2. A disposable worker with no ambient credentials and scoped egress — required because
   Hermes states the OS is the only boundary (`SECURITY.md` §2.2) and Tailered states
   `--allow-local-execution` "is not a sandbox" (`agent-protocol.md:5`). Both agree; neither
   provides it.
3. A wrapper that makes Hermes honour `docs/agent-protocol.md:22` (actual cost and tokens
   must not exceed the tier ceiling). **Hermes has no such mechanism** (HA-502), so the
   wrapper must impose it externally. Without this, TA-001 cannot hold.
4. Owner-authorized spend with a hard cap.
5. Acceptance of HA-601: no wheel, no sdist, no PyPI artifact — the integration is a pinned
   git SHA plus a container, forever.

**Acceptance criteria if it proceeds:** the `todo-auth` benchmark completes with a terminal
`EvalRow`, cost strictly below the cap, and zero writes outside `product/`.
**Rollback:** delete the agent config; the deterministic demo agent is unaffected.

---

## Gate D0 — Dime hardening (do this regardless of any adoption decision)

Both items are live weaknesses today and are worth fixing even if no memory layer is ever
built.

**D0.1 — Numeric-grounding provenance (DA-205, HIGH).**
`server/dime-chat.route.ts:823-826` seeds `supportedNumericValues` from
client-supplied `role:"user"` message text, and `sanitizeDimeChatHistory`
(`server/_core/dimeChatModel.ts:509-528`) carries no provenance marker.
*Change:* derive `supportedNumericValues` **only** from server-side retrieval, and tag
history entries with provenance so injected content can never widen the allowlist.
*Acceptance:* a test proving a number appearing only in a user-role message is **rejected**
as `unsupported_numeric_claim`. Prove the check can fail before trusting it.

**D0.2 — SELECT-only chat credential (DA-204, MEDIUM).**
`readDatabaseUrl()` falls back to the read-write `DATABASE_URL`
(`server/_core/dimeChatContext.ts:149-154`).
*Change:* provision `DIME_CHAT_DATABASE_URL` as a MySQL user with SELECT-only grants on
`games`/`mlb_*`/`odds_history` and no privileges on the write path.
*Acceptance:* an integration test asserting an attempted write on that pool fails at the
engine. This converts the prediction boundary from convention (DA-202: "true but
UNGUARDED") into an engine-enforced impossibility.

**Rollback:** both are configuration and validation changes; revert cleanly.

---

## Gate D1 — Wire Dime's own agent runtimes before importing anyone else's

`dimeAgent.ts` (Claude Code subprocess, strict env allowlist, read-only default tools) and
`piAgent.ts` (in-process, app-defined tools, model allowlist) are **fully implemented,
tested, and have zero product call sites** (DA-106, DA-107). That is the cheapest available
operational capability in the entire audit and it adds no upstream dependency.

**Acceptance:** one real operational workflow (data-quality investigation or release
verification) runs through an existing runtime with bounded tools and a recorded cost.

---

## Gate D2 — Dime memory pilot — only after D0

**Preconditions:** D0.1 and D0.2 complete; the surface serves real users (Dime Chat is
owner-only today, DA-110, so the pilot's value is currently limited to one operator).

**Design constraints, each traceable to a finding:**

| Constraint | Because |
|---|---|
| Memory injected in a **system-role, explicitly non-authoritative** block — never `role:"user"` | HH-104 (trust elevation) + DA-205 (user-role text widens the numeric allowlist) |
| **Per-user workspace**, never a shared workspace with per-peer separation | HH-106 (unvalidated `peer` → cross-peer read *and* write) |
| `USE_AUTH=True`; no deployment-wide broad key | Honcho defaults `USE_AUTH=False` (`honcho/src/config.py:727`) |
| **No model-write memory tool** | HH-114 (recursive model-authored belief, no checkpoint) |
| Explicit precedence: current instruction and current retrieval **beat** memory | HH-207 (no precedence rule exists upstream) |
| Deletion must retract derived beliefs, or memory must be non-derived | HH-212 (deleting a source does not retract the conclusion) |
| Never a projection input | The audit's hard boundary |

**Acceptance gate — structural non-contamination (DA-208 test 1):**
`hashEngineSource()` and `mlb_calibration_constants` are **byte-identical** across the
rollout. Binary, cheap, and unfalsifiable by narrative. Distributional (ECE/Brier/log-loss)
and sequential (walk-forward) checks follow as confirmation.

**Rollback:** disable the provider; because memory is an optional adapter, the chat surface
returns to its current behavior with no data migration.

---

## Sequencing summary

```
Tailered:  Gate 0 ──> Gate 1 ──> [Gate 2 if needed] ──> [Gate 3, blocked]
Dime:      Gate D0 ──> Gate D1 ──> [Gate D2 if D0 green and users exist]
```

Gate 0 and Gate D0 are the only two that should start now. Both are small, both are pure
risk reduction, and neither requires any decision about Hermes or Honcho.
