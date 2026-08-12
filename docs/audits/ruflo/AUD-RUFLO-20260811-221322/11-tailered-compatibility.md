<!-- audit: {"audit_id":"AUD-RUFLO-20260811-221322","tailered_sha":"6172653e0aca0981d0abaf4ad8e9d587667737e9","ruflo_release":"v3.37.0","ruflo_sha":"6ce18b5a7fcd4939a2f72c2e3b8fdbdec660e5a9","generated":"2026-08-11T22:30:00Z","evidence_class":"MIXED","lane":"AUD-L6a","caused_by":["AUD-RUFLO-20260811-221322/01-audit-charter.md"]} -->

# 11 — Tailered AI compatibility: the 25 binding questions

## Scope and evidence ceiling

This lane read the complete Tailered AI implementation at the frozen SHA and answered 25
compatibility questions against the packaged Ruflo v3.37.0 artifacts. Nothing was installed and
nothing was executed. **The highest evidence level reachable here is PACKAGED** — the code exists
in a published tarball. No answer below claims REACHABLE, EFFECTIVE, DURABLE, or GOVERNABLE.
Where an answer depends on runtime behaviour, that is stated as `UNKNOWN` or labelled `INFERRED`
rather than asserted.

Evidence roots:

- `TA =` `/tmp/aud-ruflo-20260811/tailered-ai-audit/` (Tailered at `6172653e`)
- `T =` `/tmp/aud-ruflo-20260811/work/extract/cli/package/` (the published `@claude-flow/cli@3.37.0` tarball)
- `R =` `/tmp/aud-ruflo-20260811/work/extract/ruflo/package/` (the published `ruflo@3.37.0` tarball)

Ruflo's own README, SKILL.md, and marketing counts are never treated as evidence of behaviour.
Where I cite a Ruflo source comment describing Ruflo's own cost or latency, the existence of the
comment is `VERIFIED` and the number in it remains Ruflo's unverified claim.

## The system under integration, counted

Tailered AI is small enough to hold entirely in evidence, and I counted it rather than accepting
any summary:

| Measure | Value | Source |
| --- | ---: | --- |
| Source files / lines (`TA src/`) | 16 / 3,615 | `wc -l TA/src/*.ts` |
| Test files / lines (`TA test/`) | 5 / 501 | `wc -l TA/test/*.ts` |
| Runtime dependencies | **0** | `TA package.json:26-29` (only `typescript`, `@types/node`, both dev) |
| `Agent` interface methods | 2 | `TA src/agent.ts:11-14` |
| `AgentRequest` fields | 7 required + 1 optional | `TA src/contracts.ts:202-211` |
| `AgentResponse` fields | `payload` + `usage{input,output,costUsd}` | `TA src/contracts.ts:218-221` |
| Task kinds | 6 | `TA src/contracts.ts:36-42` |
| Terminal outcomes | 4 | `TA src/contracts.ts:44-48` |
| Paths `validateCompany` requires | 12 | `TA src/validate.ts:17-30` |
| Operating-law clauses in the constitution | 20 | `TA AGENTS.md:17-36` |
| Context-snapshot top-level exclusions | 6 (`evals`, `labels`, `.tailered`, `.git`, `node_modules`, `dist`) | `TA src/context.ts:47-49` + `TA src/files.ts:14` |
| Context-snapshot byte cap | 512,000 | `TA src/files.ts:141` |
| Run cost cap (exclusive) | $5.00 | `TA src/contracts.ts:19`, `TA tailered.config.json:10` |
| Attempts per check | 3 | `TA src/contracts.ts:18` |
| Demo wall-clock ceiling | 10 min | `TA src/contracts.ts:20`, enforced `TA src/ship.ts:512` |

Ruflo counts established independently in this lane (packaged tarball only):

| Measure | Value | Source |
| --- | ---: | --- |
| `process.cwd()` call sites in `T dist/src/` | **219** (15 of them in `dist/src/mcp-tools/`) | `grep -rn "process.cwd()" T dist/src/` |
| Distinct repo-local state paths named as string literals | **32** (27 under `.claude-flow/`, 5 under `.swarm/`) | `grep -rho "'\.\(claude-flow\|swarm\)/…'" T dist/src/` |
| Packaged command modules referencing a `flags.json` output mode | **11** files (10 top-level) out of **56** top-level modules in `T dist/src/commands/` | `grep -rl "flags.json"` |
| Model identifiers `agent_spawn` accepts as explicit | **5** (`haiku`, `sonnet`, `opus`, `opus-4.7`, `inherit`) | `T dist/src/mcp-tools/agent-tools.js:129` |
| Default daemon TTL / idle shutdown | 12 h / 30 min | `T dist/src/services/worker-daemon.js:72,76` |

## Question-by-question

Answers: **YES** — supported as posed. **CONDITIONAL** — achievable only under stated,
enforceable conditions. **NO** — not supported as posed. **UNKNOWN** — undecidable without
execution. Labels: `VERIFIED` (observed directly in the cited files), `INFERRED` (reasoned from
observed code, not observed), `UNKNOWN`.

| # | Question | Answer | Tailered evidence | Ruflo evidence | Label |
| ---: | --- | --- | --- | --- | --- |
| 1 | Operate through an implementation of the existing `Agent` interface? | **YES** | `src/agent.ts:11-14`; `src/ship.ts:68-76` accepts any `Agent` | `T dist/src/mcp-tools/agent-execute-core.js:397-416` (one prompt → one response) | VERIFIED |
| 2 | Receive one bounded `AgentRequest` without needing direct repository ownership? | **CONDITIONAL** | `src/contracts.ts:202-211`; snapshot passed as a string, `src/ship.ts:123-132` | Ruflo has no snapshot input; it reads cwd — 219 `process.cwd()` sites, `T dist/src/services/headless-worker-executor.js:839-909` builds its own context by `readdirSync` | VERIFIED |
| 3 | Return one valid `AgentResponse` with payload and measured usage? | **CONDITIONAL** | `src/agent.ts:133-156` requires integer `input`/`output` **and** finite `costUsd` | Tokens yes (`T …/agent-execute-core.js:156-158`); USD cost **absent** on that path — only the `claude --print` path returns `total_cost_usd` (`T dist/src/services/headless-worker-executor.js:371`) | VERIFIED |
| 4 | Preserve Tailered's process-agent JSON boundary? | **CONDITIONAL** | `src/agent.ts:35-53,56-103`; contract `docs/agent-protocol.md:3` | `ruflo` with no args + non-TTY stdin enters **MCP stdio server mode** (`R bin/ruflo.js:55-58`); stdout purity is a known, actively patched hazard (`T bin/cli.js:16-31`) | VERIFIED |
| 5 | Mount the Ruflo side read-only against the company repository? | **NO** | `src/agent.ts:63-67` passes no `cwd`; the child inherits the invoking cwd | Even the single-call path writes `.claude-flow/agents/store.json` (`T …/agent-execute-core.js:31-34,405`); 32 distinct repo-local state paths; `T dist/src/services/policy-runtime.js:7-15` writes `.claude-flow/policy/state.json` | VERIFIED |
| 6 | Return complete `product/` file proposals without applying them? | **NO** | `src/ship.ts:557-569` is the only apply path; `docs/agent-protocol.md:76-87` defines the `files[]` contract | No packaged surface returns whole-file proposals; `T …/agent-execute-core.js:523-524` states the single-shot path "produces no unified diff"; the file-producing paths edit in place (`T dist/src/services/headless-worker-executor.js:1050-1056`) | VERIFIED |
| 7 | Remain the only component that validates and applies file changes? | **NO** | `src/ship.ts:557-569`, `src/files.ts:16-32,34-42` | Ruflo writes 32 repo-local paths outside any Tailered validation; `T dist/src/init/executor.js:1455-1478` rewrites the host root `.gitignore`; `T .claude/settings.json:20-31` installs a `Write\|Edit\|MultiEdit` post-edit hook | VERIFIED |
| 8 | Retain exclusive reserve-and-settle budget authority? | **CONDITIONAL** (NO by default) | `src/budget.ts:42-64,66-96`; `src/ship.ts:133-138,222-247` | Daemon autostarts on any non-`daemon` command once a marker exists (`T dist/src/index.js:197-198`, `T dist/src/services/daemon-autostart.js:145-154,163-180`) and runs 7 model-calling workers for up to 12 h — spend with no reservation | VERIFIED |
| 9 | Provide a hard projected ceiling before execution? | **NO** | `src/agent.ts:27-33`; ceiling asserted by config, `src/contracts.ts:244-255`; law `AGENTS.md:20` | No API returns `{maxCostUsd,maxTokens}` pre-call. `T dist/src/services/fable-harness.js:56-65` is an *estimate*; `:247` computes a residual cap and `:269-271` accounts spend **after** the call, substituting an estimate when the envelope carries no cost | VERIFIED |
| 10 | Independently verify actual cost and tokens? | **CONDITIONAL** | `src/agent.ts:139-152` validates the numbers but cannot audit them | Tokens are provider-reported (`T …/agent-execute-core.js:156-158`; `T …/headless-worker-executor.js:368-370`). Cost is measured only via `claude --print` (`:371`); elsewhere it is computed from a hand-maintained table with a $1/Mtok fallback for unknown ids (`T dist/src/ruvector/model-prices.js:17-18`) | VERIFIED |
| 11 | Keep Tailered's stateless router authoritative? | **NO** | `src/router.ts:12-48` (pure function, no state); law `AGENTS.md:28` | Ruflo ships a **stateful** Thompson-bandit router persisting `.swarm/model-router-state.json` (`T dist/src/ruvector/model-router.js:8-16,304`), plus q-learning/neural/coverage routers, and preempts the caller at `T …/agent-tools.js:131-165` and `T …/agent-execute-core.js:425-462` | VERIFIED |
| 12 | Keep model identity coming from `tailered.config.json`? | **NO** | `src/config.ts:53-61` accepts any non-empty alias; `src/ship.ts:84,121`; law `AGENTS.md:29`; proven by `test/ship.test.ts:142-171` | `agent_spawn` honours an explicit model **only** if it is one of five hardcoded literals; anything else silently falls through to Ruflo's router (`T dist/src/mcp-tools/agent-tools.js:127-131`). `agent_execute` has **no** `model` field at all (`T …/agent-tools.js:369-379`) | VERIFIED |
| 13 | Prove the exact selected model and provider? | **CONDITIONAL** | `src/contracts.ts:186-188` stores model on every trace; `src/validate.ts:276-290` cross-checks trace against route log | Server-reported model is returned on the API path (`T …/agent-execute-core.js:150`), and the retry winner is recorded (`:454`). On the `claude --print` path the envelope parser extracts result/tokens/cost/duration and **no model** (`T …/headless-worker-executor.js:362-372`). Provider is never returned as a field | VERIFIED |
| 14 | Keep Tailered's context snapshot as the input authority? | **CONDITIONAL** | `src/context.ts:32-78`; `src/files.ts:130-179`; `docs/agent-protocol.md:39-41` | Ruflo assembles its own context from cwd (`T …/headless-worker-executor.js:733,839-909`) and auto-loads `CLAUDE.md` — the documented 4.6× cost driver (`T dist/src/services/fable-harness.js:11-16,41-44`); hooks reinject memory (`T .claude/settings.json:32-40`) | VERIFIED |
| 15 | Avoid creating a second canonical context store? | **NO** | ADR-000 consequence: "Plain repository files are the public contract and the sole company state" (`decisions/ADR-000.md:19`) | 14 SQLite tables and 32 repo-local state paths; `.swarm/memory.db` is a durable second store, and `memory_*` tools are unconditionally registered (`T dist/src/mcp-client.js:118-175`; only `browser_*` is conditional, `:75-88`) | VERIFIED |
| 16 | Represent every Ruflo call in the append-only call trace? | **CONDITIONAL** | `src/ship.ts:143-199` writes exactly one trace + one route log per `invoke`; `src/validate.ts:138-141` enforces unique `call_id` | One wrapped call is representable. Ruflo's internal fan-out (N provider calls, retries at `T …/agent-execute-core.js:437-456`) collapses to one row, and daemon-initiated calls occur outside any `invoke` and produce **no** row | VERIFIED |
| 17 | Retain `caused_by` links on every call? | **YES** | Tailered attaches them itself: `src/ship.ts:173,195,370,437-440,460-464`; `src/context.ts:85-93`; enforced `src/validate.ts:170-172,185-187,226-228,291-296` | Nothing in Ruflo is required to contribute; nothing in Ruflo removes them | VERIFIED |
| 18 | Keep failure, timeout, cancellation, and accounting violations visible? | **CONDITIONAL** | `src/ship.ts:202-247` records `failed` / `accounting_violation`; `src/contracts.ts:177-180`; settlement-at-ceiling on failure `src/ship.ts:205` | Ruflo returns provider failures as **successful tool results** `{success:false, error}` (`T …/agent-execute-core.js:100-104,466-470`) — a wrapper that reads only the transport layer records a failed model call as `completed`. Ruflo also swallows errors at ≥6 sites (`catch { /* silent */ }`, e.g. `T dist/src/index.js:168,188,203`). Daemon spend is invisible entirely | VERIFIED |
| 19 | Keep the human deployment gate unchanged? | **YES** (conditional on tool scoping) | `src/ship.ts:351-393`, `src/ship.ts:571-578`, `policies/gates.yaml` via `src/company.ts:401-411`; DoD `src/ship.ts:498-517` | Nothing in Ruflo deploys the Tailered preview. Ruflo *does* package `gh pr merge` / `gh pr close` (`T dist/src/mcp-tools/github-tools.js:322,338`), which must not be exposed to the integration | VERIFIED |
| 20 | Will the gating demo still finish inside its time bound? | **UNKNOWN** | 10 min asserted at `src/ship.ts:512`; ≥4 agent calls per run (`test/ship.test.ts:49`) | Ruflo's own wrapper comment states the dist "eagerly loads ruvector + a 23 MB ONNX model on cold cache, blocking 60+ s and causing SIGTERM" (`R bin/ruflo.js:9-15`). Existence of the comment is VERIFIED; the number is Ruflo's unverified claim | UNKNOWN |
| 21 | Will the run stay below its exclusive cost cap? | **CONDITIONAL** | `src/budget.ts:48-54`; `src/validate.ts:164-166` re-checks `< $5.00` at validation time | Ruflo's own measured figure for `claude -p` launched **from the project dir** is $1.56/call (`T dist/src/services/fable-harness.js:41-42`). Four such calls = $6.24 > $5.00. From a clean cwd the same file measures $0.34/call | VERIFIED (arithmetic on Ruflo's stated figures) |
| 22 | Remove Ruflo without data migration or loss of company readability? | **YES** (conditional) | `src/validate.ts:17-30` names no Ruflo path; company state is plain files | Deletion set is enumerable: `.claude-flow/`, `.swarm/`, `.claude/`, `.mcp.json`, `CLAUDE.md`, root `.gitignore` additions (`T dist/src/init/executor.js:1455-1478`), `~/.claude/CLAUDE.md` block (`:2036-2057`), `~/.config/ruflo/policy-trust/` (`T dist/src/services/policy-runtime.js:51-56`) | VERIFIED |
| 23 | Delete all Ruflo-owned temporary state safely? | **CONDITIONAL** | Tailered never reads Ruflo paths | Deleting `.claude-flow/policy/state.json` while the external anchor survives makes Ruflo **fail closed** with `policy-state-missing-for-anchored-project` (`T dist/src/services/policy-runtime.js:71-88`). A detached daemon may still hold the tree for up to 12 h after deletion (`T dist/src/services/worker-daemon.js:72`) | VERIFIED |
| 24 | Does a company repository remain valid when Ruflo is absent? | **YES** | `src/validate.ts:49-158` checks only the 12 required paths, config parse, ledger integrity, and causal edges — none Ruflo-dependent; `test/company.test.ts:16-29` | Ruflo adds files but removes none | VERIFIED |
| 25 | Can Ruflo be version-pinned without mutable package tags? | **CONDITIONAL** | Agent identity is a `command` + `args` pair (`src/contracts.ts:244-247`), so any pinning strategy is expressible | `ruflo@3.37.0 → @claude-flow/cli: ^3.33.0` (`R package.json:43`, pre-verified). Pinning the implementation directly still leaves 11 caret dependency ranges and 5 caret optionalDependencies (`T package.json` dependencies/optionalDependencies) plus a `postinstall` (`T package.json` scripts) | VERIFIED |

## Question notes (the answers that need their reasoning stated)

**Q1.** `Agent` is two methods. A `RufloAgent implements Agent` compiles. The load-bearing point is
that `project()` must return a *hard ceiling* (`TA src/agent.ts:27-33`), and Ruflo supplies no such
number (Q9) — so the ceiling would be the integrator's static assertion, exactly as
`ProcessAgentConfig.projections` is today (`TA src/contracts.ts:248-255`). The interface fits; the
guarantee behind it does not come from Ruflo.

**Q2.** `AgentRequest.contextSnapshot` is a string (`TA src/contracts.ts:209`). Ruflo has no input
that accepts a serialized snapshot. An adapter must materialize the snapshot into a scratch
directory and run Ruflo there. That is implementable, and it is also the only way Q5 and Q15 get a
non-negative answer — but it means Ruflo owns *a* directory in every case; the question is only
whether that directory is the company repo.

**Q4.** Two independent problems. First, mode selection: `R bin/ruflo.js:55` computes
`isMCPMode = !process.stdin.isTTY && (process.argv.length === 2 || isExplicitMCP)`. Tailered's
`ProcessAgent` always pipes stdin (`TA src/agent.ts:65`), so stdin is never a TTY; invoking `ruflo`
with `args: []` therefore starts a JSON-RPC **server**, not a one-shot command. `TA src/agent.ts:101`
ends stdin and `:90-100` waits for `close`. `INFERRED:` the run then hangs until
`AbortSignal.timeout` fires. Second, stdout purity: `T bin/cli.js:16-31` installs a console filter
*because* upstream libraries write progress text to stdout and "corrupts MCP JSON-RPC stdio". Only
11 of the packaged command modules reference a JSON output mode. The boundary is preservable only
behind a purpose-written adapter binary that never lets Ruflo own stdout — never by pointing
`ProcessAgentConfig.command` at `ruflo`.

**Q9/Q10.** Ruflo's budget discipline is real but structurally post-hoc. `FableHarness` computes a
residual per-call cap and forwards it to the external `claude` CLI
(`T dist/src/services/fable-harness.js:245-255`), then adds the *measured* spend afterwards, falling
back to an estimate when the envelope has no cost field (`:269-271`), and only stops *launching
further batches* once the cumulative figure crosses the cap (`:193`, `:216`). That is a soft cap with
one batch of overshoot, not a pre-declared ceiling. `testgen_tdd_repair` advertises `budgetUsd`
default 5.0 as a "Hard cap — claude exits when reached"
(`T dist/src/mcp-tools/testgen-tools.js:135`), but the enforcement is the external `claude` binary's,
and lane AUD-L1a established that this tool is packaged yet **not registered**
(`03-ruflo-capability-inventory.md` §3.2).

**Q11/Q12.** This is the sharpest incompatibility in the lane.
`T dist/src/mcp-tools/agent-tools.js:127-131`:

```js
async function determineAgentModel(agentType, config, task) {
    // 1. Explicit model in config
    if (config.model && ['haiku', 'sonnet', 'opus', 'opus-4.7', 'inherit'].includes(config.model)) {
        return { model: config.model, routedBy: 'explicit' };
    }
```

Any model string outside those five literals is **silently discarded** — no error, no warning — and
Ruflo's own router picks instead (`:132-199`). Tailered's registry accepts any non-empty alias
(`TA src/config.ts:53-61`) and its shipped values are `best-available` / `mid-available` /
`cheap-available` (`TA tailered.config.json:3-7`). `test/ship.test.ts:142-171` exists specifically to
prove that a registry string swap changes every runtime model request; against Ruflo that test's
guarantee evaporates. Even substituting concrete provider ids does not fix it — `claude-sonnet-5` is
not in the five-literal allowlist either.

`agent_execute`, the closest single-call surface, has no `model` property in its input schema at all
(`T dist/src/mcp-tools/agent-tools.js:369-379`); it reads the model off the stored agent record
(`T …/agent-execute-core.js:387-398`).

**Q13.** Partially provable. The API path returns the server-reported `data.model`
(`T …/agent-execute-core.js:150`) and updates `agent.modelId` to the retry winner (`:454`), so the
model that actually answered is observable. The `claude --print` path is not: its envelope parser
(`T …/headless-worker-executor.js:362-372`) extracts `result`, `input_tokens`, `output_tokens`,
`total_cost_usd`, `duration_ms` — and no model identifier. Provider is never a returned field on
either path.

**Q18.** Failures are visible *if the adapter reads the payload*. Ruflo's convention is that a
provider failure is a successful tool call carrying `{success:false, error}`
(`T …/agent-execute-core.js:100-104`, `:142`, `:165`). Tailered's `invoke` only treats a thrown exception or a
non-zero exit as failure (`TA src/ship.ts:202-220`), so a naive adapter records a failed model call
as `status: "completed"` with whatever usage Ruflo reported. That is a silent corruption of the
`AgentCallStatus` field (`TA src/contracts.ts:177-180`) and it is avoidable only by an explicit
adapter rule.

**Q22/Q23.** Removal is clean for the *company* — Tailered's 12 required paths and its ledgers are
untouched. It is not clean for the *machine*: `ruflo init` appends a block to `~/.claude/CLAUDE.md`
(`T dist/src/init/executor.js:2036-2057`) and the policy runtime creates an out-of-repo trust anchor
under `~/.config/ruflo/policy-trust/<sha256(realpath)>/` (`T dist/src/services/policy-runtime.js:51-56`)
whose survival makes a partial in-repo deletion fail closed (`:71-88`).

**Q25.** Direct pinning does not resolve to a fixed tree by itself.
`npm i @claude-flow/cli@3.37.0` pins one package; that package then declares 11 caret ranges
(`@iarna/toml ^2.2.5`, `bcryptjs ^3.0.3`, `chalk ^5.3.0`, `commander ^12.0.0`, `fs-extra ^11.2.0`,
`inquirer ^9.2.0`, `sql.js ^1.13.0`, `toml ^3.0.0`, `ws ^8.21.0`, `yaml ^2.8.0`, `zod ^3.22.0`) and 5
caret optionalDependencies (`@claude-flow/memory ^3.0.0-alpha.22`, `agentdb ^3.0.0-alpha.17`,
`agentic-flow ^3.0.0-alpha.1`, `better-sqlite3 ^12.9.0`, `ruvector ^0.2.27`). A committed lockfile in
the *consuming* project does pin the whole resolved tree by integrity hash, so reproducibility is
attainable. Four things a lockfile does **not** fix:

1. `postinstall: node ./scripts/postinstall.cjs` still executes on install. A lockfile pins *what*
   runs, not *whether* it runs; `--ignore-scripts` is required to suppress the up-to-12-parent
   directory walk documented as RUF-L1a-07.
2. `INFERRED` (documented npm semantics, not observed here): `overrides` are honoured only from the
   root project's `package.json`. The 33 security pins in `R package.json:46-78` are therefore inert
   when `ruflo` is a dependency, and the consumer must re-declare them.
3. `@claude-flow/cli` declares **no** `engines` field, so no runtime floor is carried (RUF-L1a-06).
4. Runtime fetches are not versioned: `ruflo verify` defaults to fetching its manifest from the
   branch `fix/issues-may-1-3` (RUF-L1a-02), and the funnel/proxy paths call live endpoints. Pinning
   the package does not pin what the package downloads.

**Recommended pinning form, if adoption proceeds at all:** depend on `@claude-flow/cli@3.37.0`
directly rather than on `ruflo` (which removes the caret indirection *and* the 499-file chat-ui
payload, RUF-L1a-05), commit a lockfile, install with `--ignore-scripts`, re-declare the overrides at
the consumer root, and vendor the resolved tarball so `ProcessAgentConfig.command` points at a fixed
path (`TA src/contracts.ts:245`).

## Blockers

The audit brief designates questions 5, 7, 8, 11, 12, 18, 19, 22, and 24 as adoption-blocking. Of
those, **four are answered NO and one is CONDITIONAL-with-a-NO-default**. These are not softened.

### BLOCKER-1 — Q5: Ruflo cannot be mounted read-only against the company repository. (NO)

Every packaged execution path writes into its working directory. The narrowest single-call surface,
`agent_execute`, writes `.claude-flow/agents/store.json` before and after each call
(`T dist/src/mcp-tools/agent-execute-core.js:31-34`, called at `:405`, `:567`, `:570`). Thirty-two
distinct repo-local state paths are named as literals in the packaged dist, and more are assembled by
`path.join`. Tailered's `ProcessAgent` supplies **no `cwd`** to the child (`TA src/agent.ts:63-67`),
so the agent inherits whatever directory `tailered ship` was launched from — which is normally the
company repo.

*Consequence:* the repo stops being the sole company state (`TA decisions/ADR-000.md:19`), and the
repository hash that every context snapshot and call trace is keyed to
(`TA src/files.ts:169`, `TA src/validate.ts:205-207,216-220`) starts moving for reasons unrelated to
the run.

*Only mitigation found:* a copy-in/copy-out adapter that materializes the snapshot into a disposable
scratch directory, runs Ruflo with that as cwd, and copies nothing back except parsed file
proposals. This is a different integration shape from "mount Ruflo on the repo", and it makes every
Ruflo learning/memory claim vacuous because the store is discarded each call.

### BLOCKER-2 — Q7: Tailered would no longer be the only component that applies file changes. (NO)

`TA src/ship.ts:557-569` is the single apply path, and it enforces the `product/` prefix, the 5 MB
limit, and repository-relative resolution (`TA src/files.ts:16-32`). Ruflo writes outside it in three
ways: its own 32 state paths; the host root `.gitignore`
(`T dist/src/init/executor.js:1382,1455-1478`); and the packaged `PostToolUse` hook on
`Write|Edit|MultiEdit` (`T .claude/settings.json:20-31`). The code-producing paths edit files in
place through a spawned `claude` with edit tools
(`T dist/src/services/headless-worker-executor.js:1050-1056`) rather than returning proposals.

*Consequence:* `AGENTS.md:34` ("Emit whole files or exact diffs") and the `product/`-only restriction
become unenforced conventions rather than checked invariants.

### BLOCKER-3 — Q11: Tailered's stateless router cannot remain authoritative. (NO)

Tailered's router is a pure function of `(taskKind, signals, registry)` with no persisted state
(`TA src/router.ts:12-48`), and `AGENTS.md:28` requires it stay that way. Ruflo ships a competing,
*stateful* router: a Thompson-sampling Beta-Bernoulli bandit whose priors persist to
`.swarm/model-router-state.json` and are updated from production outcomes
(`T dist/src/ruvector/model-router.js:8-16,304`; feedback at
`T dist/src/mcp-tools/agent-execute-core.js:471-486`), plus `enhanced-model-router.js`,
`neural-router.js`, `q-learning-router.js`, and `coverage-router.js`. On any retryable provider error
it substitutes a different model chosen by its own cost-optimal backend without asking the caller
(`T …/agent-execute-core.js:425-456`), bounded only by
`CLAUDE_FLOW_ROUTER_FALLBACK_MAX_RETRIES`, default **1** (`:423`).

*Consequence:* two routers with different objective functions decide the same call. Tailered's route
log would record the tier it chose while a different model answered.

### BLOCKER-4 — Q12: Model identity would no longer come from `tailered.config.json`. (NO)

`determineAgentModel` accepts an explicit model only from a five-literal allowlist and otherwise
routes silently (`T dist/src/mcp-tools/agent-tools.js:127-131`). Tailered's registry values are
arbitrary aliases (`TA src/config.ts:53-61`, `TA tailered.config.json:3-7`). `agent_execute` exposes
no `model` input at all. The regression test that exists to protect this exact property
(`TA test/ship.test.ts:142-171`) would pass while the guarantee it encodes was false, because it
asserts on what the *agent received*, not on what the provider was asked for.

*Consequence:* `AGENTS.md:29` — "a model upgrade changes registry strings, not orchestration code" —
becomes false. Model upgrades would require changing Ruflo's allowlist or its router.

### BLOCKER-5 — Q8: budget authority is exclusive only under enforced conditions; the default is not exclusive. (CONDITIONAL, NO by default)

Three independent leaks:

1. **Daemon autostart.** `T dist/src/index.js:197-198` calls `ensureDaemonRunning(process.cwd())` on
   every non-`daemon` command. It declines when no durable marker exists
   (`T dist/src/services/daemon-autostart.js:79-107`) — a freshly minted Tailered company has none —
   but the first Ruflo memory write creates `.swarm/memory.db`, which **is** a listed marker
   (`:86`). From then on, every invocation spawns a detached daemon
   (`:145-154`) running seven enabled workers that spawn headless `claude --print`
   (`T dist/src/services/worker-daemon.js:912`), for up to 12 hours (`:72`).
2. **Environment inheritance.** `TA src/agent.ts:63-67` passes no `env`, so the child inherits the
   founder's full environment. Ruflo reads `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, and
   `OLLAMA_API_KEY` directly (`T dist/src/mcp-tools/agent-execute-core.js:100-104`;
   `T dist/src/commands/providers.js:29-40`) and calls `api.anthropic.com` itself (`:111`).
3. **Post-hoc accounting.** See Q9 — no pre-execution ceiling exists to reserve against.

*Conditions under which Q8 becomes YES:* `RUFLO_DAEMON_AUTOSTART=0` **and** a project-config opt-out
(`T …/daemon-autostart.js:56-65`, because the env var does not survive non-interactive shells by
Ruflo's own reasoning at `:14-24`), **and** an explicitly scrubbed child environment carrying no
provider keys, **and** no `claude` binary on the child's PATH. All four are integrator obligations
that Tailered's current `ProcessAgent` has no mechanism to enforce.

### Non-blocking but consequential

- **Q6 (NO)** and **Q15 (NO)** are not on the designated blocking list but they are what force the
  copy-in adapter shape, and they are why BLOCKER-1 and BLOCKER-2 have no in-place mitigation.
- **Q19, Q22, Q24 are YES** — the founder gate, removability, and repository validity survive. This
  is the strongest part of the compatibility picture and it is worth stating plainly: Ruflo does not
  threaten Tailered's governance surface. It threatens Tailered's *determinism* surface.

## Invariants

The canonical 25-item invariant list lives in the master specification `gh-audit-ruflo.md`, which is
**not present in this lane's read-only evidence set**. Per the charter, the repository constitution
is the higher authority in any case ("This audit cannot override the repository constitution",
`01-audit-charter.md`), so I analyzed against the 20 operating-law clauses of `TA AGENTS.md:17-36`
plus the nine invariants named explicitly in this lane's brief. Where the brief's wording and the
constitution's differ, I used the constitution's.

| # | Constitutional clause (`TA AGENTS.md`) | Holds under Ruflo? | Why |
| ---: | --- | --- | --- |
| 1 | :17 Humans own intent; machines own implementation | YES | Untouched; the gate is Tailered's (`TA src/ship.ts:351-376`) |
| 2 | :18 Every started run appends exactly one terminal `EvalRow` | YES | `TA src/ship.ts:414-467` runs in `finally`; `TA src/ledger.ts:90-103` enforces one per `run_id` |
| 3 | :19 `GateLabel` exists only when a human gate occurred | YES | `TA src/ship.ts:358-372`; unaffected |
| 4 | :20 Reserve a hard projected ceiling before each model call | **NO** | Ruflo provides no ceiling (Q9), and daemon calls bypass reservation entirely (BLOCKER-5) |
| 5 | :21 Projected total ≥ $5.00 halts before spending | PARTIAL | Holds for wrapped calls (`TA src/budget.ts:48-54`); daemon spend is outside the accounting entirely |
| 6 | :22 Stop after three failed implementation attempts per check | YES | `TA src/ship.ts:257-262`; attempt counting is Tailered's |
| 7 | :23 Narrow failing check first, full suite before deploy | YES | `TA src/ship.ts:274-295,305-313` |
| 8 | :24 Critique output against this file before the gate | CONDITIONAL | Requires the critique prompt to carry `AGENTS.md`; Ruflo would inject its own `CLAUDE.md` instead (Q14) |
| 9 | :25 Deployment requires approve or edit; rejection halts | YES | `TA src/ship.ts:374-393` |
| 10 | :26 Gating demo requires approve and zero edits | YES | `TA src/ship.ts:503-508` |
| 11 | :27 Accepted decisions are immutable; supersession appends | YES | `TA src/company.ts:138-151` (`flag: "wx"` via `src/files.ts:49`); proven `TA test/company.test.ts:31-59` |
| 12 | :28 Keep the router stateless | **NO** | BLOCKER-3 |
| 13 | :29 Source model identity only from `tailered.config.json` | **NO** | BLOCKER-4 |
| 14 | :30 Store each executed call as an append-only trace, one context snapshot per repo state per run | PARTIAL | Traces still written (`TA src/ledger.ts:59-66`), but Ruflo's own state is mutable SQLite with `UPDATE`/`DELETE`/purge (`T dist/src/memory/memory-initializer.js:2337,2371,3326`), and a daemon tick changes the repo state mid-run (hazard d) |
| 15 | :31 Log context hash, ref, bytes, cache hit, assembly time | YES | `TA src/context.ts:32-78`; validated `TA src/validate.ts:205-225` |
| 16 | :32 Every persisted record carries `caused_by` | YES | Q17 |
| 17 | :33 Deterministic code calculates money, tokens, tests, hashes, timing, ledger aggregates | **NO** | Ruflo's cost figures are estimates from a hand-maintained table with a $1/Mtok unknown-model fallback (`T dist/src/ruvector/model-prices.js:17-18`) and an amortized per-item estimate substituted when the envelope has no cost (`T …/fable-harness.js:269-271`) |
| 18 | :34 Emit whole files or exact diffs; never placeholders | **NO** | No Ruflo contract produces whole files; `T …/agent-execute-core.js:523-524` states the single-shot path emits no diff (Q6) |
| 19 | :35 Plain precise prose; label claims VERIFIED/INFERRED/UNKNOWN | N/A to Ruflo | Prompt-level obligation |
| 20 | :36 System fonts, one accent, no gradients/glass/AI motifs | N/A to Ruflo | UI clause; Ruflo produces no Tailered UI |
| 21 | ADR-000:19 Plain repository files are the sole company state | **NO** | Q15; `.swarm/memory.db` + 14 SQLite tables |
| 22 | ADR-001:10 One terminal eval, conditional gate labels, exclusive $5 cap, stateless routing, typed supersession | PARTIAL | Terminal eval and supersession hold; cap and routing do not (rows 4, 5, 12) |
| 23 | ADR-002:20 Provider upgrades isolated behind one process boundary and the registry | **NO** | Row 13 |
| 24 | ADR-002:22 A production agent must supply hard cost and token ceilings before every invocation | **NO** | Q9 — this ADR consequence is the exact requirement Ruflo does not meet |
| 25 | ADR-003:10 Store shared context snapshots and exact call traces; preserve accounting violations before terminal halt | PARTIAL | Tailered's own machinery holds (`TA src/ship.ts:232-247`); Ruflo's internal fan-out is not captured (Q16) |

Six constitutional clauses fail outright and five hold only partially. The failures cluster in
exactly one place: **money, model identity, and determinism** — never in governance, causality, or
append-only discipline.

## The four structural hazards

### (a) `spawn` with `AbortSignal.timeout` and `child.kill("SIGTERM")` act on the direct child only

**REAL. VERIFIED as to mechanism; INFERRED as to consequence.**

Tailered has exactly two ways to stop an agent:

```ts
// TA src/agent.ts:63-67
const child = spawn(command, args, {
  shell: false,
  stdio: ["pipe", "pipe", "pipe"],
  signal: AbortSignal.timeout(timeoutMs),
});
```

```ts
// TA src/agent.ts:76-79
if (stdoutBytes > maxOutputBytes) {
  child.kill("SIGTERM");
  reject(new ValidationError("Agent stdout exceeded 5 MB."));
```

Both address the direct child's PID. `spawn` is called without `detached`, so no new process group
is created and `process.kill(-pid, …)` is not available to Tailered even if it wanted it. The same
shape appears in `TA src/ship.ts:534-539` for acceptance-test execution.

Ruflo's children are specifically engineered to escape a parent-PID signal, and Ruflo says so:

- The autostarted daemon is spawned `detached: true`, `stdio: 'ignore'`, then `unref()`'d
  (`T dist/src/services/daemon-autostart.js:145-154`). It has its own 12-hour TTL and 30-minute idle
  shutdown (`T dist/src/services/worker-daemon.js:72,76`).
- Headless workers spawn `claude --print` with `detached: process.platform !== 'win32'` **precisely
  so the whole tree can be signalled**, and the comment explains why: "`claude --print` can spawn
  grandchildren (MCP server stdio bridges, plugin tools). When the head times out a plain
  `child.kill()` only signals the head; grandchildren get reparented to init and survive"
  (`T dist/src/services/headless-worker-executor.js:1035-1041`). Ruflo's fix is
  `process.kill(-child.pid, sig)` (`:1065-1077`) — a mechanism Tailered does not have.

Three consequences:

1. **Spend continues after the run is terminal.** `TA src/ship.ts:445-466` writes the `EvalRow` with
   `cost_usd: accounting.settledUsd` and the process exits. A daemon spawned during that run keeps
   calling models for up to 12 hours. The ledger's terminal cost is then not the run's cost.
   `AGENTS.md:18` ("exactly one terminal EvalRow") remains technically true and substantively false.
2. **Repository mutation continues after the artifact hash is taken.**
   `TA src/ship.ts:344,392` hash `product/`; the gate decides on that hash
   (`TA src/ship.ts:351-357`). Nothing prevents a surviving worker from writing afterwards.
3. **`INFERRED:` the 5 MB overflow path and the timeout path can both fail to resolve.**
   `runProcess` resolves only on `"close"` (`TA src/agent.ts:90-100`), which Node emits after the
   process exits *and* its stdio streams close. A detached grandchild holding the inherited stdout
   pipe keeps that stream open, so `close` need never fire; `AbortSignal.timeout` then kills a child
   that has already exited and the promise stays pending. This is reasoned from Node stream
   semantics and the observed `detached` spawns; it was not executed and is not VERIFIED.

### (b) `ReserveSettleBudget.settle` throws but still settles — and Ruflo cannot respect a hard pre-declared ceiling anyway

**REAL, and worse than the question implies. VERIFIED.**

```ts
// TA src/budget.ts:76-83
if (actualMicros > reservation.projectedMicros) {
  this.#reservations.delete(reservationId);
  this.#settledMicros += actualMicros;
  this.#tokensByTier[reservation.tier] += actualTokens;
  throw new AccountingInvariantError(...);
}
```

The commit precedes the throw. This is deliberate and tested — `TA test/budget.test.ts:36-45`
reserves $1, settles $1.10, asserts the throw, then asserts `settledUsd === 1.1`. `TA docs/v1-contract.md:38`
states the intent: "v1 will not silently discard potentially incurred spend."

**Can Ruflo respect a hard ceiling at all? No.** Q9 establishes there is no pre-execution ceiling
API. Ruflo's strongest cap is `FableHarness`'s residual `--max-budget-usd` forwarded to the external
`claude` binary (`T …/fable-harness.js:245-255`), with accounting after the fact and an *estimate*
substituted when the envelope has no cost (`:269-271`). Every other packaged path — including
`agent_execute`, which calls `api.anthropic.com` directly (`T …/agent-execute-core.js:111`) — bounds
only `max_tokens` (`:120`), not dollars.

**The compounding defect this creates.** `reserve` denies at
`settled + reserved + projected >= cap` (`TA src/budget.ts:48-54`), so pre-call exposure is bounded
below $5.00. Settlement is bounded only by `validateAgentResponse` accepting any finite non-negative
number (`TA src/agent.ts:146-150`). A single over-ceiling settlement can therefore push
`settledMicros` to or past $5.00. `TA src/ship.ts:444-466` then writes that figure into the terminal
`EvalRow` unconditionally, and `TA src/validate.ts:164-166` rejects any eval with
`cost_usd >= BOUNDS.maxCostPerRunUsd`. Because evals are append-only (`TA src/ledger.ts:90-103`) and
ADRs are immutable (`TA src/company.ts:138-151`), `INFERRED:` the company repository becomes
permanently invalid with no in-format repair. An agent that misreports its cost — accidentally or
adversarially — can brick a company. That is a Tailered-side defect, exposed rather than caused by
Ruflo, and it is filed below as RUF-L6a-07.

### (c) The 512,000-byte, six-exclusion context snapshot versus what Ruflo expects as input

**INCOMPATIBLE AS A DIRECT FEED; ADAPTABLE. VERIFIED.**

```ts
// TA src/context.ts:47-49
const captured = await captureRepositorySnapshot(this.root, {
  excludeTopLevel: ["evals", "labels", ".tailered"],
});
```
plus `HASH_EXCLUSIONS = new Set([".git", "node_modules", "dist"])` (`TA src/files.ts:14`) and
`maxBytes = options.maxBytes ?? 512_000` (`TA src/files.ts:141`).

Four mismatches:

1. **Form.** The snapshot is a single JSON string `{repoHash, files:[{path,content}], caused_by}`
   (`TA src/files.ts:170-173`, `TA src/context.ts:85-93`) delivered as a request field. Ruflo has no
   input for it; it walks the filesystem itself (`T dist/src/services/headless-worker-executor.js:839-909`)
   at 219 `process.cwd()` sites. An adapter must write the snapshot back out to a scratch tree —
   which reintroduces hazard (d) in the scratch tree instead of the repo.
2. **Size.** 512,000 bytes is the *whole-repository* budget. Ruflo's own cost note describes loading
   "~56k cache tokens of project context" from a project dir (`T …/fable-harness.js:11-13`), i.e. it
   is built for far more context than Tailered will ever hand it. The snapshot will read as a
   truncated repository.
3. **Silent truncation.** `TA src/files.ts:156-161` uses `continue` — a file over the cap, or one
   that would overflow the running total, is dropped from `files[]` while still being hashed
   (`:151-154`). The recipient cannot distinguish "file absent from the repo" from "file omitted for
   size", and iteration order is alphabetical (`TA src/files.ts:187`), so which files survive depends
   on filename, not importance.
4. **Binary content.** `TA src/files.ts:165` does `content.toString("utf8")` on every included file.
   `.swarm/memory.db` is a SQLite binary and is **not** in the exclusion set, so if it is under the
   cap it enters the snapshot as replacement-character mojibake and consumes the budget that product
   source should have had.

### (d) Would Ruflo-written state break `validateCompany` or the repo format?

**`validateCompany`: NO. The repo format's meaning: YES. VERIFIED for the mechanism, INFERRED for the race.**

`validateCompany` checks presence of 12 required paths, config parse, ledger uniqueness, causal
edges, and route/trace/snapshot cross-consistency (`TA src/validate.ts:49-158`). It never rejects
extra files. So `.claude-flow/`, `.swarm/`, `.claude/`, `.mcp.json`, and a Ruflo-written `CLAUDE.md`
all pass. Tailered's constitution is `AGENTS.md`, and Ruflo writes `CLAUDE.md`
(`T dist/src/init/executor.js:2027`), so there is no filename collision either.

Four real problems that `validateCompany` cannot see:

1. **Ordering.** `mintCompany` requires an empty target (`TA src/company.ts:352-360`). A directory
   that has already seen `ruflo init` can never be minted as a Tailered company. Mint must come
   first, always.
2. **Hash instability.** `.claude-flow/` and `.swarm/` are outside the six exclusions, so every
   daemon tick — 7 workers on 10-to-1440-minute intervals — changes `repoHash`
   (`TA src/files.ts:151-154,169`). Within one run this defeats the context cache
   (`TA src/context.ts:32-45`) and writes additional snapshot files; across runs it means two
   otherwise-identical runs never share a context hash. `AGENTS.md:30` ("store each distinct context
   snapshot once per run") still holds mechanically while the economic property it exists to create
   is gone.
3. **`INFERRED:` a list-then-read race.** `listFiles` enumerates (`TA src/files.ts:186-200`) and then
   `captureRepositorySnapshot` reads each path (`:150`). A concurrent daemon deleting a temp file in
   that window makes `readFile` throw `ENOENT`, which is not caught (`:203-210` catches ENOENT only
   for the directory walk). The run would halt with a non-Tailered error, recorded as
   `halted_attempts` (`TA src/ship.ts:407-409`) with a misleading blocker.
4. **Format meaning.** ADR-000's accepted consequence is "Plain repository files are the public
   contract and the sole company state" (`TA decisions/ADR-000.md:19`). A `.swarm/memory.db` holding
   14 mutable SQLite tables is a second company state. The validator does not detect it; the
   constitution forbids it.

One additional path *would* break validation outright and should be treated as a hard operating rule
rather than a risk: any Ruflo write landing under `evals/`, `labels/`, or `decisions/` would trip
`readJsonLines` (`TA src/files.ts:82-88`), `parseAdr` (`TA src/company.ts:256-261`), or the ledger
uniqueness checks. Nothing in the packaged Ruflo code targets those directory names, but the daemon's
`backup`, `consolidate`, and `optimize` workers run a general-purpose `claude --print` against the
tree, so the constraint is behavioural, not structural. `UNKNOWN` — establishing it requires
execution.

## Findings

| ID | Severity | Finding | Evidence |
| --- | --- | --- | --- |
| RUF-L6a-01 | CRITICAL | `agent_spawn` silently discards any model identity outside a five-literal allowlist and substitutes its own router's choice, so `tailered.config.json` cannot bind Ruflo's model selection; `agent_execute` accepts no model at all | `T dist/src/mcp-tools/agent-tools.js:127-131,369-379`; `TA src/config.ts:53-61`; `TA AGENTS.md:29` |
| RUF-L6a-02 | CRITICAL | No Ruflo surface returns a hard pre-execution `{maxCostUsd, maxTokens}`; budget discipline is post-hoc, estimate-backed, and delegates enforcement to an external binary. Reserve/settle degenerates to the integrator's static guess | `T dist/src/services/fable-harness.js:56-65,245-255,269-271`; `TA src/agent.ts:27-33`; `TA decisions/ADR-002.md:22` |
| RUF-L6a-03 | CRITICAL | Ruflo's detached grandchildren (12 h daemon; `claude --print` process groups) escape both of Tailered's kill mechanisms, so spend and repository mutation can continue after the terminal `EvalRow` is written | `T dist/src/services/daemon-autostart.js:145-154`; `T dist/src/services/headless-worker-executor.js:1035-1041,1054`; `T dist/src/services/worker-daemon.js:72`; `TA src/agent.ts:63-67,76-79` |
| RUF-L6a-04 | HIGH | Every packaged single-call path writes into cwd (32 distinct repo-local state paths), so a read-only mount against the company repository is impossible and the repo stops being sole company state | `T dist/src/mcp-tools/agent-execute-core.js:31-34,405`; `T dist/src/services/policy-runtime.js:7-15`; `TA decisions/ADR-000.md:19` |
| RUF-L6a-05 | HIGH | `ruflo` with no arguments and piped stdin enters MCP stdio **server** mode, which does not exit; Tailered's `ProcessAgent` always pipes stdin and waits for `close`, so the naive wiring hangs to timeout | `R bin/ruflo.js:55-58`; `TA src/agent.ts:63-67,90-101` |
| RUF-L6a-06 | HIGH | Tailered-side, pre-existing: `ProcessAgent.invoke` passes neither `cwd` nor `env`, so the agent child inherits the founder's full environment (provider API keys) and the invoking working directory. Budget exclusivity and repo containment rest on an unenforced operator convention | `TA src/agent.ts:63-67`; `T dist/src/mcp-tools/agent-execute-core.js:100-104,111` |
| RUF-L6a-07 | HIGH | Tailered-side, pre-existing: `settle` commits an over-ceiling settlement before throwing; a settled total ≥ $5.00 is written into the terminal `EvalRow` and then permanently fails `validateCompany`, with no in-format repair because evals and ADRs are append-only | `TA src/budget.ts:76-83`; `TA src/ship.ts:444-466`; `TA src/validate.ts:164-166`; `TA test/budget.test.ts:36-45` |
| RUF-L6a-08 | MEDIUM | Ruflo's own measured cost for `claude -p` launched from a project directory is $1.56/call; the gating demo makes ≥4 agent calls, giving $6.24 against a $5.00 exclusive cap unless every call runs from a clean cwd | `T dist/src/services/fable-harness.js:11-16,41-44`; `TA test/ship.test.ts:49`; `TA src/contracts.ts:19` |
| RUF-L6a-09 | MEDIUM | `.claude-flow/` and `.swarm/` are outside the snapshot's six exclusions, so daemon activity changes `repoHash` mid-run, defeats the context cache, and (INFERRED) can race the snapshot's list-then-read window into an unhandled `ENOENT` | `TA src/files.ts:14,141,150-161,186-200`; `TA src/context.ts:32-49`; `T dist/src/services/worker-daemon.js:30-40` |
| RUF-L6a-10 | MEDIUM | `ruflo init` mutates state outside the company repository — appending to the host root `.gitignore` and to `~/.claude/CLAUDE.md` — and the policy runtime's out-of-repo trust anchor makes a partial in-repo deletion fail closed | `T dist/src/init/executor.js:1382,1455-1478,2036-2057`; `T dist/src/services/policy-runtime.js:51-56,71-88` |
| RUF-L6a-11 | MEDIUM | `ruflo`'s 33 `overrides` (its transitive security pins) are inert when `ruflo` is installed as a dependency; a consumer that pins `ruflo` and assumes those pins apply gets none of them | `R package.json:46-78`; INFERRED from documented npm `overrides` semantics |
| RUF-L6a-12 | LOW | Ruflo returns provider failures as *successful* tool results carrying `{success:false, error}`; an adapter reading only the transport layer would record a failed model call as `status: "completed"` | `T dist/src/mcp-tools/agent-execute-core.js:100-104,142,165`; `TA src/ship.ts:202-247`; `TA src/contracts.ts:177-180` |

## What this lane could not determine

- **Anything above PACKAGED.** No install, no execution. Whether any Ruflo capability works, whether
  the daemon actually fires against a Tailered repo, whether the `ruflo`-as-ProcessAgent hang in
  RUF-L6a-05 actually occurs, and whether the list-then-read race in hazard (d) is reachable are all
  REACHABLE/EFFECTIVE questions for the execution lanes.
- **`getProjectCwd()` semantics.** Every repo-local write funnels through it
  (`T dist/src/mcp-tools/agent-execute-core.js:12`), but it is defined in
  `@claude-flow/cli-core@3.7.0-alpha.5`, which is a plain dependency and **not** bundled in the
  tarball (`T node_modules/@claude-flow/` holds only `codex`, `plugin-agent-federation`, `security`).
  Whether an environment variable can redirect Ruflo's project root — which would materially soften
  BLOCKER-1 — is therefore `UNKNOWN` in this lane.
- **Q20, wall-clock feasibility.** Ruflo's own comment claims a 60+ second cold start; I did not
  measure it, so the ten-minute demo bound is `UNKNOWN`, not "at risk" and not "fine".
- **The canonical 25 invariants.** `gh-audit-ruflo.md` is not in this lane's evidence set; the
  invariants section is built on `TA AGENTS.md:17-36` and the four accepted ADRs instead. The
  coordinator should re-map my rows against the master list.
- **Whether the daemon's general-purpose workers ever write under `evals/`, `labels/`, or
  `decisions/`.** Nothing in the packaged code targets those names, but the workers run an
  unconstrained `claude --print` against the tree, so the absence is behavioural and unproven.
- **Ruflo's non-packaged surfaces.** 37 of 38 plugins, `v3/plugins/`, the Rust crates, and the
  `verification/` evidence set are not in the installed artifact and were not assessed for
  compatibility.
