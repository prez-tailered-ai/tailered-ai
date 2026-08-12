<!-- audit: {"audit_id":"AUD-RUFLO-20260811-221322","tailered_sha":"6172653e0aca0981d0abaf4ad8e9d587667737e9","ruflo_release":"v3.37.0","ruflo_sha":"6ce18b5a7fcd4939a2f72c2e3b8fdbdec660e5a9","generated":"2026-08-11T23:00:00Z","evidence_class":"MIXED","lane":"AUD-L3b","caused_by":["AUD-RUFLO-20260811-221322/01-audit-charter.md"]} -->

# 07 — Security, privacy, network egress, and provider provenance

Lane **AUD-L3b**. Finding IDs are reserved in the range **RUF-300 … RUF-328** for this lane.

## 0. Method and its limits

All Ruflo execution ran in disposable `docker run --rm` containers mounting only paths under
`/tmp/aud-ruflo-20260811/`. No host `$HOME`, `~/.claude`, `~/.aws` or credential path was ever
mounted. No API credentials existed in any container and none were created. No paid model call was
made. Every container was removed and the audit Docker network deleted at the end of the lane.

Two network arms were used:

- **`--network none`** — hard offline, for the failure differential.
- **Sinkholed network** — a purpose-built container (`sink.js`) on a private Docker network that
  answers every DNS `A` query with its own address and listens on `:443/:80/:8080/:11434`, logging
  the TLS ClientHello **SNI** and plaintext request heads. Ruflo containers ran with
  `--dns <sink>`. This yields the destination census with **zero payload reaching any third
  party** — the connection is made, the hostname is captured from the ClientHello, and the
  handshake then dies at the sink.

The only real outbound traffic in this lane was `npm audit --package-lock-only` against
`registry.npmjs.org`, which is package-metadata resolution against the registry the tree was
already installed from.

**Limit that constrains every negative result below:** absence of an observation is scoped to the
exact runs recorded. A command that made zero DNS queries here may still contact a host under a
configuration not exercised (logged-in Cognitum account, granted consent, installed meta-proxy,
cold caches). Negative claims are stated with their scope attached.

---

## 1. Network egress census

Full record: `evidence/network-observations.jsonl` (50 observations).

### 1.1 Measured destinations (VERIFIED, sinkholed)

| Command | Destination | Requests | What it is |
| --- | --- | --- | --- |
| `ruflo doctor` | `registry.npmjs.org` | DNS ×3, TLS ×3 | version/update metadata |
| `ruflo plugins list` | `api.npmjs.org` | DNS ×21, TLS ×21 | one download-count call **per catalog entry** |
| `ruflo plugins list` | `gateway.pinata.cloud`, `ipfs.io`, `cloudflare-ipfs.com`, `dweb.link`, `w3s.link` | DNS ×1, TLS ×1 each | five IPFS gateways tried in sequence for the registry CID |
| `ruflo plugins list` | `us-central1-claude-flow.cloudfunctions.net` | DNS ×1, TLS ×1 | vendor Google Cloud Function: `rate`, `bulk-ratings`, `analytics`, `track-download`, `status` |
| `ruflo hooks refresh-funnel` | `funnel.ruv.io` | DNS ×1, TLS ×1 | statusline message/promo pool |

Commands that produced **zero** DNS and zero TCP at the sink, in the configurations run:
`--version`, `update check`, `announcements`, `plugins search`, `auth status`, `proxy status`,
`neural status`, `status`, and `init --force`.

### 1.2 Offline behaviour (`--network none`)

Nothing hung; nothing retried indefinitely. `doctor` (18 s), `providers list`, `route`, `auth`,
`proxy`, `update`, `swarm init` all completed. `status` and `memory list` exited 1 with honest
"not initialized" / "Database not found" messages. `plugins list` misreported success — see
**RUF-300**. `init` aborted — see **RUF-301**.

`doctor` renders a verdict for every check offline, including checks whose subject is remote. It
also self-reported the funnel state in plain terms:

```
✓ Funnel (ADR-305): enabled (decided by: package-default; disclosure: never_seen)
```

### 1.3 Source-derived destinations (code present, path not executed here)

`funnel.ruv.io/v1/events` (telemetry, consent-gated), `funnel.ruv.io/v1/click` (attribution),
`auth.cognitum.one` (OAuth2 PKCE + OS keychain), `api.cognitum.one` (cloud data plane),
`github.com/cognitum-one/meta-proxy-dist/releases/download` (native binary),
`api.anthropic.com`, `openrouter.ai/api`, `ollama.com`, `huggingface.co`,
`html.duckduckgo.com` (GAIA benchmark search tool).

### 1.4 The IPFS "decentralized registry" — what it actually contacts

Not a peer-to-peer node. `dist/src/plugins/store/discovery.js` fetches a **hardcoded CIDv0** over
**five centralised HTTPS gateways** — Pinata, Protocol Labs, Cloudflare, dweb.link, web3.storage —
falling through them in order. Trust rests on the gateway operator plus one Ed25519 key pinned in
the dist. There is no local IPFS daemon, no DHT, and no content-addressed verification of the
delivered bytes independent of the signature check described below.

---

## 2. Findings

### CRITICAL

#### RUF-300 — `plugins list` fabricates a registry, a trust level, and a content address, and reports success

`discoverRegistry()` falls back to `createDemoRegistryAsync()` on **four** distinct paths:
IPNS resolution failure, IPFS fetch failure, **signature-verification failure**, and any thrown
error. The fallback returns `success: true`.

The fallback then mints a content address that does not exist:

```js
// dist/src/plugins/store/discovery.js:230
cid: `bafybeiplugin${crypto.randomBytes(16).toString('hex')}`,
```

Measured with all five gateways sinkholed (`logs/net-sink/plugins.out`), stderr shows five
`Gateway … failed: fetch failed` lines and `Fetch failed … on all gateways`, while **stdout**
shows:

```
Registry discovered: 21 plugins available
… 20 rows, every one "Trust: Official" …
Source: claude-flow-official (demo)
Registry CID: bafybeiplugin9f7bf92dfab6ad868...
```

Exit code **0**. A human sees a plausible catalog; an agent parsing stdout sees an authoritative
registry with a content address. The `(demo)` suffix is the entire disclosure, and the CID beside
it is random bytes. The source comment above the signature gate claims "Fail closed on
missing/invalid signature"; the code returns a substitute catalog with `success: true`, which is
fail-*open* to fabricated data.

Compounding it, the demo catalog's integrity metadata is decorative: `checksum: 'sha256:abc123neural'`,
`'sha256:def456security'`, `'sha256:stu901agents'` — placeholder strings, not 64-hex digests
(**RUF-319**).

**Label: VERIFIED.** Reported success with no durable postcondition, plus manufactured provenance.

#### RUF-301 — `ruflo init` aborts with SIGABRT on the default install, after mutating the repo

On a stock `npm i ruflo@3.37.0` (postinstall run, native `better-sqlite3` built — the
`install-default` tree), `ruflo init --force` prints `... Initializing...` and then dies:

```
#  node[1]: void node::RemoveEnvironmentCleanupHook(...) at ../src/api/hooks.cc:142
#  Assertion failed: (env) != nullptr
 3: Statement::~Statement() [/rf/node_modules/agentdb/node_modules/better-sqlite3/build/Release/better_sqlite3.node]
```

Exit **133/134** (SIGABRT). `ruflo status` aborts identically.

Reproduced **4×** with confounds eliminated:

| Install tree | Network | `/rf` mount | init exit |
| --- | --- | --- | --- |
| `install-default` | `none` | ro | **133** |
| `install-default` | sinkholed | ro | **133** |
| `install-default` | `none` | ro (adv suite) | **134** |
| `install-default` | `none` | **rw** | **133** |
| `install-noscripts` | `none` | ro | **0** |
| `install-noscripts` | sinkholed | ro | **0** |

Not a platform mismatch: `install-default` was built inside a Linux container and its
`better_sqlite3.node` is `ELF 64-bit LSB shared object, ARM aarch64, GNU/Linux` — correct for the
`node:24` container. Not a network problem (offline `install-noscripts` succeeds). Not a
read-only-mount artifact (writable mount still aborts).

The failure is **not atomic**: 250 files were already on disk when it died — `.mcp.json`,
`.claude/settings.json` with all hooks, `.claude/helpers/*`, `.swarm/memory.db` — plus
`~/.claude-flow/update-state.json` in HOME. The repo is left half-initialised with a non-zero exit
and no completion signal.

The documented install path is the broken one; `--ignore-scripts` is the working one.

**Label: VERIFIED.**

#### RUF-302 — Generated `.mcp.json` executes a mutable npm tag with auto-install

```json
"command": "npx", "args": ["-y", "ruflo@latest", "mcp", "start"]
```

`@latest` resolves at execution time and `-y` suppresses the install prompt. Every Claude Code
session in the initialised repo can fetch and execute whatever `ruflo@latest` is *at that moment* —
outside any lockfile, outside `npm ci`, outside review. Combined with the 785-package tree
(**RUF-311**), a single compromised publish reaches the developer machine on next session start
with no version change visible anywhere in the repo.

**Label: VERIFIED** (`ctl3/repo/.mcp.json`).

#### RUF-303 — `init --force` destroys pre-existing harness configuration

Seeded a repo with a project `.claude/settings.json` (canary key, `permissions.deny`,
`enabledPlugins`, a `SessionStart` hook) and a `.mcp.json` registering a third-party server, then
ran `init --force`:

| Canary | Survived? |
| --- | --- |
| `HOST_SETTINGS_MUST_SURVIVE` (settings.json body) | **NO — 0 files** |
| `HOST_HOOK` (pre-existing hook) | **NO — 0 files** |
| `host-existing` (third-party MCP server) | **NO — 0 files** |
| `HOST_CLAUDEMD_CANARY` (project CLAUDE.md) | yes (CLAUDE.md is merged) |
| `USER_GLOBAL_MUST_SURVIVE` (`~/.claude/settings.json`) | yes (untouched) |
| `GLOBAL_CLAUDEMD_CANARY` (`~/.claude/CLAUDE.md`) | yes (appended to) |

`--force` replaces project `settings.json` and `.mcp.json` **wholesale**. For the agent platform — whose
`.claude/settings.json` carries 61 `enabledPlugins`, `extraKnownMarketplaces`, a 12-tool an external deployment provider
`permissions.deny` list, and three `SessionStart` hooks — that is total loss of the harness security
posture in one command.

**Label: VERIFIED** (`logs/ctl3.log`, `logs/ctl3-before.sha256` / `ctl3-after.sha256`).

---

### HIGH

#### RUF-304 — Provider is chosen by ambient environment and erased from the result

`dist/src/mcp-tools/agent-execute-core.js:71-106`:

```js
useOpenRouter = explicitProvider === 'openrouter' || (!anthropicKey && !!openrouterKey);
useOllama     = explicitProvider === 'ollama'     || (!anthropicKey && !!ollamaKey && !openrouterKey);
```

A caller asking for a Claude model on a machine where `ANTHROPIC_API_KEY` happens to be unset and
`OPENROUTER_API_KEY` happens to be set is served by **OpenRouter** — no error, no warning. If
`OLLAMA_API_KEY` is set instead, it goes to **`ollama.com`** (Ollama *Cloud*, not a local daemon).

The success shape `AnthropicCallResult` is
`{success, model?, messageId?, stopReason?, output?, usage?, durationMs?, error?}` — **no
provider field, no endpoint field**. `providerLabel` is input-only and appears solely inside error
strings. The module states the intent outright:

> "Response shape is normalized to the Anthropic-flavored `AnthropicCallResult` so existing callers
> don't need to know which provider answered."

There is no per-call provider argument (`RUFLO_PROVIDER` is process-wide), no signed receipt, and no
endpoint attestation. Given a successful result, **which vendor served it is unrecoverable**.

Against Tailered §16 (model identity only from `tailered.config.json`; stateless router) this is a
**HARD BLOCKER**. **Label: VERIFIED** (source; live fallback ordering under real keys is `UNKNOWN`).

#### RUF-305 — Hardcoded `api.anthropic.com` bypasses a gateway-routed environment

Two Anthropic call sites in the same package disagree:

- `dist/src/mcp-tools/managed-agent-tools.js:20` — `process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'`
- `dist/src/mcp-tools/agent-execute-core.js:111` — `fetch('https://api.anthropic.com/v1/messages')`, a bare literal

the agent platform routes **all** Claude traffic — `anthropicClient.ts`, `dimeAgent.ts`, `piAgent.ts`, and the
Claude Code CLI — through an Anthropic-compatible gateway via `ANTHROPIC_BASE_URL` +
`ANTHROPIC_AUTH_TOKEN`. Ruflo's `agent_execute` path egresses directly to Anthropic, outside that
gateway, and needs a raw `ANTHROPIC_API_KEY` because it sends `x-api-key`. **Label: VERIFIED.**

#### RUF-306 — Unconsented, unsigned remote content fetched on every session start

`refreshRemoteMessages()` (`dist/src/funnel/message-transport.js`) fetches
`https://funnel.ruv.io/v1/messages` and has **no `hasConsent()` call anywhere in its path** —
unlike `event-transport.js:157` and `events.js:52,103`, which do gate on `telemetry`. It is
**opt-out only**, via `RUFLO_FUNNEL_MESSAGES=0` or `RUFLO_FUNNEL=0`.

It is wired to fire automatically: `.claude/helpers/hook-handler.cjs:99` calls
`spawnDetachedHookRefresh('refresh-funnel')` from the `SessionStart` hook that `init` installs. So
after `ruflo init`, **every Claude Code session start in the host repo makes a detached outbound
HTTPS call to a vendor endpoint.** Measured: `ruflo hooks refresh-funnel` → DNS + TLS to
`funnel.ruv.io`.

The returned content is rendered in the developer's statusline and is **unsigned** — the module's
own comment: *"Signature-verification hook. Reserved for a future ADR-311 amendment; currently the
transport-layer TLS + host allowlist is the trust boundary."* Mitigations are real but partial:
`isValidMessage()` enforces a schema, host allowlist, control-character strip and an 80-column cap,
and the cache is bounded to 128 KiB / 200 messages.

`doctor` states the posture itself: `Funnel (ADR-305): enabled (decided by: package-default;
disclosure: never_seen)` — **on by package default, with its own disclosure never shown.**

**Label: VERIFIED.**

#### RUF-307 — `security scan` misses every unquoted secret, and the advertised protections do not hold

The README advertises *"Security | AIDefence, input validation, CVE remediation, **path traversal
prevention**"* and *"**Block prompt injection**, detect PII, safety scanning"*.

Controlled test — identical secrets, quoted vs unquoted, plus an injection fixture:

| Fixture | Content | Result |
| --- | --- | --- |
| `quoted.js` | `"ghp_aaa…"`, `"AKIAIOSFODNN7EXAMPLE"`, `password = "supersecret123"` | **3 HIGH found** ✅ |
| `unquoted.env` | same GitHub token, same AKIA id, plus a real-format AWS secret key | **0 found** ❌ |
| `unquoted.js` | same GitHub token, unquoted | **0 found** ❌ |
| `inject.md` | blatant prompt-injection payload | **0 found** ❌ |
| symlink → `/etc/passwd` | | **0 found** |

Root cause in `dist/src/commands/security.js:172-177` — every pattern demands surrounding quotes:

```js
{ pattern: /['"]AKIA[A-Z0-9]{16}['"]/g,      type: 'AWS Access Key' },
{ pattern: /['"]ghp_[a-zA-Z0-9]{36}['"]/g,   type: 'GitHub Token'   },
```

`.env` files never quote. **The single most common real-world secret location is structurally
undetectable.** There is also no pattern for `AWS_SECRET_ACCESS_KEY` itself — only the `AKIA`
access-key *id*. `--depth deep` produced byte-identical output to `standard`.

The quoted control is the important half: it proves the scanner *can* fire, so the unquoted misses
are a genuine false-negative class, not a broken harness. Output on the miss is
`No security issues found!`, `Critical: 0 High: 0`, exit **0** — an affirmative clean bill of
health over a directory containing live-format credentials.

**Label: VERIFIED.**

#### RUF-308 — `memory export --output` escapes the project root

From `/repo`:

```
node ruflo.js memory export --output ../../../tmp/EXPORT_ESCAPE.json
→ -rw-r--r-- 1 root root 136 /tmp/EXPORT_ESCAPE.json
```

No containment on the output path. Directly contradicts the advertised "path traversal prevention".
Arbitrary-file-write primitive for any caller that controls the export path — including an agent
acting on repository content. **Label: VERIFIED.**

*(Adjacent observation for the reliability lane: the export reported `Entries: 0` immediately after
a `memory store` that had reported `[OK] Data stored successfully`. Store and export appear to read
different backends.)*

#### RUF-309 — init injects permission grants into an existing settings.json without prompting

Without `--force` (the realistic first-run-in-an-existing-repo case) `init` **merges** rather than
replaces: the pre-existing canary and `permissions.deny` survive, exit 0. But it writes in:

```json
"allow": ["Bash(npx @claude-flow*)", "Bash(npx claude-flow*)", "Bash(node .claude/*)", "mcp__claude-flow__*"]
```

`Bash(node .claude/*)` is a standing grant to execute **any file under `.claude/`** with no
permission prompt — and `.claude/` is precisely the tree Ruflo populates with 241 files including
`hook-handler.cjs`, `intelligence.cjs`, `auto-memory-hook.mjs`, `router.js` and 20+ shell scripts.
A tool writing its own execution allowlist into the host's security policy is a privilege
escalation by construction.

It also sets `env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, enabling an experimental harness feature
project-wide unasked. (Credit where due: it adds `Read(./.env)` / `Read(./.env.*)` to `deny`.)

**Label: VERIFIED** (`logs/ctl4.log`).

#### RUF-310 — AIDefence is advertised, implemented in source, and absent from every shipped install

The prompt-injection/PII defence the README leads with:

| Tree | `@claude-flow/aidefence` |
| --- | --- |
| `install-default` | **ABSENT** |
| `install-noscripts` | **ABSENT** |
| `install-nooptional` | **ABSENT** |
| upstream repo `plugins/ruflo-aidefence` | present |

It is not a declared dependency of `@claude-flow/cli` in any form. `doctor` confirms at runtime:
`⚠ AIDefence: @claude-flow/aidefence not loadable — aidefence_* MCP tools will fail (optional
package)`. The CLI tarball ships exactly **one** plugin (`ruflo-metaharness`).

Maturity ladder: **ADVERTISED → IMPLEMENTED → ✗ PACKAGED.** Therefore not REACHABLE, not EFFECTIVE.
No claim about prompt-injection defence in Ruflo-as-shipped can be supported. **Label: VERIFIED.**

#### RUF-311 — 41 known vulnerabilities, including a critical RCE, plus caret ranges on alpha dependencies

`npm audit --package-lock-only` in a container: **1 critical, 13 high, 27 moderate = 41**, over
**785 packages (218 prod, 568 optional)**.

- **critical** — `protobufjs <7.5.5`, arbitrary code execution (GHSA-xq3m-2v4x-88gg), plus five
  further high protobufjs advisories.
- **high** — `undici` ×3, `sharp` (four libvips CVEs), `adm-zip` (4 GB alloc from a crafted ZIP),
  `@opentelemetry/propagator-jaeger`.
- Flagged packages include `@claude-flow/cli`, `agentdb`, `agentic-flow`, `@huggingface/transformers`,
  `onnxruntime-node`, `onnxruntime-web`, `onnx-proto`, `@xenova/transformers`.

The 3.5.0 release notes claim *"0 Production Vulnerabilities: Clean `npm audit` across all
packages"*. That is not the state of 3.37.0.

Version-range hygiene is the deeper issue — **carets on prereleases**:

```
agentdb: ^3.0.0-alpha.17   agentic-flow: ^3.0.0-alpha.1   @claude-flow/memory: ^3.0.0-alpha.22
better-sqlite3: ^12.9.0    ruvector: ^0.2.27              @metaharness/*: ~0.x
```

A pinned `ruflo@3.37.0` install still floats its dependencies — the coordinator's install resolved
`agentdb 3.0.0-alpha.20`, `ruvector 0.2.41`, `agentic-flow 3.0.0-alpha.2`. Two installs of the same
pinned version on different days are different software. Combined with **RUF-302** (`ruflo@latest`
in `.mcp.json`) and the postinstall that walks up to 12 parent directories mutating every reachable
`node_modules/agentdb` including `.pnpm` copies, the blast radius on a developer machine is: the
whole repo tree, the harness config, the OS keychain (via `@napi-rs/keyring`), and — in a **pnpm**
monorepo like the agent platform — the shared content-addressed store that *other* workspaces resolve from.

*Caveat: `--package-lock-only` audits the full lockfile, so all three variants returned identical
counts; it does not measure the smaller installed surface of `--omit=optional`.*

**Label: VERIFIED.**

#### RUF-312 — init pins the harness model without asking

`.claude/settings.json` written by init contains `"model": "claude-sonnet-5"` and
`claudeFlow.modelPreferences = { default: "claude-sonnet-5", routing: "claude-haiku-4-5-20251001" }`.

An external tool silently setting the model for the entire host project violates Tailered §16
(model identity only from `tailered.config.json`) and a repository-owned model policy directly.
**Label: VERIFIED.**

---

### MEDIUM

#### RUF-313 — 90 MB model fetched at runtime, undeclared and unverified

`node_modules/@huggingface/transformers/.cache/Xenova/all-MiniLM-L6-v2/` — 4 files, 97 MB:
`onnx/model.onnx` **90,387,606 B**, `tokenizer.json` 711,661 B, `tokenizer_config.json` 366 B,
`config.json` 650 B. **Zero** occurrences of `Xenova` or `all-MiniLM` in `package-lock.json`: no
lockfile entry, no npm integrity hash, no SRI. Because the cache lives *inside* `node_modules`, any
`npm ci` destroys it and it is re-fetched — an unpinned 90 MB binary re-entering the tree on every
clean install, invisible to dependency review and to CI cache accounting.

My sinkholed runs made no HF request because both prepared trees already carried the warm cache; the
download is a cold-cache event and the coordinator's measurement stands. `--omit=optional` omits
`@huggingface/transformers` entirely and is a working mitigation (**RUF-321**). **Label: VERIFIED.**

#### RUF-314 — Memory content is plaintext on disk, one database is world-readable, and none of it is git-ignored

Permissions after init + stores:

```
600 .swarm/memory.db            600 .swarm/memory.db-shm/-wal
644 .swarm/agentdb-memory.db    644 .swarm/agentdb-memory.db-shm/-wal   ← world-readable
```

The sql.js store is correctly `0600`; the AgentDB store beside it is `0644`. Empirically, a value
stored via `memory store` was recovered verbatim from `.swarm/memory.db` and its WAL with `strings`.
`doctor` states it plainly: *"Encryption at Rest: Off — session/terminal/memory stores are plaintext
(mode 0600 only)"*.

And `.gitignore` after a successful init adds only:

```
.env  .env.local  .env.*.local  .claude-flow/data/  .claude-flow/logs/  .claude-flow/sessions/
```

**`.swarm/` is not ignored. `ruvector.db` (1.5 MB, repo root) is not ignored. `.mcp.json`,
`.claude/settings.json` and the 241 `.claude/` files are not ignored.** Anything an agent puts in
memory — prompts, source excerpts, credentials it was handed — is plaintext in a repo-local database
that `git add -A` will stage. **Label: VERIFIED.**

#### RUF-315 — init misreports its own hook installation

Printed: `[INFO] Hooks: 7 hook types enabled in settings.json`.
Written: **10 hook types, 16 hook entries** — `PreToolUse` ×2, `PostToolUse` ×2, `UserPromptSubmit`,
`SessionStart` ×2, `SessionEnd`, `Stop`, `PreCompact` ×4, `SubagentStart`, `SubagentStop`,
`Notification`. Plus a `statusLine` command hook. The self-report understates the installed
execution surface by more than half. **Label: VERIFIED.**

#### RUF-316 — Hook commands fall back to the user's global helpers

Every hook is shaped:

```sh
D="${CLAUDE_PROJECT_DIR:-.}"; [ -f "$D/.claude/helpers/hook-handler.cjs" ] || D="${HOME}";
exec node "$D/.claude/helpers/hook-handler.cjs" pre-bash
```

If the project-local helper is missing, the hook executes `~/.claude/helpers/hook-handler.cjs`
instead. The code that runs on every tool use is therefore **not pinned to the repository** — a
partially-initialised or partially-cleaned repo (exactly what **RUF-301** produces) silently
executes a global script the repo has no record of. **Label: VERIFIED.**

#### RUF-317 — Three releases, including the security-titled one, are undocumented

`CHANGELOG.md` at `6ce18b5` has an empty `[Unreleased]` heading and its newest entry is
`[3.34.0] - 2026-07-31`. There is **no entry for 3.35.0, 3.36.0 or 3.37.0** — including the release
titled *"proxy install hardening, cloud routing disclosure, tier pinning"*. A consumer cannot learn
what changed in the shipped version from the shipped changelog. **Label: VERIFIED.**

#### RUF-318 — The published `ruflo` package ships an unrelated third party's product

`ruflo@3.37.0`'s `files` includes `src/**`, and `src/` contains **none** of the CLI (which lives
entirely in `@claude-flow/cli`). It contains an unrelated commercial application:
`src/ruvocal/` (a SvelteKit app with its own `LICENSE`, `PRIVACY.md`, `package-lock.json`,
`cloudbuild.yaml`, `Dockerfile`, husky hooks), `src/chat-ui/`, `src/nginx/`, `src/mcp-bridge/`
(an Express MCP server with HMAC kernel signing and its own auth model), and `src/scripts/deploy.sh`.

Its ADRs identify a different organisation's production system: **`chat.conveyorclaims.ai`**,
GCP project **`new-project-473022`**, "Conveyor AI", a MongoDB deployment. No credential values were
found, but the topology, domains and deployment procedure of a third party's live system ship inside
a package `ruflo` users install. It is also pure attack surface: `bin/ruflo.js` never touches it.
**Label: VERIFIED.**

#### RUF-319 — Plugin catalog checksums are placeholders

`sha256:abc123neural`, `sha256:def456security`, `sha256:ghi789embeddings`, `sha256:stu901agents`,
`sha256:pluginsdk2024abc` … — none is a 64-hex digest. Integrity metadata that cannot verify
anything, presented in the same record as `trustLevel: 'official'`. **Label: VERIFIED.**

#### RUF-320 — `plugins list` is a telemetry event with no consent gate

One `plugins list` produced **21** requests to `api.npmjs.org` plus one to the vendor's Cloud
Function, whose documented actions include `track-download` and `analytics`
(`dist/src/services/registry-api.js`). None of the consent domains gates this path. The consent
framework exists and defaults correctly to `false`; this surface simply does not consult it.
**Label: VERIFIED.**

#### RUF-321 — `--omit=optional` is a real, measurable mitigation

`npm i ruflo@3.37.0 --omit=optional` yields **124 MB / 11,956 files** vs 1.5 GB / 50,012, and drops
`better-sqlite3` (removing the **RUF-301** abort), `@huggingface/transformers` (removing the 90 MB
download, **RUF-313**), `ruvector`, `agentic-flow`, and `@napi-rs/keyring` (removing keychain
writes). The CLI still runs. This is the single highest-leverage containment control if any Ruflo
adoption proceeds. **Label: VERIFIED** (tree inventory; full functional parity of the reduced tree
is `UNKNOWN` and belongs to the capability lane).

---

### Negative results and genuine positives

These were tested and did **not** reproduce. Recording them is as important as the failures.

#### RUF-322 — Command injection via agent/task names: NOT exploitable *(INFO)*

`agent spawn --name 'evil$(touch /tmp/PWNED_AGENT_SUBSHELL)'`, a backtick variant, and a
`; touch` variant were all accepted and stored verbatim, and **no canary file was created**. Same
for `hooks pre-task --description 'y; touch /tmp/PWNED_HOOK'`. The names are treated as data.
Scope: this exercised the CLI storage path, not every downstream consumer of an agent name.
**Label: VERIFIED (negative).**

#### RUF-323 — Path traversal in memory keys/namespaces: no filesystem escape *(INFO)*

Keys `../../escape-key`, namespaces `../../../tmp/nsescape` and `/tmp/absns` were all accepted with
`[OK] Data stored successfully`, but nothing was written outside the DB — they are parameterised
SQLite column values, not paths. Input validation is absent, but the traversal is not exploitable
*through this surface*. Contrast **RUF-308**, where an actual path parameter *is* exploitable.
**Label: VERIFIED (negative).**

#### RUF-324 — meta-proxy install really is hardened *(INFO — positive)*

`dist/src/proxy/{release,verify,install}.js` does this correctly: an Ed25519 public key pinned in
source, raw-EdDSA verification of `SHA256SUMS.sig` over the exact `SHA256SUMS` bytes, per-asset
SHA-256 match, a 32 MB size cap enforced against both `content-length` and actual bytes,
`PathValidator` on the extracted binary, atomic `write→chmod 0755→rename`, and an install manifest
recording the pubkey fingerprint. Critically, `RUFLO_PROXY_RELEASE_SOURCE` can redirect the
**download URL** but **cannot** substitute the verification key — a redirected download still fails
signature verification. This is the "proxy install hardening" in the release title, and it holds.
*(One stale comment claims the production path is "Not implemented"; it is.)* **Label: VERIFIED.**

#### RUF-325 — Consent defaults are correct *(INFO — positive)*

`getConsent()` returns `{granted:false}` for every unrecorded domain, `hasConsent()` additionally
requires the receipt to match the current `CONSENT_POLICY_VERSION` (so a stale receipt is *not*
carried forward), a receipt is written on decline as well as grant, and the twelve domains are
genuinely separate. Cloud routing defaults to `passthrough`; the meta-proxy is not installed by
`npm i` or by `init`. The framework is sound — the failures above are surfaces that bypass it
(**RUF-306**, **RUF-320**), not defects in it. **Label: VERIFIED.**

#### RUF-326 — Environment secrets did not leak into artifacts *(INFO — negative)*

With `ANTHROPIC_API_KEY=sk-ant-LEAKCANARY0001` and a DB URL canary in the environment, then running
`doctor`, `status` and `memory store`, neither canary appeared anywhere in `.swarm/`,
`.claude-flow/`, `~/.ruflo/`, `~/.claude-flow/` or `.claude/`. Only the canary I *explicitly asked
it to store* was persisted (see **RUF-314**). **Label: VERIFIED (negative).**

#### RUF-327 — `security scan --depth deep` adds no coverage *(LOW)*

`--depth deep` returned byte-identical findings to `--depth standard` on the same fixture set.
The 3.34.0 changelog documents a prior defect where depth values silently reduced coverage; this
observation suggests depth still does not change what the content scanners find, at least at this
tree size. **Label: VERIFIED**, scoped to a 4-file fixture directory.

#### RUF-328 — Destination-override environment variables *(LOW)*

`RUFLO_PROXY_RELEASE_SOURCE`, `RUFLO_FUNNEL_EVENTS_ENDPOINT`, `RUFLO_FUNNEL_MESSAGES_ENDPOINT`,
`RUFLO_FUNNEL_CLICK_ENDPOINT`, `OPENROUTER_BASE_URL`, `ANTHROPIC_BASE_URL` (partial — see
**RUF-305**) each redirect a destination from the environment. 157 distinct `process.env.*` reads
exist across the dist. The proxy override is safe because the signature check is independent
(**RUF-324**); the **funnel message override is not** — redirected content is unsigned and is
rendered in the developer's terminal. **Label: VERIFIED.**

---

## 3. Capability maturity established by this lane

| Capability | ADVERTISED | IMPLEMENTED | PACKAGED | REACHABLE | EFFECTIVE | DURABLE | GOVERNABLE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Consent framework (12 domains, versioned receipts) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **✓** |
| meta-proxy signed install | ✓ | ✓ | ✓ | ✓ | ✓ (verify logic) | — not exercised end-to-end | — |
| Cloud-routing disclosure (`proxy config`) | ✓ | ✓ | ✓ | ✓ | ✓ for the proxy plane only | — | ✗ — silent on the `agent_execute` fallback ladder |
| Prompt-injection defence (AIDefence) | ✓ | ✓ (source) | **✗** | ✗ | ✗ | ✗ | ✗ |
| Secret scanning (`security scan`) | ✓ | ✓ | ✓ | ✓ | **✗** — quoted-only; `.env` undetectable | ✗ | ✗ |
| Path-traversal prevention | ✓ | partial | ✓ | ✓ | **✗** — `memory export --output` escapes | ✗ | ✗ |
| Plugin registry (IPFS, signed) | ✓ | ✓ | ✓ | ✓ | **✗** — fails open to a fabricated catalog + random CID | ✗ | ✗ |
| Provider/model provenance in results | ✓ | **✗** — deliberately erased | n/a | n/a | ✗ | ✗ | ✗ |
| `ruflo init` (default install) | ✓ | ✓ | ✓ | ✓ | **✗** — SIGABRT | ✗ — non-atomic partial mutation | ✗ |
| `ruflo init` (`--ignore-scripts` install) | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ — destroys config under `--force` | ✗ |
| Telemetry gating | ✓ | ✓ | ✓ | ✓ | ✓ for `/v1/events` | ✗ — `/v1/messages`, npmjs, cloudfunctions ungated | ✗ |

## 4. What could not be determined, and why

| Item | Why | Label |
| --- | --- | --- |
| Live provider behaviour under real credentials — actual endpoint hit, actual model served, fallback ordering under 429/5xx | No API credentials exist in the containers and none may be created | **UNKNOWN** |
| meta-proxy binary internals — routing, logging, retention, what `api.cognitum.one` receives | `cognitum-one/meta-proxy` source is private; only the signed dist is public and it was never downloaded or executed | **UNKNOWN** |
| Whether Cognitum retains, logs or trains on routed prompts | Requires the vendor's live service and terms | **UNKNOWN** |
| Behaviour behind `training-data-sharing` and `hosted-memory` consent once granted | Never granted; granting would produce real egress to vendor infrastructure | **UNKNOWN** |
| Whether the fabricated demo catalog is ever *installed from* (vs merely listed) | Would require executing `plugins install` against the fake catalog; the install path was not exercised | **UNKNOWN** |
| Full functional parity of the `--omit=optional` tree | Belongs to the capability lane; only presence/absence measured here | **UNKNOWN** |
| Whether Ruflo's IPFS registry CID currently resolves to a validly-signed registry | Would require real IPFS gateway traffic; deliberately sinkholed | **UNKNOWN** |
| Windows and x86-64 behaviour | Only linux/arm64 containers available | **UNKNOWN** |

## 5. Bottom line for the host repositories

**Tailered AI.** Multiple invariants are contradicted at once, and the contradictions are not
configuration choices. §16 provider/model provenance is a **hard blocker** (**RUF-304**,
**RUF-305**, **RUF-312**). "Repo is sole source of truth" and "an external process agent must not
mutate the company repo" fail against 250+ unreviewed files, a self-granted `Bash(node .claude/*)`
allowlist (**RUF-309**), and a non-atomic abort mid-mutation (**RUF-301**). Append-only causal
ledgers and `caused_by` have no analogue in a store that reports success while a fabricated catalog
is what was returned (**RUF-300**).

**the agent platform.** Two hazards are specific and immediate. First, `.claude/settings.json` — 61
`enabledPlugins`, a 12-tool an external deployment provider `permissions.deny`, three `SessionStart` hooks — is **replaced
wholesale** by `init --force` (**RUF-303**) and has execution grants **injected** by plain `init`
(**RUF-309**). Second, `npx -y ruflo@latest` (**RUF-302**) in a **pnpm** monorepo whose postinstall
already walks up to 12 parent directories mutating every reachable `node_modules/agentdb` including
`.pnpm` copies: the compromise surface is the shared content-addressed store, not one workspace.
Ruflo's hardcoded `api.anthropic.com` also bypasses the agent platform's mandated gateway routing (**RUF-305**).

If any adoption proceeds, the minimum containment is: `--omit=optional` (**RUF-321**),
`--ignore-scripts`, an exact pin instead of `@latest`, `RUFLO_FUNNEL=0`, never `init --force` in a
repo with existing harness config, and `.swarm/` + `ruvector.db` added to `.gitignore` by hand.
None of that repairs **RUF-300**, **RUF-304** or **RUF-307**, which are behavioural.
