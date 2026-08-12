<!-- audit: {"audit_id":"AUD-RUFLO-20260811-221322","tailered_sha":"6172653e0aca0981d0abaf4ad8e9d587667737e9","ruflo_release":"v3.37.0","ruflo_sha":"6ce18b5a7fcd4939a2f72c2e3b8fdbdec660e5a9","generated":"2026-08-12T00:55:00Z","evidence_class":"MIXED","lane":"AUD-L0","caused_by":["AUD-RUFLO-20260811-221322/15-adoption-scorecard.md","AUD-RUFLO-20260811-221322/11-tailered-compatibility.md"]} -->

# 16 — Final recommendation

## Recommendation

**Do not adopt Ruflo as an execution substrate for the Tailered AI agent platform, and do not build
or deploy agents from this repository on it.**
Take four specific ideas from it by reimplementation or bounded read-only study, and re-evaluate the
product no earlier than two stable minor releases from now.

Overall verdict: **`NOT_QUALIFIED`**.

This is a judgement about `ruflo@3.37.0` as audited on 2026-08-11, not about the project's direction.
The capability *surface* is real and unusually broad. The problem is that the layer Tailered would
have to trust — reported success — is demonstrably unreliable, and the layer Tailered must own —
routing, repository writes, and spend — is a layer Ruflo also claims.

## Why, in one paragraph

A verification tool that prints `[OK] All fixes verified. Installed artifact matches the signed
witness manifest.` while its own summary two lines above reads `pass: 0, drift: 53, missing: 2`, and
exits 0, is not a verification tool. A memory subsystem that prints `[OK] Data stored successfully`,
exits 0, and leaves the database byte-identical with the value absent from the entire filesystem is
not persistence. A claim system in which six concurrent callers all receive `[OK] Claimed` while two
or three claims are silently discarded — leaving two agents holding exclusive ownership of one issue
— is not coordination. Each of these was reproduced independently, with postconditions read by a
separate process, and each is the audit specification's `CRITICAL` class stated verbatim: a reported
success with no durable postcondition. Tailered's constitution forbids exactly this: *"A false
'done' voids the work that claimed it."*

## The decisive evidence

Ranked by how much each one alone would block adoption.

1. **`ruflo verify` cannot verify.** On a pristine `npm install ruflo@3.37.0`, it reports 53 drift and
   2 missing, then declares success and exits 0, because `allOk` at `verify.js:201` excludes drift
   and missing by construction. Its Ed25519 signing seed is `sha256(gitCommit + ':ruflo-witness/v1')`
   — both inputs public — so anyone can forge a valid signature, and the manifest is fetched at
   runtime from the mutable branch `fix/issues-may-1-3`. The capability Tailered would most want is
   the one that fails hardest.
2. **Persistence silently loses data while self-certifying.** The sql.js/WASM fallback accepts writes,
   reports success, and discards them; `verifyMemoryInit` then reports `Verification passed
   (6/6 tests)` in that exact state because it re-reads an in-memory image rather than the disk.
   Backend selection is a silent `try/catch`, so the same install persists on glibc and loses
   everything on musl with no error, no warning, and no change in exit code.
3. **Five of the nine blocking compatibility questions answer NO** (Q5, Q7, Q8, Q11, Q12). Ruflo
   cannot be mounted read-only against a company repository (32 repository-local state paths, and
   *reading* memory mutates the repo); Tailered would no longer be the only component applying file
   changes; a stateful Thompson-bandit router displaces Tailered's stateless one; model identity
   cannot come from `tailered.config.json` (`agent_execute` has no `model` field at all); and a
   daemon autostarts on unrelated commands to run model-calling workers for up to twelve hours with
   no reservation.
4. **Concurrent state corruption is reproducible**, 3 of 3 trials, from an unlocked read-modify-write
   persisted by a non-atomic whole-file write — while the correct locked, atomic pattern already
   exists elsewhere in the same codebase and is simply not used.
5. **Supply chain and provenance are not sound.** The published package declares MIT while 94.87% of
   its files are an Apache-2.0 huggingface/chat-ui fork; a pinned `ruflo@3.37.0` still resolves
   floating alpha dependencies; `init` fetches an undeclared, unpinned 90 MB ONNX model at runtime
   into `node_modules`; the generated MCP registration is `npx -y ruflo@latest`; and `postinstall`
   walks up to twelve parent directories mutating every reachable `agentdb`, including pnpm store
   copies, so any pnpm-based workspace on the machine is exposed.

## What to take instead

Four ideas are worth having; none requires installing Ruflo.

1. **A per-agent-session cost and token ledger.** Tailered already meters per *call* (`RouteLog`,
   `AgentCallTrace`) and per *run* (`EvalRow`), but has no per-session rollup across a fleet of
   agents. That is a small, deterministic thing to build inside this repository.
2. **An agent-readiness scorecard** in the spirit of MetaHarness — grade a harness before shipping it.
   The idea is good; the implementation need not be Ruflo's.
3. **Agent-session observability as an enrichment stream** that is explicitly never the ledger. This
   is the strongest differential Ruflo offers and maps cleanly onto Tailered's existing `RouteLog`
   and `AgentCallTrace` shapes.
4. **The agent and command definitions as prompt assets.** 90 agent definitions and 167 slash
   commands ship as plain Markdown, MIT-licensed. They are readable and reusable without running any
   of the runtime that surrounds them.

## Changes Tailered should make regardless

These are pre-existing Tailered defects this audit surfaced. None is Ruflo's fault, all exist today at
the frozen baseline, and they are the audit's most immediately actionable output. Four are `CRITICAL`.

- **`RUF-710` (CRITICAL) — `product/` confinement is a textual prefix test.** `applyProductFiles`
  (`src/ship.ts:557-569`) checks `file.path.startsWith("product/")`. The string
  `product/../decisions/ADR-000.md` passes that check; `resolveRepoPath` resolves it to
  `<root>/decisions/ADR-000.md`, which is inside the root and therefore does not throw; and
  `writeAtomic` renames over the destination unconditionally. **An agent can overwrite an accepted,
  immutable ADR.** Fix by normalising first and testing the *resolved* path against the resolved
  `product/` directory, not the raw string.
- **`RUF-713` (CRITICAL) — agents inherit cwd and the environment.** `ProcessAgent` passes neither
  `cwd` nor `env` to `spawn`, so an agent receives the company repository as its working directory and
  every secret in the parent environment. Pass an explicit empty-ish `env` and a scratch `cwd`.
- **`RUF-715` (CRITICAL) — the timeout does not bound the call.** A descendant that holds stdout open
  disarms `AbortSignal.timeout`, so `invoke()` can hang without limit. Add a wall-clock timer that is
  independent of the child's streams.
- **`RUF-714` / `RUF-712` (CRITICAL/HIGH) — the ledger trusts the agent.** `usage` is agent-asserted
  and cross-checked by nothing, and `AgentResponse` carries no model or provider identity, so "model
  identity only from `tailered.config.json`" is unverifiable at the boundary and a lying agent
  controls the cost ledger.
- **`RUF-716` (HIGH) / `TAI-002`** — cancellation kills only the direct child and never escalates past
  `SIGTERM`, leaking the descendant tree. Spawn detached and kill the process group, or require every
  process agent to run inside a disposable container whose teardown is the kill.
- **`RUF-711` / `TAI-001` (MEDIUM)** — `AgentRequest` does not carry the projection, so the agent is
  never told the ceiling it is measured against; enforcement is post-hoc detection rather than
  prevention, and `ReserveSettleBudget.settle` adds an overage to the settled total before throwing.
- **`RUF-718` (MEDIUM)** — a failed call writes `usage.input = projection.maxTokens` into the
  append-only trace as though it had been measured, contaminating tokens-per-outcome analysis.
- **`RUF-719` (MEDIUM)** — `{files: []}` is a valid, billable `codegen` success.

## Revisit criteria

Re-audit when **all** of the following hold, and not before:

1. `ruflo verify` fails loudly — non-zero exit — on drift or missing files, signs with a key not
   derivable from public data, and anchors its manifest to an immutable tag shipped inside the package.
2. A memory write that cannot be persisted returns a non-zero exit and an explicit error, and
   `verifyMemoryInit` re-reads from disk in a separate process.
3. `issues claim` uses the atomic, locked path that already exists in the codebase, and claims expire.
4. The daemon does not autostart on unrelated commands, and no code path can spend without a
   caller-supplied ceiling.
5. Two consecutive stable minor releases pass without a `CRITICAL` false-success finding.

Until then the honest position is that Ruflo is an ambitious, fast-moving research platform whose
self-reports cannot be used as evidence — which is precisely the property a governance substrate
cannot lack.
