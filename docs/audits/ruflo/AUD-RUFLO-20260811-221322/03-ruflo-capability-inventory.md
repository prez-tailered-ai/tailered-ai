<!-- audit: {"audit_id":"AUD-RUFLO-20260811-221322","tailered_sha":"6172653e0aca0981d0abaf4ad8e9d587667737e9","ruflo_release":"v3.37.0","ruflo_sha":"6ce18b5a7fcd4939a2f72c2e3b8fdbdec660e5a9","generated":"2026-08-11T22:30:00Z","evidence_class":"VERIFIED","lane":"AUD-L1a","caused_by":["AUD-RUFLO-20260811-221322/01-audit-charter.md"]} -->

# 03 — Ruflo capability inventory (v3.37.0)

## Scope and evidence ceiling

This lane counted what Ruflo v3.37.0 **is**, from two independent sources: the git clone at
`/tmp/aud-ruflo-20260811/upstream/ruflo-v3.37.0` and the two extracted npm tarballs at
`/tmp/aud-ruflo-20260811/work/extract/{ruflo,cli}/package`. Nothing was installed and nothing was
executed.

The highest evidence level reachable here is **PACKAGED** — the artifact is present in a published
tarball. This document never claims REACHABLE, EFFECTIVE, DURABLE, or GOVERNABLE; establishing
those requires execution, which a different lane performs. Where a capability's behaviour depends
on runtime conditions (an optional dependency being installed, an external binary being on PATH, a
file actually being read), that dependency is stated and the behavioural question is left open.

Machine-readable companion: `evidence/package-inventory.json`.

## 1. What actually gets installed

`ruflo@3.37.0` is a 526-file tarball whose only dependency is `@claude-flow/cli` at the mutable
caret range `^3.33.0` (`work/extract/ruflo/package/package.json`). Its executable is 77 lines
(`work/extract/ruflo/package/bin/ruflo.js`) and does one thing: walk up the `node_modules` tree to
find `@claude-flow/cli`, then import either its `bin/cli.js` (MCP stdio mode) or its
`dist/src/index.js` (CLI mode, constructing `new CLI({name: 'ruflo'})`), lines 30-66.

**VERIFIED:** 499 of the wrapper's 526 files (95%) are `src/ruvocal/`, a vendored fork of
HuggingFace `chat-ui` version 0.20.0 — the `package.json` at
`work/extract/ruflo/package/src/ruvocal/package.json` literally reads `"name": "chat-ui",
"version": "0.20.0"` with 43 runtime and 49 dev dependencies of its own. It ships with its own
`Dockerfile`, `docker-compose.yml`, a Helm chart (13 templates), 10 GitHub Actions workflow files,
its own `LICENSE`, `PRIVACY.md`, and a 4.5 MB-class WASM asset
(`src/ruvocal/static/wasm/rvagent_wasm_bg.wasm`).

**VERIFIED:** `bin/ruflo.js` contains no reference to `ruvocal`, `mcp-bridge`, `chat-ui`, or
`nginx` (grep returns nothing). The remaining wrapper payload is an Express server
(`src/mcp-bridge/index.js`, `PORT` default 3001, `MCP_BIND_HOST` default `127.0.0.1`), an nginx
Dockerfile with static assets, and 4 shell/JS scripts. None of it is on the `ruflo` execution path.

**INFERRED:** installing `ruflo` therefore delivers a complete, separately-licensed web
application and container/Kubernetes deployment surface that the advertised CLI never uses. Whether
any of it can be triggered is a REACHABLE question outside this lane.

`@claude-flow/cli@3.37.0` is the 1507-file implementation. Its `package.json` declares
`"postinstall": "node ./scripts/postinstall.cjs"` and — unlike the root `claude-flow` package,
which declares `engines.node >= 20.0.0` — declares **no `engines` field at all**.

Its file layout, by count:

| Subtree | Files | Contents |
| --- | ---: | --- |
| `dist/` | 730 | compiled JS + `.d.ts` across 24 subsystems |
| `node_modules/` | 372 | 3 bundled dependencies (see §2) |
| `.claude/` | 348 | 89 agents, 167 slash commands, 34 skill dirs, 42 helpers, settings template |
| `plugins/` | 50 | exactly one plugin: `ruflo-metaharness` |
| `bin/` | 3 | `cli.js`, `mcp-server.js`, `preinstall.cjs` (a no-op comment) |
| `scripts/` | 1 | `postinstall.cjs` |

## 2. Packages, workspaces, and dependency shape

The GitHub repository is internally still the `claude-flow` monorepo. It contains **50**
`package.json` files outside `node_modules`, resolving to 49 distinct package identities (the name
`mcp-bridge` appears twice).

- Root `package.json` (`upstream/ruflo-v3.37.0/package.json`) declares **3** workspaces —
  `v3/@claude-flow/{codex,plugin-agent-federation,security}` — while `v3/@claude-flow/` contains
  **22** directories that each have their own `package.json`. `v3/package.json` separately declares
  a glob workspace `@claude-flow/*`. There are therefore two overlapping workspace definitions and
  the root one covers 3 of 22 sibling packages.
- Root declares 19 dependencies, 9 optionalDependencies, and **42 `overrides`** — a large,
  hand-maintained transitive-version pin surface.
- `@claude-flow/cli` declares 25 dependencies, 11 optionalDependencies, 2 optional
  peerDependencies (`metaharness@^0.4.1`, `@metaharness/router@^0.4.0`), and 3 bundleDependencies.
- **VERIFIED:** the three bundleDependencies are physically inside the tarball at
  `node_modules/@claude-flow/`: `codex@3.0.3` (120 files, bin `claude-flow-codex`),
  `plugin-agent-federation@1.0.0-alpha.18` (130 files, bin `ruflo-federation`), and
  `security@3.0.0-alpha.14` (122 files). None of the three declares any dependency of its own.
- **VERIFIED:** 19 further `@claude-flow/*` packages exist only in the clone
  (`aidefence`, `browser`, `claims`, `cli-core`, `deployment`, `embeddings`, `guidance`, `hooks`,
  `integration`, `mcp`, `memory`, `neural`, `performance`, `plugin-iot-cognitum`, `plugins`,
  `providers`, `shared`, `swarm`, `testing`) and are pulled from npm at install time rather than
  shipped.

**Version-pin observation (VERIFIED, not re-litigated here):** `ruflo`'s single dependency is the
caret range `^3.33.0`, so a fixed `ruflo@3.37.0` install resolves a moving `@claude-flow/cli`. In
addition, `@claude-flow/cli@3.37.0` depends on `@claude-flow/shared@3.0.0-alpha.7` and
`@claude-flow/mcp@3.0.0-alpha.8` while the root `claude-flow@3.37.0` pins
`@claude-flow/shared@3.0.0-alpha.8` and `@claude-flow/mcp@3.0.0-alpha.9` — the two published
packages of the same version disagree on their shared-library pins.

## 3. Reconciling the advertised counts

This is the central finding of the lane. Ruflo publishes at least four mutually inconsistent counts
for agents and four for MCP tools, in files that ship together in the same tarball.

### 3.1 Agents

| Figure | Source |
| --- | --- |
| "60+ specialized agents" | `upstream/ruflo-v3.37.0/package.json:9` (`description`) and the published `ruflo` tarball's own `package.json:4` |
| "100+ specialized agents" | `README.md:26` |
| "98 agents" | `README.md:57` |
| "164" | `catalog-manifest.json`, shipped inside the `@claude-flow/cli` tarball |

**Counted independently (VERIFIED):**

| Location | `*.md` files with frontmatter `name:` | Unique names |
| --- | ---: | ---: |
| repo root `.claude/agents/**` | 108 | 97 |
| `v3/@claude-flow/cli/.claude/agents/**` = the tarball's `.claude/agents/**` | **89** | 81 |
| `plugins/*/agents/**` (38 plugins) | 56 | 56 |
| union of all three | 253 files | **156** |

All 89 packaged files carry valid YAML frontmatter with a `name` key (checked individually). The
root set contains one non-agent, `.claude/agents/MIGRATION_SUMMARY.md`, whose frontmatter `name` is
`Migration Summary`.

**The manifest figure is reproducible and wrong for its own artifact.** `catalog-manifest.json` is
produced by `v3/@claude-flow/cli/scripts/generate-catalog-manifest.mjs:84`, which runs
`git ls-files '.claude/agents/*.md' 'plugins/*/agents/*.md'` **from the repository root**. Running
that exact command against the clone returns 164 (108 + 56) — an exact reproduction. But the
manifest is then written into and published inside the `@claude-flow/cli` tarball, which contains a
*different* agent set: 89 files from the CLI package's own `.claude/agents`, plus 1 more inside the
single packaged plugin. The manifest describes a catalog its own container does not hold.

**Verified answer: 90 agent definition files ship in the package that `npm i ruflo` installs (89 +
1), covering 81 unique names.** Not 60+, not 98, not 100+, not 164.

The two agent sets are not nested, either: 9 named agents exist only in the CLI package
(`aidefence-guardian`, `claims-authorizer`, `ddd-domain-expert`, `injection-analyst`,
`performance-engineer`, `pii-detector`, `reasoningbank-learner`, `security-architect`,
`security-architect-aidefence`) and 25 exist only in the repo root (including `coder`,
`researcher`, `reviewer`, `tester`, `security-auditor`, `queen-coordinator`).

### 3.2 MCP tools

| Figure | Source |
| --- | --- |
| "~210 tools" / "~210 MCP tools" | `README.md:228`, `README.md:256` |
| "314 MCP tools" | `README.md:38` |
| "314+ MCP tools" | `SKILL.md:3` |
| "397" | `catalog-manifest.json` |

**Counted independently (VERIFIED)**, by walking back from every `inputSchema:` line to the
`name: '...'` line at the same indentation in the packaged `dist/`:

| Measure | Count |
| --- | ---: |
| tool definitions present in `dist/src/mcp-tools/**` + `dist/src/ruvector/coverage-tools.js` | **361** |
| tools actually registered by `registerTools()` (`dist/src/mcp-client.js:118-175`) | **356** |
| … of which registered unconditionally | **333** |
| … of which registered only when the `agent-browser` binary is on PATH | **23** |
| packaged but never registered | **5** |

The 5 unregistered: `policy_rule_upsert`, `policy_budget_set`, `policy_approve`, `policy_revoke`
(deliberately filtered at `dist/src/mcp-client.js:135` — "Remote MCP exposes evaluation/status
only"), and `testgen_tdd_repair` (exported from `dist/src/mcp-tools/index.js:31` but absent from the
registry).

The 23 conditional tools are the `browser_*` family: `dist/src/mcp-client.js:75-88` shells out to
`execFileSync('agent-browser', ['--version'], {timeout: 3000})` and registers `browserTools` only on
success. `agent-browser` is not a declared dependency of either package.

**The 397 figure is reproducible and methodologically wrong.**
`generate-catalog-manifest.mjs:41-50` counts every string matching
`/name:\s*'([a-z_][a-z0-9_-]*)'/g` in `src/mcp-tools/*.ts`. Running that exact regex reproduces
397. Diffing that set against the real tool-definition set shows it sweeps in **39 non-tools** —
JSON-schema property values and hook event-name literals such as `agents`, `config`, `database`,
`disk`, `memory`, `metrics`, `network`, `topology`, `pre-task`, `post-edit`, `session-start`,
`intelligence_learn`, `swarm_exists` — and simultaneously **misses 3 real tools**
(`hooks_coverage-route`, `hooks_coverage-suggest`, `hooks_coverage-gaps`) because they are defined
in `src/ruvector/coverage-tools.ts`, outside the directory the script scans.

**Verified answer: 356 MCP tools are registered, 333 of them unconditionally.**

### 3.3 CLI commands

| Figure | Source |
| --- | --- |
| "26 CLI commands" | `README.md:38` |
| "60+ commands" | `README.md:57` |

**VERIFIED: 53 top-level CLI commands**, being the keys of `commandLoaders` in the packaged
`dist/src/commands/index.js:15-97`. All 53 target modules exist in the tarball. Ten are imported
synchronously and pre-cached (`init`, `start`, `status`, `task`, `session`, `agent`, `swarm`,
`memory`, `mcp`, `hooks`); 43 are lazy.

Beneath them, **387** subcommand entries are declared across all packaged files under
`dist/src/commands/` (377 raw array elements, with the two spread placeholders
`...wasmSubcommands` and `...proxyLifecycleSubcommands` resolved to their 4 and 8 members). 382 of
those are declared inside the 53 loader modules themselves; the remaining 5 live in
`memory-distill.js` (3) and `ruvector/backup.js` (2). The densest are `hooks` (42), `neural` (31),
`memory` (17), `metaharness`-adjacent `embeddings` (15), `proxy` (13, of which 8 come from
`proxy-lifecycle.js`).

Neither 26 nor "60+" matches. The nearest thing to "60+ commands" is the **167** Claude Code
slash-command `.md` files packaged under `.claude/commands/` — itself 2.8× the advertised figure.

### 3.4 Plugins

| Figure | Source |
| --- | --- |
| "35 plugins" | `README.md:79` |
| "30+ plugins" | `SKILL.md:3` |

**VERIFIED:**

- **38** plugin directories exist under `plugins/`, each with a `.claude-plugin/plugin.json`.
- `.claude-plugin/marketplace.json` lists **35** of them. Three are in the tree but absent from the
  manifest: `ruflo-agntcy`, `ruflo-bbs-federation`, `ruflo-business-pods`.
- Those 38 plugins collectively contain **136** skills (136 `SKILL.md` files), **49** slash
  commands, and **56** agent definitions. Two plugins contain none of the three (`ruflo-bbs-federation`, `ruflo-graph-intelligence`); `ruflo-arena` has one command and nothing else.
- A **second, separate** plugin system exists at `v3/plugins/` — 15 npm packages
  (`@claude-flow/plugin-agentic-qe`, `-code-intelligence`, `-cognitive-kernel`, `-financial-risk`,
  `-gastown-bridge`, `-healthcare-clinical`, `-hyperbolic-reasoning`, `-legal-contracts`,
  `-neural-coordination`, `-perf-optimizer`, `-prime-radiant`, `-quantum-optimizer`,
  `ruvector-upstream`, `teammate-plugin`, `-test-intelligence`).
- **Exactly ONE plugin ships in the published `@claude-flow/cli` tarball: `ruflo-metaharness`**
  (50 files, 13 skills, 33 scripts, 1 agent, 1 command). The other 37 are not in the artifact that
  `npm i ruflo` installs.

### 3.5 Skills

| Figure | Source |
| --- | --- |
| "30 skills" | `README.md:57` |
| "34" | `catalog-manifest.json` |

**VERIFIED: 34** skill directories are packaged (`.claude/skills/`), of which **33** contain a
`SKILL.md`. The exception, `.claude/skills/dual-mode/`, ships `README.md`, `dual-collect.md`,
`dual-coordinate.md`, and `dual-spawn.md` but no `SKILL.md`, so it is not a loadable skill by the
convention the other 33 follow. The repo root separately holds 39 skill directories that are not in
this tarball, and the plugin tree holds 136 more.

## 4. Capability → implementation → packaged → invocation

`T =` `/tmp/aud-ruflo-20260811/work/extract/cli/package/` (the `@claude-flow/cli` tarball).
`R =` `/tmp/aud-ruflo-20260811/work/extract/ruflo/package/` (the `ruflo` tarball).
`C =` `/tmp/aud-ruflo-20260811/upstream/ruflo-v3.37.0/` (the git clone).

| Capability | Authoritative implementation (file:line) | In tarball? | Invocation surface | Declared deps |
| --- | --- | :---: | --- | --- |
| CLI (53 commands, 387 subcommand entries) | `T dist/src/commands/index.js:15-97`; entry `T dist/src/index.js:54-59` | yes | `ruflo <cmd>`; bins `ruflo`, `claude-flow`, `cli` | commander, chalk, inquirer, fs-extra |
| MCP tool registry (356 registered) | `T dist/src/mcp-client.js:110-175` | yes | in-process + stdio JSON-RPC | zod, @claude-flow/cli-core |
| MCP server (stdio; `tools/list` filtering) | `T dist/src/mcp-server.js:35-43, 477-478` | yes | `ruflo mcp start`; bin `claude-flow-mcp`; wrapper non-TTY path `R bin/ruflo.js:56-62` | ws (declared) |
| Agent definitions (89 + 1) | `T .claude/agents/**` | yes | copied into the user project by `ruflo init` (`T dist/src/init/executor.js:1114`) | — |
| Skills (34 dirs / 33 loadable) | `T .claude/skills/**` | yes | `ruflo init` copy (`T dist/src/init/executor.js:984`) | — |
| Slash commands (167) | `T .claude/commands/**` | yes | `ruflo init` copy (`T dist/src/init/executor.js:1034`) | — |
| Plugins (1 of 38) | `T plugins/ruflo-metaharness/` | 1 of 38 | `/ruflo-metaharness`; `ruflo metaharness` | metaharness (optional peer) |
| Plugin marketplace (35 entries) | `C .claude-plugin/marketplace.json` | **no** | `claude plugin marketplace` against the GitHub repo | — |
| Hooks (7 Claude Code events + statusline) | `T .claude/settings.json` (template); generator `T dist/src/init/settings-generator.js:17` | yes | written into the user's `.claude/settings.json` by `ruflo init` | node |
| Hook handler | `T .claude/helpers/hook-handler.cjs:268` (595 lines, dispatches on `argv[2]`) | yes | invoked by Claude Code hooks | node |
| Hook MCP tools (41 `hooks_*`) | `T dist/src/mcp-tools/hooks-tools.js` | yes | MCP + `ruflo hooks` (42 subcommand entries) | — |
| Background daemon (9 worker types) | `T dist/src/services/worker-daemon.js:30-40` | yes | `ruflo daemon` (11 subcommand entries); autostart at `T dist/src/index.js:197` | — |
| Memory / vector store | `T dist/src/memory/memory-initializer.js:228-535` | yes | 15 `memory_*` MCP tools; `ruflo memory` (17) | better-sqlite3 (optional), sql.js, agentdb (optional) |
| AgentDB controllers (20 tools) | `T dist/src/mcp-tools/agentdb-tools.js:1451` | yes | MCP | `agentdb` (optional) |
| RuVector routing / learning (28 modules) | `T dist/src/ruvector/` | yes | `ruflo route` (8), `ruflo ruvector` (8) | ruvector, @ruvector/* (optional) |
| Browser automation (23 + 5 + 1 tools) | `T dist/src/mcp-tools/browser-tools.js`, `browser-session-tools.js`, `browser-intent-tools.js` | yes | MCP | **external `agent-browser` binary**, gated at `T dist/src/mcp-client.js:75-88` |
| WASM agents (27 tools) | `T dist/src/mcp-tools/wasm-agent-tools.js` | yes (code) | MCP | rvagent / ruvector — **no `.wasm` binary ships** |
| MetaHarness (16 tools) | `T dist/src/mcp-tools/metaharness-tools.js`; `T plugins/ruflo-metaharness/scripts/` | yes | `ruflo metaharness`; MCP; 13 skills | optional peers `metaharness`, `@metaharness/router`; optionalDeps `@metaharness/{darwin,flywheel,radio,turn-credit}` |
| Witness verification | `T dist/src/commands/verify.js:21,124,139` | yes | `ruflo verify` | @noble/ed25519; fetches `raw.githubusercontent.com/ruvnet/ruflo/{branch}/verification.md.json` |
| Verification evidence set | `C verification/` (10 files incl. per-OS manifests) | **no** | — | — |
| Security / AI-defence (6 tools) | `T dist/src/security/`, `T dist/src/mcp-tools/security-tools.js` | yes | `ruflo security` (9); MCP `aidefence_*` | bundled `@claude-flow/security@3.0.0-alpha.14` |
| Policy runtime | `T dist/src/services/policy-runtime.js` | yes | `ruflo policy`; 2 of 6 `policy_*` tools exposed | — |
| Providers (8 rows) | `T dist/src/commands/providers.js:10-19` | yes | `ruflo providers list/configure/test/models/usage` | env API keys |
| Meta LLM proxy (cognitum) | `T dist/src/proxy/{install,lifecycle,release,token-bridge,verify}.js`; `T dist/src/commands/proxy.js` | yes | `ruflo proxy sponsor-enable --yes` | distribution from cognitum.one; "source remains private" (`T dist/src/proxy/release.js:6`) |
| Cognitum funnel (24 modules: enrollment, attribution, payout, consent, telemetry transports) | `T dist/src/funnel/` | yes | `ruflo funnel`, `ruflo settings`, `ruflo auth` | `https://funnel.ruv.io/enroll` (`T dist/src/commands/funnel.js:189`) |
| GitHub integration (5 tools) | `T dist/src/mcp-tools/github-tools.js`; `T .claude/commands/github/` (19) | yes | MCP + slash commands | `gh` CLI (8 shell-outs) |
| Workflows (12 tools) | `T dist/src/mcp-tools/workflow-tools.js`; `T dist/src/commands/workflow.js` | yes | MCP + `ruflo workflow` (9) | — |
| Transfer / IPFS export | `T dist/src/transfer/` (21 modules), `ipfs/upload.js:44,105` | yes | 11 `transfer_*` MCP tools; `ruflo transfer-store` (5) | Pinata, web3.storage, GCS |
| RVFA appliance | `T dist/src/appliance/` (7 modules incl. `rvfa-signing.js`) | yes | `ruflo appliance` (8), `appliance-advanced` | Pinata; GGUF engine |
| GAIA benchmark harness | `T dist/src/benchmarks/` (26 modules) | yes | `ruflo gaia-bench`, `ruflo benchmark` (4) | Anthropic, Gemini, HuggingFace datasets, DuckDuckGo HTML |
| Statusline UI | `T .claude/helpers/statusline.cjs`; `T dist/src/init/statusline-generator.js` | yes | Claude Code statusLine | — |
| goal_ui (React/Vite/Supabase web app) | `C v3/goal_ui/` (`@ruflo/research@0.1.0`) | **no** | — | supabase, netlify |
| ruvocal (HF chat-ui 0.20.0 fork) + nginx + Express mcp-bridge | `R src/ruvocal/` (499 files), `R src/nginx/`, `R src/mcp-bridge/index.js` | yes, in the **`ruflo`** tarball only | not referenced by `R bin/ruflo.js` | express; own 43+49 dep tree |
| Rust federation peer / AGNTCY | `C v3/crates/ruflo-federation-peer/`, `C v3/crates/ruflo-agntcy/` | **no** | `ruflo transport` command exists in dist | — |
| Install-time patching | `T scripts/postinstall.cjs` (153 lines) | yes | npm `postinstall` | — |

## 5. Rust crates and WASM

**VERIFIED: 6 Rust crates** (Cargo manifests containing a `[package]` section) and 3
workspace-only manifests.

| Crate | Path | In root workspace | Target |
| --- | --- | :---: | --- |
| `ruflo-federation-peer` | `C v3/crates/ruflo-federation-peer/` | yes | native |
| `ruflo-agntcy` | `C v3/crates/ruflo-agntcy/` | yes | native |
| `guidance-kernel` | `C v3/@claude-flow/guidance/wasm-kernel/` | no | wasm32 |
| `gastown-formula-wasm` | `C v3/plugins/gastown-bridge/wasm/gastown-formula-wasm/` | no (excluded) | wasm32 |
| `ruvector-gnn-wasm` | `C v3/plugins/gastown-bridge/wasm/ruvector-gnn-wasm/` | no (excluded) | wasm32 |
| `gastown-shared` | `C v3/plugins/gastown-bridge/wasm/shared/` | no (excluded) | native |

**VERIFIED: zero `.wasm` binaries ship in the `@claude-flow/cli` tarball.** The clone contains two
(`v3/@claude-flow/guidance/wasm-pkg/guidance_kernel_bg.wasm` and
`ruflo/src/ruvocal/static/wasm/rvagent_wasm_bg.wasm`), and only the second is published — inside
the `ruflo` wrapper tarball, as a static asset of the chat-ui fork. Meanwhile 27 `wasm_agent_*`
MCP tools, 10 `ruvllm` WASM tools, `dist/src/ruvector/ruvllm-wasm.js`,
`dist/src/ruvector/wasm-embedder.js`, and 4 `agent wasm-*` CLI subcommands are packaged, and
`@ruvector/rabitq-wasm@0.1.0` is a **non-optional** dependency of both packages. The WASM runtime
is therefore entirely dependent on npm-resolved packages at install time.

## 6. Daemons, databases, listeners, and external services

**Daemon.** `dist/src/services/worker-daemon.js:30-40` declares **9 worker types**; 7 are
`enabled: true` by default (`map` 15 min, `audit` 10 min, `optimize` 15 min, `consolidate` 30 min,
`testgaps` 20 min, `backup` 24 h, `harness` 6 h) and 2 are disabled (`predict`, `document`). The
packaged `.claude/settings.json` sets `claudeFlow.daemon.autoStart: true` and lists a worker
`ultralearn` that is **not** in `DEFAULT_WORKERS` but **is** handled in the dispatch switch at
`worker-daemon.js:1329`. `dist/src/index.js:197` calls `ensureDaemonRunning(process.cwd())` on the
CLI run path. 49 further service modules back this (`worker-queue`, `bounded-worker-pool`,
`container-worker-pool`, `headless-worker-executor`, `repo-supervisor`, `workspace-lease`,
`harness-flywheel-runtime`, …).

**Databases.** 14 distinct SQLite tables are created by packaged code — `memory_entries`,
`patterns`, `pattern_history`, `trajectories`, `trajectory_steps`, `migration_state`, `sessions`,
`vector_indexes`, `graph_edges`, `metadata` (`dist/src/memory/memory-initializer.js:228-535`),
`episode_embeddings`, `distill_state` (`dist/src/services/memory-distillation.js:138-146`),
`bbs_budget_rooms`, `bbs_budget_reservations`
(`dist/src/business-pods/bbs-budget-tracker.js:51-58`). Default file locations include
`.swarm/memory.db`, `.claude-flow/memory.db`, `data/memory/memory.db`, `.cache/embeddings.db`, and
`.rvf` vector files. A second, optional PostgreSQL surface (16 tables in a `claude_flow` schema,
`dist/src/commands/ruvector/{setup,init,migrate}.js`) is emitted as a docker-compose stack pinned
to the image `ruvnet/ruvector-postgres:latest`.

**Network listeners.** Exactly **one** `createServer(...)/listen(...)` pair exists in the
published `@claude-flow/cli` dist: an ephemeral loopback HTTP server at
`dist/src/mcp-tools/browser-intent-tools.js:178,209` (`server.listen(0, '127.0.0.1')`). The MCP
server is stdio-first (`dist/src/mcp-server.js:35-43`); `MCPServerManager` carries a `port` option
defaulting to 3000 and an http request path, but no bound listener for it exists in the packaged
code. Separately, the `ruflo` wrapper tarball ships an Express listener
(`R src/mcp-bridge/index.js`, `PORT` default 3001) that its own binary never starts.

**External services referenced in packaged code** (representative file:line in
`evidence/package-inventory.json`): `api.anthropic.com`, `api.openai.com`, `openrouter.ai`,
`generativelanguage.googleapis.com`, `ollama.com`, `huggingface.co` +
`datasets-server.huggingface.co`, `html.duckduckgo.com`, `registry.npmjs.org`, `api.npmjs.org`,
`raw.githubusercontent.com`, `us-central1-claude-flow.cloudfunctions.net/publish-registry`,
`funnel.ruv.io`, `cognitum.one`, `api.pinata.cloud`, `api.web3.storage`, five IPFS gateways
(`w3s.link` default, `ipfs.io`, `dweb.link`, `gateway.pinata.cloud`, `cloudflare-ipfs.com`),
`storage.googleapis.com`, and `agentbbs.local` (with an `ssh -p 2222` join command).

**External binaries spawned** (literal first arguments to `exec*`/`spawn*` in packaged code):
`gcloud` (10), `gh` (8), `git` (5), `npx` (4), `npm` (4), `systemctl` (3), `ps` (3), `node` (3),
`launchctl` (3), `tasklist` (2), `taskkill` (2), `docker` (2), `claude` (2), `agent-browser` (2),
`python3` (1), `powershell` (1).

## 7. Defects and integrity observations found while counting

These are inventory by-products, stated at the evidence level this lane can support.

**RUF-L1a-01 — the shipped `.claude/settings.json` is not valid JSON.** `HIGH`.
`T .claude/settings.json:14` contains `"command": "node "$CLAUDE_PROJECT_DIR/.claude/helpers/hook-handler.cjs" pre-bash"`
— unescaped inner double quotes. `json.load` fails at line 14, column 31. The file is byte-identical
(sha256 `c98b2255ef179f912c9621fc7a0d8ec2004abfcddde87d5ffaeef68579c1fb41`) to
`C v3/@claude-flow/cli/.claude/settings.json`, so this is a source defect that survived publication,
not an extraction artifact. The repo-root `.claude/settings.json` **is** valid. Mitigating: `ruflo
init` generates settings programmatically (`T dist/src/init/settings-generator.js:9`), so this file
may never be parsed. **UNKNOWN:** whether anything reads it at runtime — that is REACHABLE, out of
lane.

**RUF-L1a-02 — the "signed witness manifest" signature is unforgeable-proof-free.** `HIGH`.
`T dist/src/commands/verify.js:124` (source `C v3/@claude-flow/cli/src/commands/verify.ts:163`)
derives the Ed25519 seed as `sha256(witness.manifest.gitCommit + ':ruflo-witness/v1')`. The git
commit is public, so the private key is reproducible by any party; the signature attests to nothing
about authorship. The command also defaults to fetching the manifest from branch
`fix/issues-may-1-3` of `raw.githubusercontent.com/ruvnet/ruflo` (`verify.js:21,139`) — a
non-release branch — and the `verification/` evidence directory is not shipped in either tarball.

**RUF-L1a-03 — `catalog-manifest.json` describes a catalog its own tarball does not contain.**
`MEDIUM`. Both the agent count (164 vs 90 packaged) and the tool count (397 vs 356 registered) are
reproducible from the generator but measure the wrong tree or the wrong pattern. The generator's own
header comment claims "Counts are computed from real, shipped files (git-tracked, not fabricated)"
(`generate-catalog-manifest.mjs:14-17`); the counts are git-tracked, but they are not shipped-file
counts.

**RUF-L1a-04 — 37 of 38 plugins and 35 of 35 marketplace entries are absent from the installed
package.** `MEDIUM`. The published `@claude-flow/cli` `files` array includes `"plugins"`, but the
CLI package's own `plugins/` directory contains only `ruflo-metaharness`. Every other advertised
plugin requires a separate acquisition path from GitHub.

**RUF-L1a-05 — the `ruflo` tarball is 95% unrelated vendored web application.** `MEDIUM`. 499 of
526 files are a HuggingFace `chat-ui@0.20.0` fork with its own dependency tree, container images,
Helm chart, CI workflows, and licence, none of it referenced by `bin/ruflo.js`. This is install
weight and third-party licence/supply-chain surface with no CLI function.

**RUF-L1a-06 — `@claude-flow/cli` declares no `engines` field.** `LOW`. The root `claude-flow`
package requires `node >= 20.0.0`; the package that actually runs does not, so npm applies no
runtime floor to the implementation.

**RUF-L1a-07 — the postinstall script mutates directories it discovers by walking upward.**
`MEDIUM`. `T scripts/postinstall.cjs:52-79` walks up to 12 parent directories collecting every
`node_modules/agentdb` and every `node_modules/.pnpm/agentdb@*`, then `copySiblings()` copies each
found install's `dist/src/<name>/` subdirectories to `dist/<name>/`. A second function
`augmentExports()`, which would rewrite agentdb's `package.json` `exports` map, is defined but is
**not** called from `main()`. Whether the upward walk can escape the dependency subtree in a real
install layout is REACHABLE and out of lane.

**RUF-L1a-08 — 23 of the 356 registered MCP tools are silently conditional.** `LOW`. The
`browser_*` family registers only when an undeclared external binary `agent-browser` answers
`--version` within 3 s (`T dist/src/mcp-client.js:75-88`). A client's `tools/list` will differ by
23 tools between machines with no error surfaced.

## 8. What this lane could not determine

- Whether any packaged capability actually works. Nothing was installed or run; every entry above
  is ADVERTISED, IMPLEMENTED, or PACKAGED only.
- Whether the invalid `.claude/settings.json` is ever read (RUF-L1a-01).
- Whether the postinstall upward walk reaches agentdb installations outside the dependency subtree
  (RUF-L1a-07).
- The resolved dependency graph. `ruflo`'s `^3.33.0` range and 11 optionalDependencies mean the
  installed tree is not determined by the published manifests alone; a lockfile-free install can
  differ between two machines on the same day.
- Tool counts for the *other* two MCP tool trees in the clone (`v3/mcp/tools/`, 12 modules with
  checked-in compiled JS, and `v3/@claude-flow/mcp/src/`). Neither is in the published
  `@claude-flow/cli` tarball, so neither affects the installed-surface counts above.
