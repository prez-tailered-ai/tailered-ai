# 00 — Executive verdict

**Audit:** NousResearch/hermes-agent `ed5e17f4` (MIT) and plastic-labs/honcho `a92fb1e0`
(AGPL-3.0), assessed against Tailered AI `6172653e` (Apache-2.0), Tailered OS, and Dime AI.
2026-08-11. 53 subagents, 6.43M tokens, 343 findings, 143 recorded blockers, 2 executed
proofs of concept, 40 adversarial verifications.

---

## The verdict in one paragraph

**Adopt nothing as-is. Integrate one thing behind a service boundary, under gates. Copy
three ideas and write them yourself. Fix two things in your own systems first — both are
live weaknesses today and neither depends on any adoption decision.** Hermes and Honcho are
serious pieces of engineering, but neither is stronger than Tailered where Tailered is
strong (bounded spend, executable proof of completion, an evidence chain), and both are
weaker in exactly the places a company platform cannot afford weakness. The durable value in
these two repositories is architectural knowledge, not importable code.

Final dispositions: **0 ADOPT · 0 ADAPT · 0 REPLACE · 1 INTEROPERATE (heavily gated) ·
7 REFERENCE · 3 DEFER · 7 REJECT.**

---

## The two things to do first, regardless of any adoption decision

1. **Dime, DA-205 (HIGH, live today).** `supportedNumericValues` — the allowlist that decides
   which numbers count as grounded evidence — is seeded from client-supplied `role:"user"`
   message text (`server/dime-chat.route.ts:823-826, 862-864`), and the history sanitiser
   carries no provenance marker. Any memory layer replaying remembered content as a user
   turn would silently launder remembered numbers into grounded claims. This is a weakness
   **now**, before any memory exists.
2. **Tailered, POC-C (executed).** Three concurrent ship runs corrupted the ledger: 4
   duplicate route ids, 10 validator errors, and one started run with **no terminal
   `EvalRow`** — a direct violation of `AGENTS.md:18`. The cause is internal
   (`src/ledger.ts:117-127` read-then-write ids; `appendAdr` at `src/ship.ts:420` preceding
   `appendTerminalEval` at `:466` in the same `finally`). **No agent runtime can fix this**,
   which means every parallelism objective is blocked behind it.

Neither requires a decision about Hermes or Honcho. Both are small and reversible.

---

## Answers to the fifteen questions

**1. What does Hermes actually do better than Tailered today?**
Three things, all real. **Prompt-cache preservation** — the `api_content` sidecar replays each
message's original wire bytes so a long conversation reuses a cached prefix
(`conversation_loop.py:1883-1897`), with tool schemas resolved once per session.
**Provider breadth** — 34 declarative provider profiles behind one ABC, genuinely swappable.
**Worker isolation in one lane** — the Kanban system has real CAS claims with TTL, PID
liveness and heartbeats, and real `git worktree` workspaces per task
(`kanban_db.py:4353, 7346`). Nothing else.

**2. What does Honcho actually do better than Tailered today?**
One thing: **long-horizon user modelling across sessions**, which Tailered deliberately does
not attempt. Its tenancy *design* is also sound — composite foreign keys, hashed vector
namespaces, query-level scoping rather than post-hoc filtering (HO-303).

**3. What unique capabilities appear only when they are combined?**
Genuine cross-session personalisation with automatic context injection, and a closed
`interaction → memory → derived belief → future context → future behaviour` loop. The
integration is **real, fully wired and heavily tested** — ~7,938 lines of provider code, a
20-method `MemoryProvider` ABC with 9 implementations, and 5,948 lines of dedicated tests.
The audit's own hypothesis that it would prove thin was **refuted**. The loop also closes
**with no human checkpoint**, which is the problem.

**4. Which capabilities would measurably improve Dime AI?**
Personalisation and cross-session continuity — Dime has **none** today (DA-103, verified
absence). But Dime Chat is **owner-only in production** (DA-110), so the pilot currently
serves one user. Higher-value and cheaper: **wire Dime's own agent runtimes**, which are
fully implemented, tested, and have **zero product call sites** (DA-106, DA-107).

**5. Which would measurably improve Tailered OS?**
Only the CAS ownership pattern, and only after Gate 0. Every other objective — one-shot
execution, evidence, governance, cost control, auditability — Tailered already does better.

**6. Which ideas should be copied architecturally but not integrated?**
The `MemoryProvider` contract; fail-open bounded prefetch with stale-result discard; CAS
claim + TTL + heartbeat ownership; worktree-per-task; prompt-cache preservation; the
"narrow waist" rule that every core tool is paid for on every call.

**7. Which components should be integrated behind clean boundaries?**
Exactly one: **Honcho as an unmodified memory service over HTTP**, one workspace per user,
`USE_AUTH=True`, no model-write tool, memory quarantined as non-authoritative — and only if
all eight gates in `17` are met.

**8. Which capabilities are redundant?**
The skill format (Dime's 102 project skills already use the identical `SKILL.md`
convention — adoption is a no-op); subagent delegation; worktree isolation (Dime runs 51
worktrees in production); browser automation; MCP integration; approval gating; session
persistence. All present, several stronger than upstream.

**9. Which create unacceptable risk?**
Hermes's cost model — **no reserve-before-spend anywhere** (HA-502), which would violate
`AGENTS.md:20-21` outright. Its autonomous skill writer — default-on, approval off,
unmeasured, quota-driven, with a `delete` that permanently `rmtree`s (HA-304/307/308/316).
Skill loading — `SKILL.md` bodies can execute host shell via `` !`cmd` `` and neither scanner
knows the syntax (HA-312). Honcho's defaults — auth **off**, failing open to full admin
(SEC-O-03); a peer-scoped key can join any session and read it (SEC-O-01); deletion does not
cascade to derived beliefs and **individual messages cannot be deleted at all** (SEC-O-04,
HO-113); any processing error **permanently drops** a queue item (HO-404). And licensing:
AGPL for Honcho's server, plus SDKs declaring Apache-2.0/MIT with **no license text in the
tree** (LIC-O-02/03).

**10. What source-of-truth hierarchy prevents memory from corrupting canonical state?**
Git and the ledgers are authoritative for Tailered; deterministic pipelines and the eight
prediction tables are authoritative for Dime; memory is contextual only. Four conflict
rules: current verified evidence beats memory; a current explicit instruction beats a
historical preference; canonical state beats inferred memory; derived belief may never enter
authoritative state. The fourth is made **mechanical** by giving the chat lane a SELECT-only
credential (Gate D0.2) rather than relying on review.

**11. What architecture maximises one-shot execution and safe parallel agent work?**
Architecture **E**: Tailered's existing core, unchanged, plus a concurrency-safe ledger and
an optional memory adapter. One-shot execution is already the platform's strongest property —
its definition of done is **executable** (`src/ship.ts:486-524`), where Hermes only *infers*
completion from exit reason and iteration count (HA-115).

**12. What should Tailered build itself because it is strategically differentiating?**
**The procedure-outcome join.** Nobody has it: Hermes writes and prunes skills but never
measures whether any of it helps (HA-306, HA-307 — its curator decides by wall clock and its
consolidation prompt explicitly forbids using the one usage signal it has), and the Dime
program has zero skill-usage instrumentation (TA-103). Tailered already stores the outcome
data — `EvalRow` carries outcome, tests passed, tokens by tier, wall time, cost and
`caused_by`. **The join is one field.** That is the compounding mechanism the Platform Brief
already claims as the moat.

**13. What should Tailered stop rebuilding because upstream solved it better?**
**Nothing.** The audit looked specifically for this and the overlap is small: Hermes solves a
different problem (one operator, many surfaces) and Honcho solves one Tailered does not yet
have. The nearest candidate — memory — is deliberately deferred by
`docs/blueprint-execution.md:34-42`, and that refusal remains correct.

**14. What is the exact recommended future-state architecture?**
Architecture E, drawn in full in `18`, with the Dime variant alongside it.

**15. What is the smallest reversible sequence that validates it?**
Gate 0 (ledger concurrency) → Gate 1 (procedure-outcome join) → optional Gate 2 (memory
adapter) → deferred Gate 3 (Hermes as process agent, currently blocked). In parallel for
Dime: D0 (the two hardening items) → D1 (wire the existing runtimes) → optional D2 (memory
pilot, with byte-identical `hashEngineSource()` as the acceptance gate). Full detail in `19`.

---

## What was proven by execution rather than argued

| Proof | Result |
|---|---|
| Tailered baseline | 18/18 tests, `validate` VERIFIED, demo `shipped` at **$0.068 / 277 ms** |
| POC-A: agent over-reports spend | `halted_budget` — **reserve/settle held**, and the spend was still ledgered |
| POC-A: agent writes outside `product/` | halted; target file's sha256 **unchanged** |
| POC-A: path traversal | halted; file **absent from disk** |
| POC-A: agent-chosen arbitrary binary | **executed** — the boundary bounds mutation and accounting, **not execution** |
| POC-C: 3 concurrent runs | ledger corrupted; **one started run left no terminal eval** |
| Hermes approval detector (in an isolated harness) | `/bin/rm -rf /` → hardline **False**; `sudo rm -rf /` → **True** |

Five of seven specified POCs were **BLOCKED** — they require installing upstream dependency
trees and spending real inference, which this audit was not authorised to do. They are
recorded as BLOCKED with unblock conditions, never estimated. **No efficiency claim for skill
reuse, and no upstream benchmark number, appears anywhere in this audit.**

---

## Confidence, and where this audit could be wrong

Every CRITICAL and HIGH finding that reached an adversarial verifier and received a genuine
adjudication was CONFIRMED (16) or PARTIALLY_CONFIRMED with a scope correction (9). Two were
refuted — both claim-matrix entries rather than substantive findings, and one of them
**vindicated upstream's documentation** while confirming the narrower defect.

Thirteen verifier runs were invalidated by **a bug in this audit's own harness**, which
routed Hermes claim-matrix entries to the Honcho checkout. No finding is recorded as refuted
on that basis. The bug is disclosed in `01` rather than quietly dropped, and a false pass
caught mid-audit (a `validate | tail` reading `tail`'s exit code instead of the CLI's) is
disclosed in `16`.

The audit is most likely to be wrong where it is least able to execute: upstream runtime
behaviour, benchmark reproduction, and real cost. Those are marked `INFERRED` or `BLOCKED`
throughout. `21` lists what would most change these conclusions — chiefly, a measured POC-B
showing a Hermes worker completing Tailered benchmark tasks within the cap, which would move
Gate 3 from deferred toward a real trial.

---

## The one-line recommendation

**Keep your invariants, fix your ledger and your numeric-grounding vector, build the
measurement loop nobody else has, and treat these two repositories as the reference
architectures they are — not as dependencies you cannot package, cannot meter, and cannot
fully delete.**
