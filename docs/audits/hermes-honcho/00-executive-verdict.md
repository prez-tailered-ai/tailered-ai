# 00 — Executive verdict

**Target and sole writable repository:**
[`prez-tailered-ai/tailered-ai`](https://github.com/prez-tailered-ai/tailered-ai) @
[`6172653e`](https://github.com/prez-tailered-ai/tailered-ai/tree/6172653e0aca0981d0abaf4ad8e9d587667737e9)
— the repository in which agents will be built, evaluated, and deployed.

**Read-only upstream references:**
[`NousResearch/hermes-agent`](https://github.com/NousResearch/hermes-agent) @
[`ed5e17f4`](https://github.com/NousResearch/hermes-agent/tree/ed5e17f4b86da0c4f09c0694757b6074ae6b9d16)
(MIT) and [`plastic-labs/honcho`](https://github.com/plastic-labs/honcho) @
[`a92fb1e0`](https://github.com/plastic-labs/honcho/tree/a92fb1e0789fd29e9674aec133328513ed0dcda3)
(AGPL-3.0). Neither was modified, pushed to, or forked.

72 subagents · 8.0M tokens · 294 canonical findings · 143 recorded blockers · 2 executed
proofs of concept · 59 adversarial verifications.

---

## The verdict in one paragraph

**Adopt nothing as-is.** Integrate one thing behind a service boundary under eight mandatory
gates, copy three patterns and write them in Tailered's own TypeScript, adapt one file
format, and **build the one capability no examined system has**. Hermes and Honcho are
serious engineering, but neither is stronger than Tailered AI where Tailered is strong —
bounded spend, proved completion, enforced causal lineage, immutable artifacts, a single
write chokepoint — and those are precisely the properties an agent *platform* most needs.
The durable value upstream is architectural knowledge, not importable code.

**Dispositions:** 0 `ADOPT` · 0 `REPLACE` · 1 `ADAPT` · 1 `INTEROPERATE` (gated) ·
7 `REFERENCE` · 4 `DEFER` · 7 `REJECT`, with `KEEP TAILERED` the dominant outcome across the
eight capability domains in [12](12-tailered-agent-platform-opportunity.md).

## The one thing to fix first

**Tailered's ledger is not concurrency-safe, and this blocks every multi-agent objective.**

Three concurrent ship runs, executed against the frozen commit, produced 4 duplicate route
ids, 10 validator errors, `validate` exit **1**, and **one started run with no terminal
`EvalRow`** — a direct violation of the constitution's unconditional law that every started
run appends exactly one terminal record.

The cause is internal: read-then-write id allocation over an unlocked append, and `appendAdr`
running before `appendTerminalEval` inside the same `finally`, so an ADR collision throws past
the terminal write. **No external agent runtime can repair this**, because the corruption
happens after the agent returns.

It is not a v1 contract violation — v1 never claims concurrency, and its single-run demo and
CI are green. It is the hard prerequisite for everything the platform intends to become. The
full remediation contract, with eight requirements and seven acceptance criteria, is
[25-concurrency-remediation-contract.md](25-concurrency-remediation-contract.md). **This audit
specifies the fix and does not apply it.**

## Answers to the twenty-five questions

**1. What should Tailered learn from Hermes?** Three things: prompt-cache preservation (the
`api_content` sidecar replays original wire bytes so a long conversation reuses its prefix);
the `MemoryProvider` contract that makes memory an optional adapter; and the Kanban ownership
primitive — CAS claim + TTL + PID liveness + heartbeat, with real `git worktree` workspaces
per task.

**2. What should Tailered learn from Honcho?** Its tenancy *design* — composite foreign keys,
hashed vector namespaces, and retrieval scoped **at the query level** rather than
post-filtered. And, by counter-example, everything an evidence store must have that Honcho
lacks.

**3. What should Tailered explicitly not copy?** Hermes's cost model (no reserve-before-spend
anywhere); its autonomous skill writer (default-on, approval off, unmeasured, `delete`
permanently `rmtree`s); load-time shell execution in skill bodies; in-process unisolated
subagents. Honcho's epistemic model as a store of record (no supersession, unreachable
contradiction level, unvalidated provenance); memory injected as "authoritative"; its queue
error handling, which permanently drops an item on any processing error.

**4. Which existing Tailered mechanisms are already superior?** Reserve-before-spend;
the executable definition of done (Hermes only *infers* completion); `caused_by` lineage
enforced by a validator; `wx`-immutable replay artifacts; append-only ADR supersession; a
single write chokepoint; human gates whose verdicts are captured as labels; zero runtime
dependencies.

**5. Which Tailered gaps are real?** Four: ledger concurrency-safety; prompt-cache
preservation for multi-turn agents; a memory-provider abstraction; and cross-session
contextual memory itself.

**6. Which upstream ideas solve those gaps?** The CAS claim primitive, the `api_content`
sidecar, the `MemoryProvider` ABC, and — only behind gates — an external memory service.

**7. Which capabilities should Tailered build itself?** Procedure-outcome measurement; the
concurrency-safe ledger; the isolated worker layer; and the two memory lifecycle hooks Honcho
leaves empty.

**8. What should Tailered adapt from MIT-licensed Hermes?** The `SKILL.md` procedure format —
and *only* the format, without inline-shell expansion or autonomous authoring.

**9. Should Tailered ever interoperate with Honcho?** Only as an unmodified external service,
never as linked source, and only if all eight gates in
[17](17-adoption-decision-matrix.md) hold. Otherwise the disposition degrades to `DEFER`.

**10. What hardening would Honcho require?** `USE_AUTH=True` (it ships **off**, failing open
to full admin); one workspace per isolation unit; no cross-peer tool surface; proven erasure
of derived beliefs; explicit provider configuration; and spend metered by Tailered.

**11. How should agents store contextual memory without corrupting canonical state?** Under
the knowledge hierarchy in [18](18-reference-architecture.md): canonical verified state >
current explicit instruction > trusted procedural rule > contextual memory > inferred
hypothesis — injected in a non-authoritative region, with no model-write tool, and **tested**
rather than asserted.

**12. How should Tailered execute many agents concurrently?** Not until Gate 0. Then: CAS
claims with TTL and heartbeats, worktree-per-task, disposable workers, and ownership state
that distinguishes "in progress" from "abandoned".

**13. How should Tailered evaluate whether a procedure improves performance?** By joining
`procedure_id` to the outcome data it already writes — outcome, tests passed, tokens by tier,
wall time, cost — and deciding retention on measurement rather than a clock. Specified in
[26](26-procedure-outcome-architecture.md).

**14. How should agent isolation work?** At the OS. Both systems agree: Hermes states the OS
is its only boundary, and Tailered's own documentation says `--allow-local-execution` "is not
a sandbox". POC-A confirmed the process boundary bounds mutation and accounting but **not**
execution.

**15. How should agent cost be bounded?** By extending Tailered's existing reserve/settle to
**every** new spend channel — subagents, tools, and any external memory service. This is the
platform's strongest property and the one both upstreams lack.

**16. How should every action remain causally attributable?** `caused_by` on every record,
validator-enforced, with artifacts immutable by filesystem flag. Already true; preserve it.

**17. How should agent failures recover?** Halt and name the blocker, with a terminal record
written regardless — the property POC-C showed breaks under concurrency and Gate 0 restores.

**18. What architecture best supports one-shot execution?** Tailered's existing one. Its
definition of done is executable; that is the platform's defining advantage.

**19. What architecture best supports parallel execution?** Architecture E: the existing core
plus a concurrency-safe ledger, task ownership, and isolated workers.

**20. What scales from a few agents to a workforce?** Three independent axes: correctness
under contention, isolation per worker, and bounded spend per unit of work. The third is the
one both upstreams neglect and the one that decides affordability.

**21. Which upstream dependencies create unacceptable risk?** Hermes as a dependency is
**impossible** — `setup.py` raises on wheel and sdist, and PyPI/Homebrew are explicitly
unsupported. Its churn is ~1,051 commits/week with no semver policy, coverage unmeasured, and
a required E2E check disabled while still scoring green. Honcho's server is AGPL, and its
SDKs declare Apache-2.0/MIT with **no license text in the tree**.

**22. What is the recommended architecture?** Architecture E, drawn with per-component
provenance labels in [18](18-reference-architecture.md).

**23. What sequence builds it?** Gate 0 (ledger) → Gate 1 (measurement) → Gate 2 (procedures);
Gate 4 (isolated workers) → Gate 5 (external runtime, blocked); Gate 3 (memory) independently
and only if wanted. See [19](19-implementation-roadmap.md).

**24. What must be fixed before multi-agent deployment?** Concurrency-safe identifiers;
crash-safe finalisation; a contention test that provably fails on today's code; an isolated
worker; reserve/settle extended to every channel; and ownership state sufficient to detect
abandonment.

**25. What should remain proprietary?** The evidence chain, the executable definition of done,
reserve/settle metering, the zero-dependency posture — and the procedure-outcome corpus, which
compounds with use and cannot be rented.

## What was proven by execution rather than argued

| Proof | Result |
|---|---|
| Tailered baseline | 18/18 tests, `validate` VERIFIED, demo `shipped` at **$0.068 / 277 ms**, 4 packages / 0 vulnerabilities |
| POC-A: agent over-reports spend | `halted_budget` — **reserve/settle held**, and the spend was still ledgered |
| POC-A: agent writes outside `product/` | halted; target file's sha256 **unchanged** |
| POC-A: path traversal | halted; file **absent from disk** |
| POC-A: agent-chosen arbitrary binary | **executed** — the boundary bounds mutation and accounting, **not execution** |
| POC-C: 3 concurrent runs | ledger corrupted; **one started run left no terminal eval** |
| Hermes approval detector (isolated harness) | `/bin/rm -rf /` → hardline **False**; `sudo rm -rf /` → **True** |
| Harness regression tests | 8/8 pass, locking the repository-routing invariant |

Five of seven POCs are **BLOCKED** — they require installing upstream dependency trees and
spending real inference, which this audit was not authorized to do. They are recorded as
BLOCKED with unblock conditions, never estimated. **No skill-reuse efficiency claim and no
upstream benchmark number appears anywhere in this audit.**

## Confidence, and where this audit could be wrong

The verification harness had a defect: it routed work to repositories by an id-prefix
heuristic, and 19 verifications were pointed at the wrong checkout. **All 19 were rerun with
explicit repository binding and identity assertion — 19/19 matched**, yielding 7 CONFIRMED,
9 PARTIALLY_CONFIRMED, 3 REFUTED. A regression test now makes the defect unrepeatable.

The corrected pass **downgraded two of this audit's own findings**, and both downgrades are
recorded in place: subagent isolation is "accurate but under-scoped" rather than misleading,
and cross-agent file safety *serialises* writes with a real lock while only *reporting* stale
overwrites. A separate claim that Hermes's documented "always-on hardline floor" was
misleading did not survive — the floor genuinely runs before the bypass; the narrower
command-position defect (SEC-H-01) was confirmed independently.

The audit is most likely to be wrong where it could not execute: upstream runtime behaviour,
benchmark reproduction, and real cost. Those are marked `INFERRED` or `BLOCKED` throughout.
[21](21-open-questions.md) lists what would most change these conclusions.

## The one-line recommendation

**Fix the ledger, build the measurement loop nobody else has, extend reserve/settle to every
new spend channel — and treat Hermes and Honcho as the reference architectures they are, not
as dependencies you cannot package, cannot meter, and cannot fully delete.**
