# 19 — Gated implementation roadmap (Tailered AI)

Gates, not phases. Every gate targets
[`prez-tailered-ai/tailered-ai`](https://github.com/prez-tailered-ai/tailered-ai) and nothing
else. Narrow and reversible first.

**Nothing in this roadmap is implemented by the audit.** Publication of the audit is not
authorization to build. Each gate begins only on explicit approval after review.

Work, when authorized, is done in this repository using feature branches, isolated
worktrees, deterministic evals, explicit acceptance tests, scoped credentials, disposable
execution workers, bounded network access, hard model-spend ceilings, traceable context,
causal evidence, and a rollback path.

---

## Gate 0 — Ledger concurrency-safety — **PREREQUISITE**

**Why first.** POC-C proved three concurrent ship runs corrupt the ledger: 4 duplicate route
ids, 10 validator errors, and one started run with **no terminal `EvalRow`**, violating the
constitution's unconditional law. Every multi-agent objective is blocked behind it, and **no
external agent runtime can fix it** — the corruption happens after the agent returns.

**Components:**
[`src/ledger.ts`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/ledger.ts),
[`src/files.ts`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/files.ts),
[`src/ship.ts:414-467`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/ship.ts#L414-L467).

**Full specification:** [25-concurrency-remediation-contract.md](25-concurrency-remediation-contract.md)
(requirements R1-R8, acceptance criteria A1-A7).

**Order of work, smallest first:**

1. **Reorder finalisation** so a failing ADR write cannot skip `appendTerminalEval` — its
   failure is recorded *into* the terminal row's `blocker` instead of thrown past it. This
   alone restores the constitutional law under contention.
2. **Replace read-then-write id allocation** with a collision-tolerant claim
   (`HERMES-INSPIRED`: CAS + TTL; `HONCHO-INSPIRED`: `ON CONFLICT DO NOTHING`), reimplemented
   in zero-dependency TypeScript.

**Security gate:** none — no new surface. **Cost gate:** none — no model calls.
**Rollback:** `git revert`; the ledger format is unchanged and append-only.
**Evidence to open the next gate:** the POC-C harness rerun green, with the true `validate`
exit code read directly (not through a pipe), plus a deterministic contention test that
**fails** against `6172653e` (criterion A6).

---

## Gate 1 — Procedure-outcome join

**Why now.** The one capability gap shared by every system examined. Cheap, additive, and it
uses ledgers that already exist.

**Specification:** [26-procedure-outcome-architecture.md](26-procedure-outcome-architecture.md).

**Components:** an optional `procedure_id` on `RouteLog` and `EvalRow`
([`src/contracts.ts`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/contracts.ts)),
recorded in `createRouteLog`
([`src/router.ts`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/router.ts)),
validated when present
([`src/validate.ts`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/validate.ts)).

**Acceptance criteria:**
- The field is **optional**, so every existing ledger row stays valid — `npm run validate`
  passes on an untouched repository.
- Tokens-per-outcome is computable for runs that used a procedure versus those that did not,
  **from the ledgers alone**, with no new store.
- `route()` remains pure and stateless: attribution is *recorded*, never *decided*, at
  routing time.

**Hard dependency:** Gate 0. Measurement over an incomplete ledger computes confident, wrong
numbers, and the missing rows are exactly the crashed runs — a bias that makes procedures
look better than they are.

**Rollback:** the field is additive and optional; drop it.

---

## Gate 2 — Procedure format and registry

**Why after Gate 1.** Build procedures *with* measurement rather than before it. This is the
single lesson the upstream learning loop teaches by omission.

**Scope:** adopt the `SKILL.md`-shaped format (decision #6, `ADAPT`). Content-hash each
procedure version; reuse the ADR supersession pattern for lineage.

**Explicitly excluded:** inline-shell expansion in procedure bodies (HA-312), autonomous
unattended authoring (HA-304), and clock-based archival (HA-307). Retention decisions come
from the Gate 1 scorecard, not from a timer.

**Acceptance:** a procedure's retention decision is derivable from outcome data; a promotion
is a human gate whose verdict is captured as a label.

---

## Gate 3 — Memory as an optional adapter — **only if institutional memory is wanted**

**Why gated.** The blueprint refuses subsystems whose data dependency is unmet, and the
exclusion of ledgers from agent context (TA-015) is deliberate and documented. This gate does
not open until a real need exists; it is specified here so that if it opens, it opens
correctly.

**Design constraints, each traceable to a finding:**

| Constraint | Because |
|---|---|
| Reimplement the provider contract in TypeScript; memory is **optional** | HH-103; HH-201 proves optionality is achievable |
| Fail-open with bounded waits and stale-result discard | HH-105 |
| **Implement** session-switch and pre-compress hooks | Honcho leaves both empty (HH-107, HH-108) |
| Memory injected in a **non-authoritative** region, never as "authoritative" | HH-104, SEC-HH-01 |
| **No model-write memory tool** | HH-114, HO-212 |
| Explicit precedence: canonical state and current instruction beat memory, **and it is tested** | HH-207 — no such rule exists upstream |
| Deletion retracts derived belief, or memory is non-derived | SEC-O-04, HO-101, HO-113 |
| Memory spend inside reserve/settle | HH-109, HO-319, R-03 |

**If an external service is used** (decision #3, `INTEROPERATE`), all eight gates in
[17](17-adoption-decision-matrix.md) are mandatory and cumulative — chiefly `USE_AUTH=True`
and one workspace per isolation unit.

**Acceptance:** with the provider forcibly failing, every existing test still passes and
`validate` still exits 0. **Rollback:** remove the provider; the contract is additive.

---

## Gate 4 — Isolated worker layer

**Why.** Both systems agree containment lives in the OS: Hermes states it outright, and
Tailered's own documentation says `--allow-local-execution` "is not a sandbox". POC-A
confirmed the process boundary bounds mutation and accounting but **not execution**.

**Scope:** a disposable worker with no ambient credentials and scoped egress; worktree-per-
task (`HERMES-INSPIRED`) for parallel work.

**Hard dependency:** Gate 0 — parallel workers against a racy ledger multiply the defect.

---

## Gate 5 — External agent runtime behind the process boundary — **DEFERRED, BLOCKED**

**Status: cannot open today.** POC-B is BLOCKED: it requires installing Hermes's dependency
tree in isolated infrastructure and spending real inference, neither of which this audit was
authorized to do.

**Preconditions, all required:**

1. Gates 0 and 4 complete.
2. A wrapper that makes the external runtime honour the protocol's hard per-tier ceiling.
   **Hermes has no such mechanism** (HA-502), so the wrapper must impose it externally;
   without this, the reserve/settle invariant cannot hold.
3. Owner-authorized spend with a hard cap.
4. Acceptance that there is **no installable artifact** (HA-601) — the integration is a
   pinned git SHA plus a container, permanently.
5. Never track upstream `main` (HA-602/604/609).

**Acceptance if it proceeds:** the `todo-auth` benchmark completes with a terminal `EvalRow`,
cost strictly below the cap, and zero writes outside `product/`.
**Rollback:** delete the agent config; the deterministic demo agent is unaffected.

---

## Sequencing

```text
Gate 0 (ledger)  ──►  Gate 1 (measurement)  ──►  Gate 2 (procedures)
      │
      └──►  Gate 4 (isolated workers)  ──►  Gate 5 (external runtime, blocked)

              Gate 3 (memory) — independent, only if wanted
```

**Gate 0 is the only one that should start now.** It is small, purely corrective, requires no
decision about either upstream system, and unblocks everything else.

## What must be fixed before multi-agent deployment begins

Stated as a single checklist, because this is the question the roadmap exists to answer:

1. Concurrency-safe identifiers and crash-safe finalisation (Gate 0, criteria A1-A7).
2. A deterministic contention test that provably fails on the current code (A6).
3. An isolated worker with no ambient credentials (Gate 4).
4. Reserve/settle extended to every new spend channel (R-03).
5. Ownership state sufficient to distinguish "in progress" from "abandoned" (R8).

Until all five hold, additional concurrent agents increase the rate of silent ledger
corruption rather than the rate of useful work.
