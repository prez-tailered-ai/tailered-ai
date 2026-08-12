<!-- audit: {"audit_id":"AUD-RUFLO-20260811-221322","tailered_sha":"6172653e0aca0981d0abaf4ad8e9d587667737e9","ruflo_release":"v3.37.0","ruflo_sha":"6ce18b5a7fcd4939a2f72c2e3b8fdbdec660e5a9","generated":"2026-08-12T01:30:00Z","evidence_class":"MIXED","lane":"AUD-L0","caused_by":["AUD-RUFLO-20260811-221322/16-final-recommendation.md","AUD-RUFLO-20260811-221322/15-adoption-scorecard.md","AUD-RUFLO-20260811-221322/14-risk-register.md"]} -->

# 00 — Executive verdict

**Overall verdict: `NOT_QUALIFIED`.**
Do not adopt Ruflo v3.37.0 as an execution substrate for the Tailered AI agent platform, and do not
build or deploy agents from this repository on it.
Take four of its ideas by reimplementation. Re-audit no earlier than two stable minor releases.

**Separately, and more urgently: this audit found four CRITICAL defects in Tailered AI itself.** They
are not Ruflo's fault, they exist today at the frozen baseline, and one of them lets any process agent
overwrite an accepted ADR. Fix those regardless of what happens with Ruflo.

## The verdict in one paragraph

Ruflo's capability surface is real and unusually broad — 53 CLI commands, 333 live MCP tools, and 90
agent definitions all reach a clean install. What fails is the layer any governance substrate must be
trusted on: its own reports. Of 90 documented claims, **42 were refuted** by independent postcondition
checks, **zero reached `DURABLE`, and zero reached `GOVERNABLE`**. The verification tool declares
`[OK] All fixes verified. Installed artifact matches the signed witness manifest.` while its own
summary two lines above reads `pass: 0, drift: 53, missing: 2`, and exits 0. Memory writes are
reported stored and are not readable by any other process. Six concurrent claim operations all return
`[OK] Claimed` while two or three are silently dropped. `swarm start` reports eight agents deployed
and persists none. Tailered's constitution states that a false "done" voids the work that claimed it;
by that standard most of what Ruflo reports cannot be used.

## Scale and provenance of this audit

| | |
| --- | --- |
| Repository in scope | `prez-tailered-ai/tailered-ai` **only** — audit host, integration host, agent-definition repository, deployment control plane, evidence destination, branch and commit target |
| Other first-party repositories accessed | **None** |
| Investigation lanes | 13, plus 2 synthesis passes and 1 re-scope lane — 16 agents, **0 errors** |
| Claims examined | 90 across 31 areas |
| Findings recorded | **212** (`CRITICAL` 33, `HIGH` 72, `MEDIUM` 66, `LOW` 20, `INFO` 21); 209 `VERIFIED` or qualified-`VERIFIED`, 11 recorded as positives, 12 pre-existing host defects |
| Hard blockers triggered | 21 (10 whole-product, 10 capability-specific, 1 opt-in-surface only) |
| Tailered compatibility | **5 of the 9 blocking questions answer NO** (Q5, Q7, Q8, Q11, Q12) |
| Ruflo execution | 100% inside disposable containers; host `$HOME` and credentials never mounted |
| Tailered baseline | green and reproducible before the audit (Node 24 ×2, Node 22 ×1, all exit 0) |

Every Ruflo capability was judged on an **independently observed postcondition** — read by a separate
process, from the filesystem, database, or process table — never on Ruflo's own success output.

## The five most important verified findings

1. **The verification tool cannot verify, and its signature proves nothing.** On a pristine
   `npm install ruflo@3.37.0`, `ruflo verify` reports 53 drift and 2 missing, then declares `[OK]` and
   exits 0, because `allOk` at `verify.js:201` excludes drift and missing by construction. Its Ed25519
   signing seed is `sha256(gitCommit + ':ruflo-witness/v1')` — both inputs public — so anyone can forge
   a valid signature, and the manifest is fetched at runtime from the mutable branch
   `fix/issues-may-1-3`. The capability Tailered would most want is the one that fails hardest.

2. **Persistence reports success and loses data.** The sql.js/WASM fallback accepts writes, prints
   `[OK] Data stored successfully`, exits 0, and leaves the database byte-identical with the value
   absent from the filesystem — while `verifyMemoryInit` reports `Verification passed (6/6 tests)` in
   that exact state, because it re-reads an in-memory image rather than the disk. On the MCP path the
   inverse failure appears: the write *does* reach `.swarm/memory.db` (proved with Node's built-in
   `node:sqlite`, no Ruflo code in the path), but a second process reports `totalEntries: 0` and
   `found: false`. Cross-session memory, the flagship claim, does not survive a process boundary.

3. **Ruflo's own files evict Tailered's constitution from the model's context.** Tailered's context
   snapshot admits 23 files from a pristine repository, including `AGENTS.md`, all four ADRs, and
   `v1-contract.md`. After `ruflo init` it admits 96 files — 93 of them under `.claude/` — and **zero
   Tailered governing files**, because sorted-path order puts `.agents`, `.claude`, and `.swarm` ahead
   of `AGENTS.md`, `decisions/`, and `docs/`, exhausting the 512,000-byte budget. `validate` still
   reports `VERIFIED`. The constitutional critique step would silently run without the constitution.

4. **Authority cannot be shared.** Ruflo persists a stateful Thompson-bandit router where Tailered law
   requires a stateless one; honours an explicit model only when it matches one of five hardcoded
   literals, while `agent_execute` has no `model` field at all; writes 32 repository-local state paths
   (merely *starting the MCP server* creates a 1.5 MB `ruvector.db` at the repo root, with no `init`);
   and autostarts a daemon on unrelated commands that runs model-calling workers for up to twelve
   hours outside any reservation. Even `ruflo swarm --help` rewrites a file in the repository.

5. **Concurrency corrupts state under exactly the pattern Tailered needs.** Six concurrent
   `issues claim` calls all return `[OK] Claimed` with exit 0 while two or three are silently
   discarded, leaving two agents holding "exclusive" ownership of one issue — reproduced 3 of 3. The
   root cause is an unlocked read-modify-write persisted by a non-atomic whole-file write, while the
   correct locked, atomic pattern already exists elsewhere in the same codebase and is not used.

## Recommended Ruflo integration boundary inside `prez-tailered-ai/tailered-ai`

**None at this version.** The only boundary that would satisfy Tailered's invariants — a container
with no ambient credentials, receiving one `AgentRequest` on stdin and returning one `AgentResponse`
on stdout, touching nothing else — was built and tested in Spike A and is **not achievable**: Ruflo
mutates its working repository on ordinary read commands, and its own boundary defects compound with
Tailered's. If Ruflo is ever re-qualified, that adapter shape is the only legal one; it must live
under `src/` in this repository as an implementation of the existing `Agent` interface, and it must
run in a disposable container whose teardown is the process kill. Any agent built or deployed from
this repository must be buildable from an immutable commit here, with its policy, configuration,
evidence, and rollback contract versioned here and nowhere else.

## The first agent-platform capability to test in production-like isolation

**Agent-session observability, as a read-only enrichment stream that is explicitly never the ledger.**
It is the strongest genuine differential, it maps cleanly onto this repository's existing `RouteLog`
and `AgentCallTrace` shapes (`src/contracts.ts`), and it can be evaluated without granting Ruflo
authority over anything. Test it only against a disposable copy of this repository. Do not begin with
memory — it is the worst subsystem. Full analysis in
`12-agent-build-and-deployment-applications.md`.

## The most serious reason not to adopt Ruflo wholesale

**Its self-reports are not evidence, and a governance substrate is nothing but its reports.** Tailered
exists to make every outcome traceable to a spec, a decision, a gate, a token count, and a cost. A
component that says "stored" without storing, "verified" with 53 mismatches, "claimed" while dropping
claims, and "8 agents deployed" while running none cannot be placed underneath that promise. This is
not a bug list to be fixed by configuration; it is a difference in what the word "done" means.

## What this audit found in Tailered AI itself

Recorded prominently because these are actionable today and are independent of the Ruflo decision.
Four are `CRITICAL`:

- **`product/` confinement is a textual prefix test.** `applyProductFiles` (`src/ship.ts:557-569`)
  checks `file.path.startsWith("product/")`, and `product/../decisions/ADR-000.md` passes it.
  `resolveRepoPath` then resolves that inside the repository root, so it does not throw, and
  `writeAtomic`'s `rename` overwrites unconditionally. **A process agent can overwrite an accepted,
  immutable ADR** — directly violating the constitution's immutability rule. Verified independently by
  the coordinator against the host source.
- **Agents inherit the company repository and the full environment.** `ProcessAgent` passes neither
  `cwd` nor `env`, so a spawned agent receives every secret in the parent environment.
- **The timeout does not bound the call.** A descendant holding stdout open disarms
  `AbortSignal.timeout` and the run hangs unboundedly; cancellation kills only the direct child and
  never escalates past `SIGTERM`, leaking the whole descendant tree.
- **The ledger trusts the agent.** `AgentResponse` carries no model or provider identity, and `usage`
  is agent-asserted and cross-checked by nothing — so a lying agent controls the cost ledger. The
  request also never carries the projection, so the agent is never told the ceiling it is measured
  against, and a failed call writes `usage.input = projection.maxTokens` into the append-only trace as
  if it had been measured.

## The exact next human decision required

**Decide whether to promote `proposed-adr.md` into the canonical `decisions/` sequence.** It is
written, complete, and deliberately left at `status: proposed` outside `decisions/`, because assigning
an ADR number and accepting a decision is the founder's act and this audit may not take it. Promoting
it records the declination; declining to promote it leaves the question open.

Two follow-ups do not need that decision and should start regardless: fix the four Tailered defects
above, and open the licensing question raised by the published `ruflo` package declaring MIT while
94.87% of its files are an Apache-2.0 huggingface/chat-ui fork.
