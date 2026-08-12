<!-- audit: {"audit_id":"AUD-RUFLO-20260811-221322","tailered_sha":"6172653e0aca0981d0abaf4ad8e9d587667737e9","ruflo_release":"v3.37.0","ruflo_sha":"6ce18b5a7fcd4939a2f72c2e3b8fdbdec660e5a9","generated":"2026-08-11T23:00:00Z","evidence_class":"MIXED","lane":"AUD-L5","caused_by":["AUD-RUFLO-20260811-221322/01-audit-charter.md"]} -->

# 10 — Performance, cost, and benchmark design (lane AUD-L5)

Raw per-run samples: `evidence/benchmark-results.json` (94,620 bytes, 235 indexed raw files).
Findings in this lane are numbered `RUF-501`–`RUF-512` (block reserved for AUD-L5).

No paid model calls were made. No container was left running. Nothing outside
`/tmp/aud-ruflo-20260811/` was written.

**Shared-evidence integrity note.** Every AUD-L5 container mounted the shared installs
**`:ro`**; writes were redirected to lane-owned bind mounts. At final check
`work/install-default` had grown from 50,012 to **50,016 files** — the four files of a
Hugging Face model cache with **mtime 15:43**, i.e. *after* AUD-L5's own footprint
measurement (15:41) and *before* AUD-L5's first `init` run (15:56) and its private
`hfcache-warm` copy (15:58, different inode). A read-only mount cannot produce it.
`INFERRED:` a concurrently running lane mounted that tree writable. All AUD-L5 numbers in
§1 predate it and are unaffected; §3–§5 read lane-private caches. Flagged for the
coordinator because it is itself an instance of RUF-507 — `ruflo init` writing ~91 MB into
whatever install tree it can reach.

---

## 0. Measurement environment and its dominant error term

| Item | Value |
| --- | --- |
| Host | macOS 25.5.0, arm64 (Apple Silicon), 8 GB RAM |
| Docker | server 29.6.1; Linux VM with 8 CPUs, **3.826 GiB RAM**, `overlayfs` |
| Image | `node:24` → Node **v24.19.0**, linux/arm64 |
| Ruflo trees | bind-mounted **read-only** from the shared installs (never copied, never mutated) |

**The dominant error term is not Ruflo — it is Docker Desktop's macOS virtiofs bind mount.**
`VERIFIED:` a control run of the *dependency-free* Tailered repo produced `npm ci` at **76,037 ms**
in one pass and **703 ms** in another, on the same command, same image, minutes apart. Any
single-shot "cold" number in this lane is therefore an **upper bound on this host**, not a
native-filesystem measurement.

Two consequences I enforced throughout:

1. Every latency claim is reported as **cold (first touch)** and **warm (steady state)** separately.
   Only warm numbers are used for comparisons.
2. The coordinator's "~15.4 s cold / ~1.8 s warm for `--version`" is confirmed to be **almost
   entirely container-start and mount cost**. `VERIFIED:` host-side `docker run --rm node:24 true`
   — a container that runs *nothing* — has a median of **2,335 ms** and a max of **11,836 ms**, and
   the full `docker run … ruflo --version` median (**1,510 ms**) is *lower* than the empty
   container's median. Container start swamps the CLI entirely at that granularity, so all CLI
   timings below were taken **inside a single long-lived container** instead.

---

## 1. Install cost

`VERIFIED:` (sizes and file counts re-measured by AUD-L5; wall times from the coordinator's logs)

| Install mode | Wall | Size | Files | Dirs |
| --- | --- | --- | --- | --- |
| default (postinstall runs) | **534 s** | 1,570,068 KB (**1.50 GiB**) | **50,012** | 5,833 |
| `--ignore-scripts` (as measured) | **79 s** | 1,586,232 KB | 48,678 | 5,701 |
| `--ignore-scripts` (**true base**) | 79 s | **1,487,160 KB (1.42 GiB)** | **48,674** | 5,701 |
| `--omit=optional` | **74 s** | 127,100 KB (124 MiB) | 11,956 | 1,464 |
| **Tailered at the frozen SHA** | **0.7–5.5 s** | **32,860 KB** | **652** | — |

`VERIFIED:` the `--ignore-scripts` tree measures *larger* than default only because the
coordinator's `ruflo init` trial wrote the **91,100,283-byte Hugging Face model cache into that
install tree**. Subtracting it yields 48,674 files — exactly the coordinator's recorded count — and
1,487,160 KB. The real postinstall delta is therefore **+82,908 KB and +1,338 files**, which is the
`copySiblings` duplication plus built native addons.

Ratio to Tailered: **47.8× the disk, 76.7× the files, and ~98–760× the install wall time**, for a
repo whose own runtime dependency count is **zero**.

Cold vs warm npm cache: `VERIFIED:` for Tailered, `npm ci` was 5,452 ms on the first (cold-cache)
rep and 926 ms / 703 ms warm. For Ruflo I did **not** re-run a 534 s cold install — the coordinator's
measurement stands and re-running it would have consumed ~1.5 GB of the ~25 GB free disk for no new
information. `UNKNOWN:` Ruflo's warm-cache install time (not measured; expected to fall mostly on the
network-bound fraction, since the 534 s figure includes the native builds that a warm cache does not
skip).

---

## 2. CLI startup latency

All figures below are **in-container**, so container start is excluded. Three passes were run; pass 2
(network off) executed *before* pass 3 (network on) and therefore paid the cold first-touch of the
50,012-file mount. `VERIFIED:` **the network-off pass is slower than the network-on pass** — proving
the difference is host page cache, not network.

### Warm steady state (pass 3, n = 10 each, ms)

| Probe | min | p50 | p95 | max |
| --- | --- | --- | --- | --- |
| `node -e ""` (baseline) | 15.0 | **19.1** | 168.4 | 168.4 |
| `ruflo --version` | 15.7 | **22.1** | 108.4 | 108.4 |
| `ruflo --help` | 219.9 | **311.0** | 1,235.9 | 1,235.9 |
| `ruflo status` (uninitialised dir, exit 1) | 166.2 | **219.3** | 1,134.4 | 1,134.4 |
| `ruflo __no_such_command__` (exit 1) | 137.8 | **214.1** | 1,283.4 | 1,283.4 |

### Cold mount (worst observed, ms)

| Probe | observed | where |
| --- | --- | --- |
| `ruflo --help` | **17,903.1** and **18,680.2** | pass 2, rounds 1 and 4 |
| `ruflo status` | **35,062.7** max, p95 **18,469.6** | pass 1 (n = 15) |
| `ruflo __no_such_command__` | 14,920.7 | pass 2, round 3 |
| `node -e ""` (baseline, same container) | 3,429.4 / 3,024.8 | pass 1 / pass 2 |

`VERIFIED:` `ruflo --version` is **not evidence about CLI startup**. `bin/ruflo.js` lines 10–29 are a
hardcoded fast path that reads the wrapper's own `package.json` and calls `process.exit(0)` before
importing anything. Its own comment states the reason:

> `the downstream @claude-flow/cli dist eagerly loads ruvector + a 23 MB ONNX model on cold cache,`
> `blocking 60+ s and causing SIGTERM under common timeout windows: npx default, MCP stdio 30s window`

Three things follow. (a) The vendor **documents a 60+ s cold block** in shipped source — my 17.9 s is
consistent with, and milder than, their own statement. (b) The mitigation covers `--version`/`-V`
**only**, and only when it is the *sole* argument; every other command still pays the cold path.
(c) The comment says "23 MB ONNX model"; the artifact actually fetched is **90,387,606 bytes**
(§4) — a 3.9× understatement inside the fix's own justification.

`VERIFIED:` against the vendor's own target table (upstream `CLAUDE.md`, "CLI Startup `<500ms`"):
**met warm** (311 ms / 219 ms), **missed by 36×–37× cold**.

→ **RUF-508** (MEDIUM), **RUF-512** (INFO).

---

## 3. The default install produces a CLI that aborts — `--ignore-scripts` does not

This is the single most consequential performance finding, because a crashed command has no latency.

`VERIFIED:` identical probes, identical initialised repo, identical image; only the install tree differs.

| Command | `install-default` (postinstall RAN) | `install-noscripts` |
| --- | --- | --- |
| `ruflo init` (fresh repo) | **exit 134 (SIGABRT)** @ 11,754 ms | **exit 0** @ 12,840 ms |
| `ruflo status` (initialised repo) | **exit 134 — 5/5 runs** | exit 0 — 5/5 |
| `ruflo memory stats` | **exit 134 — 5/5 runs** | exit 0 — 5/5 |
| `ruflo memory list` | exit 0 — 5/5 | exit 0 — 5/5 |
| `ruflo status` (uninitialised dir) | exit 1, clean | exit 1, clean |

The abort is a native assertion, identical in every occurrence:

```text
node[10]: void node::RemoveEnvironmentCleanupHook(v8::Isolate*, CleanupHook, void*) at ../src/api/hooks.cc:142
Assertion failed: (env) != nullptr
 3: Statement::~Statement() [/rf/node_modules/agentdb/node_modules/better-sqlite3/build/Release/better_sqlite3.node]
```

`VERIFIED:` mechanism. The default install contains **five `better_sqlite3.node` binaries across
three trees and two incompatible versions**:

| Path | version |
| --- | --- |
| `node_modules/better-sqlite3` | **12.11.1** |
| `node_modules/agentdb/node_modules/better-sqlite3` | **11.10.0** |
| `node_modules/agentic-flow/node_modules/better-sqlite3` | **11.10.0** (byte-identical to the agentdb copy) |

`--ignore-scripts` builds **zero** `.node` binaries, so only one JS/WASM path is ever loaded and the
teardown assertion cannot fire. This directly compounds the coordinator's verified finding that the
`@claude-flow/cli` postinstall's `copySiblings` "walks up to 12 parent dirs and mutates EVERY
reachable `node_modules/agentdb`".

The security posture is inverted: **the safer install (`--ignore-scripts`) is also the only working
one**, and the recommended install is the broken one. The failure is loud (SIGABRT) rather than
silent, which is the one mercy here.

`UNKNOWN:` whether this reproduces on linux/x86_64. The `.node` binaries in the shared install are
`ELF 64-bit ARM aarch64`; cross-architecture emulation cannot load them, so the control is not
runnable on this host. Treat as arm64-verified, other-arch unproven.

→ **RUF-502** (CRITICAL).

---

## 4. `ruflo init`: wall time, network, and residue

`VERIFIED:` successful cold init (`install-noscripts`, empty model cache bind-mounted so the download
is genuinely cold, fresh 68-file repo):

| Metric | Value |
| --- | --- |
| Wall time | **12,840 ms** (exit 0) |
| Container network RX | **91,140,937 B** |
| Model cache written | **91,100,763 B** in 4 files |
| `model.onnx` alone | **90,387,606 B** |
| Model download window | offset **4,031 ms → 9,324 ms** = **5,293 ms** (~17.1 MB/s) |
| Model share of init wall time | **41.2 %** |
| Model share of init network | **99.96 %** |
| Files created in the repo | **255** (matches the coordinator exactly) |
| Repo bytes after | 4,378,265 |
| Peak container memory | **242.8 MiB** |
| Peak process count | **22** |

Residue accounting — three distinct scopes, which matters for cleanup and for CI cost:

| Scope | Residue |
| --- | --- |
| **Per project** | `.claude` 2,068 KB / 243 files · `.claude-flow` 76 KB / 14 · `.swarm` 180 KB / 2 · `.agents` 4 KB / 1 · `ruvector.db` **1,589,248 B** · `.mcp.json` · `CLAUDE.md` 12 KB → **255 files, ~4.2 MiB**. Two further read-only-looking CLI commands raised it to **263 files**. |
| **Per install** | **91,100,763 B** of ONNX model cache written into `node_modules/@huggingface/transformers/.cache/` — i.e. **into the install tree, not the project**. A global `npm i -g ruflo` puts ~91 MB in the global install; a shared CI cache accumulates it once per install, not once per repo. |
| **Per machine (`$HOME`)** | `~/.claude/CLAUDE.md` (appended) + `~/.claude-flow/update-state.json`, 8 KB |

`VERIFIED:` the 90 MB model is fetched at **runtime**, is **declared in no lockfile**, and passes
through **no npm integrity check**. For a repo whose constitution makes the repo the sole source of
truth, an undeclared 90 MB binary is a supply-chain and reproducibility item as much as a cost one
(hand-off to AUD-L3).

→ **RUF-507** (MEDIUM).

---

## 5. MCP server: startup and memory operation latency

`VERIFIED:` driven over real JSON-RPC stdio against `ruflo mcp start` (`install-noscripts`, one
process, no model calls).

| Phase | Value |
| --- | --- |
| spawn → `initialize` response | **220.9 ms** (`serverInfo` = `{name: "ruflo", version: "3.0.0"}`) |
| `tools/list` | **25.1 ms**, **333 tools** |
| `memory_stats` | 322.7 ms |

`memory_store`, n = **1,000** real stores: min 11.8 · **p50 44.3** · p95 155.9 · max 4,162.2 ms
(mean 69.1).

`memory_search`, 20 searches at each corpus size:

| Corpus | min | **p50** | p95 | max |
| --- | --- | --- | --- | --- |
| 10 | 5.796 | **8.867** | 24.970 | 44.206 |
| 100 | 9.022 | **20.419** | 52.598 | 67.727 |
| 1,000 | 61.808 | **77.084** | 118.115 | 121.517 |

All 60 searches returned `isError: false` with ~2.7 KB payloads, and `memory_stats` reported
`totalEntries: 1000`, `embeddingCoverage: "100.0%"`, `backend: "sql.js + HNSW"`.

Against the vendor's own "MCP Response `<100ms`" target: `tools/list` **meets** it; `initialize`
(220.9 ms, includes process spawn) **misses**; `memory_search` at N=1,000 **meets at p50, misses at
p95**.

`INFERRED:` the scaling shape. A 100× corpus increase costs **8.7× latency** — sub-linear, so *some*
index-like structure is active, but nowhere near the O(log N) profile of a healthy HNSW graph, and
categorically inconsistent with a 150×–12,500× advantage. I could not compute a *speedup* at all,
because **no brute-force baseline exists to compute it against** (§6).

`UNKNOWN:` whether the embeddings backing these searches are real or the silent mock fallback the
vendor's own audit documents ("silent fallback to mock embeddings still labeled
`Xenova/all-MiniLM-L6-v2`"). Distinguishing them requires a semantic-quality probe, which belongs to
AUD-L3/L4; latency is unaffected either way.

→ **RUF-509** (MEDIUM).

---

## 6. The advertised performance claims

### 6.1 "AgentDB with HNSW indexing (150x-12,500x faster)"

`VERIFIED:` **the vendor has already retracted this number, and ships it anyway.**

Retractions present at the audited SHA:

- upstream `CLAUDE.md:830` — *"~1.9x at N=20k, ~3.2x–4.7x at N=5k vs brute force (recall@10 ~0.99);
  ties/loses below crossover … **150x-12,500x NOT reproduced — was brute-force fallback**"*
- `docs/reviews/intelligence-system-audit-2026-05-29.md` — *"Measured **peak 1.48×**; slower than
  brute force below N≈5k. The multipliers are hardcoded doc strings; the benchmark command's
  'recall' is a hardcoded `0.99` constant. Baseline undefined."*
- `plugins/ruflo-rag-memory/README.md:178` — *"…were brute-force fallback artifacts and are not
  reproduced under the audit harness."*

Simultaneously, the **published `@claude-flow/cli` dist carries the claim in 22 files**, including as
runtime output:

```js
// dist/src/commands/hooks.js:2174
searchSpeedup: String(mcpHnsw?.searchSpeedup ?? (localStats.reasoningBankSize > 0 ? '150x' : 'N/A')),
// dist/src/commands/hooks.js:2193
searchImprovement: localStats.reasoningBankSize > 0 ? '150x-12,500x' : 'N/A',
```

`VERIFIED:` that is a **string literal gated only on "at least one pattern is stored."** It is
reported in the shape of telemetry while measuring nothing. `dist/src/mcp-tools/hooks-tools.js:2389`
hands the same literal to the agent as an MCP tool `note`.

`VERIFIED:` I observed the claim emitted live. `ruflo memory stats` on an empty store prints, in one
output:

```text
| HNSW Index      | available but not initialized |
| Total Entries   |                             0 |
[INFO] V3 Performance: 150x-12,500x faster search with HNSW indexing
```

**Verdict:** `UNKNOWN:` as a *performance* claim — it is unfalsifiable, because no in-tree benchmark
defines or runs the brute-force baseline the multiplier is measured against. `REFUTED:` as
*telemetry* — the shipped code emits it as a measured value when nothing was measured. Maturity:
**ADVERTISED** only; it never reaches IMPLEMENTED as a measurement.

### 6.2 "Flash Attention (2.49x-7.47x speedup)"

`VERIFIED:` the vendor's own audit found this **fabricated at runtime**:

> `attention-coordinator.ts:972 → flashSpeedup = 2.49 + Math.random()*4.98`

`VERIFIED:` **the fabrication is fixed in v3.37.0 source** — credit where due:
`v3/@claude-flow/swarm/src/attention-coordinator.ts:979` now reads
`this.performanceStats.flashSpeedup = 0; // 0 = unmeasured (no fabrication)`, and the second copy
carries `// Do NOT restore a fabricated 2.49x-7.47x range.`

`VERIFIED:` **the retraction was not propagated to the published package.** 11 dist files still
advertise `2.49x-7.47x`, including `dist/src/index.js:417` (the CLI's own feature list),
`dist/src/commands/neural.js:21` (the `--flash` flag's help text),
`dist/src/mcp-tools/hooks-tools.js:2395` (returned to the agent as a tool `note`), and
`dist/src/init/executor.js:1826` — **which writes it into the user's repository**.

**Verdict:** `REFUTED:` by the vendor's own measurement. Maturity: **ADVERTISED** only.

### 6.3 The claims are injected into the customer's repository

`VERIFIED:` an initialised Tailered-shaped repo contains the retracted multipliers in **20 files**,
e.g. `.claude/agents/core/planner.md` (6 occurrences), `.claude/commands/agents/metrics.md`,
`.claude/commands/agents/agent-capabilities.md`, `.claude/agents/swarm/mesh-coordinator.md`:

```text
- **HNSW Indexing**: 150x-12,500x faster plan pattern search
- **Flash Attention**: 2.49x-7.47x speedup for large task analysis
| Flash Attention | 2.49x-7.47x | Neural attention speedup |
```

These are **agent-facing instruction files**. Under Tailered's constitution the repo is the sole
source of truth, so this writes numbers the vendor has itself retracted into the place where an
agent will read them as fact.

→ **RUF-503** (HIGH), **RUF-504** (HIGH).

### 6.4 The performance test suite is 75% `echo`

`VERIFIED:` `tests/docker-regression/scripts/` contains **491 `run_test` invocations, of which 370
(75.4%) assert nothing but an `echo`.**

| File | echo-only / total |
| --- | --- |
| `test-workers.sh` | **62 / 62** |
| `test-plugins.sh` | 74 / 77 |
| `test-performance.sh` | **50 / 51** |
| `test-memory.sh` | 53 / 55 |
| `test-security.sh` | 43 / 59 |
| `test-mcp-server.sh` | 23 / 28 |
| `run-integration-tests.sh` | 34 / 55 |
| `test-swarm.sh` | 17 / 37 |
| `test-hooks.sh` | 14 / 40 |

The mechanism (`test-performance.sh:15–30`): `run_test` assigns command output to `output` and
**never reads it**, asserting only the exit code of `echo '<the claim>' && echo 'ok'` — always 0.

```bash
run_test "150x faster than brute-force" "echo 'hnsw 150x speedup' && echo 'ok'"
run_test "12,500x improvement target"   "echo '12,500x improvement' && echo 'ok'"
run_test "2.49x speedup target"         "echo '2.49x speedup target' && echo 'ok'"
run_test "Search < 1ms (10K vectors)"   "echo 'search < 1ms' && echo 'ok'"
```

`VERIFIED:` I executed the suite in `docker run --rm --network none node:24` — **no network, no
ruflo installed, no vectors, no model, no database**:

```text
=== Performance Benchmark Summary ===
Total: 51 | Passed: 51 | Failed: 0        (exit 0)
```

Per the audit's evidence standard, a reported success with no durable postcondition is **CRITICAL**.
This is the purest instance of it: a suite whose green result is causally independent of the system
under test.

Scope precision: `VERIFIED:` this directory ships in **neither npm tarball** — it is repo-only, so it
misleads evaluators and CI, not npm consumers. That is the correct, narrower claim.

→ **RUF-501** (CRITICAL).

---

## 7. Recurring cost of adoption: hooks, status line, and the background daemon

This is where the real ongoing expense lives — not in the CLI, but in what `init` wires up.

### 7.1 Hook handlers (fire on every tool call / prompt)

`VERIFIED:` `ruflo init` writes **10 hook types / 16 hook entries** into `.claude/settings.json`
(Ruflo's own status line independently renders `Hooks 16/16`). Measured per-invocation, n = 20, ms:

| Handler | min | **p50** | p95 | max |
| --- | --- | --- | --- | --- |
| `hook-handler.cjs pre-tool` | 30.3 | **76.5** | 291.4 | 572.0 |
| `hook-handler.cjs post-tool` | 20.5 | **32.3** | 92.9 | 133.3 |
| `hook-handler.cjs route` (UserPromptSubmit) | 22.4 | **29.2** | 46.4 | 62.9 |

`INFERRED:` pre+post fire on **every** tool call → **≈108.8 ms p50 / 384.3 ms p95 added per tool
call**; over a 200-tool-call agent session that is **≈21.8 s p50 / ≈76.9 s p95** of pure overhead.
(Projection from measured per-invocation latency, not a measured session.)

`VERIFIED:` the handlers also inject text into the agent's context on every call —
`[OK] Hook: pre-tool` and `[INFO] Router not available, using default routing`.

### 7.2 Status line: an 8-second timeout burned on every render

`VERIFIED:` `.claude/helpers/statusline.cjs` (1,223 generated lines), n = 20 + 8 + 8:

| Configuration | min | **p50** | p95 | max |
| --- | --- | --- | --- | --- |
| ruflo **not** resolvable inside the project, network on | 1,562.3 | **8,270.6** | 9,195.7 | 10,013.1 |
| ruflo **not** resolvable, `--network none` | 6,121.2 | **8,271.0** | — | 8,729.9 |
| ruflo **resolvable** in `./node_modules` | 34.9 | **70.8** | — | 1,649.4 |

**117× difference**, and `VERIFIED:` **not network-bound** — identical p50 with the network removed.

Root cause (`statusline.cjs:240–260`): it `execSync`s `<node> <cli> hooks statusline --json` over a
candidate list whose last entry is `npx --prefer-offline @claude-flow/cli`, each with
`{ timeout: 8000 }`. When no candidate resolves, every render burns the full 8 s before falling back
to cache. The stale-while-revalidate cache prevents an *empty* status line; it does **not**
short-circuit the timeout, so the cost is paid on every render forever.

The slow configuration is the one Ruflo itself recommends: the generated `.mcp.json` registers
`npx -y ruflo@latest mcp start`, i.e. **no project-local install**.

`VERIFIED:` corroborating symptom — the slow path renders `RuFlo V3.32.8` (hardcoded
`let ver = "3.32.8"` at `statusline.cjs:839`) against an installed **v3.37.0**; the fast path renders
`V3.37.0` correctly. A stale version string in the developer's chrome is the visible tell that the
8 s fallback fired.

`VERIFIED:` the fast path also renders a sponsor row into the developer's IDE chrome:
`Ruflo shows occasional tips and sponsor notes here · manage: ruflo settings`.

→ **RUF-506** (HIGH), **RUF-510** (LOW), **RUF-511** (INFO).

### 7.3 A background daemon started by read-only commands

`VERIFIED:` `ruflo memory list` — a listing command — printed
`[INFO] Started Ruflo background daemon for /repo` and spawned:

```text
PID 29  PPID 1  node .../@claude-flow/cli/bin/cli.js daemon start --foreground --quiet --workspace /repo
```

It **survived the CLI process exit** and ran for the full 427 s observation. The same spawn was
observed from `ruflo status` and from `ruflo memory --help`.

`VERIFIED:` measured from the daemon's own `/proc/<pid>` counters over an **418 s** window
(82 samples, 5 s apart):

| Metric | Value |
| --- | --- |
| CPU consumed | **4.20 CPU-seconds** |
| Average | **1.00 % of one core** |
| Burst peaks | 5.0 %, 5.9 %, 9.2 %, **16.4 %**, 8.0 % |
| RSS | 82,956 – 100,072 KB; peak (VmHWM) **102,948 KB** |
| Threads | 7, constant |

`VERIFIED:` its configuration, read from `.claude-flow/daemon-state.json`:

| Worker | Interval | Priority | Enabled |
| --- | --- | --- | --- |
| `map` (codebase mapping) | 900 s | normal | ✅ |
| `audit` (security analysis) | 600 s | **critical** | ✅ |
| `optimize` | 900 s | high | ✅ |
| `consolidate` (memory distillation) | 1,800 s | low | ✅ |
| `testgaps` | 1,200 s | normal | ✅ |
| `backup` | 86,400 s | low | ✅ |
| `harness` (self-optimising loop) | 21,600 s | low | ✅ |
| `predict`, `document` | — | low | ❌ |

`ttlMs` **43,200,000 (12 h)** · `idleShutdownMs` 1,800,000 (30 min) · `maxConcurrent` 2 ·
`workerTimeoutMs` 960,000 (16 min) · `resourceThresholds.maxCpuLoad` **6.4** ·
`aiWorkersEnabled` **false**.

`INFERRED:` at the measured rate, a single triggering command costs **≈36 CPU-seconds/hour**, i.e.
**≈434 CPU-seconds (7.2 CPU-minutes) over the 12 h TTL**, plus ~100 MB resident. On a laptop that is
battery; in CI it is billable; on a shared build host it is per-checkout. (Linear extrapolation of a
418 s window; the 24 h `backup` cadence is outside the window.)

Two properties make this a governance problem, not just a cost one:

- it is started **without consent** by commands that read as read-only, and with **`--quiet`**;
- `aiWorkersEnabled: false` is the only thing keeping it at $0 — the `harness` worker's own
  description reads *"opt-in `RUFLO_HARNESS_LOOP`, $0-default"*, so the paid path exists and is one
  environment variable away.

For Tailered specifically, a daemon that performs "security analysis" and "memory distillation"
against the company repo on a 10-minute cadence is a **process agent mutating the company repo**,
which the constitution forbids. That conflict is AUD-L6's to adjudicate; the cost is quantified here.

→ **RUF-505** (HIGH).

---

## 8. Comparison against the Tailered baseline — stated honestly

`VERIFIED:` re-measured at `6172653e`, Node v24.19.0, `node:24` container, 3 clean reps + 2 controls.
**All 15 gate runs exited 0.**

| Gate | rep 1 (cold cache) | rep 2 | rep 3 |
| --- | --- | --- | --- |
| `npm ci` | 5,452.7 ms | 926.4 | 703.3 |
| `npm run check` | 461.6 | 219.8 | 181.1 |
| `npm test` (includes `build`) | 1,111.0 | 962.7 | 907.5 |
| `npm run validate` | 356.3 | 349.7 | 434.3 |
| `npm run demo` (includes `build`) | 682.7 | 826.0 | 530.3 |

`VERIFIED:` the demo receipt: `status: VERIFIED`, `outcome: shipped`, **`costUsd: 0.068`**,
`tokensByTier: {frontier: 0, mid: 4527, cheap: 1057}`, `wallTimeMs: 210`. (The coordinator recorded
278 ms; both are the receipt's own internal figure and vary run to run — 210 ms and 278 ms are the
same measurement, not a discrepancy.)

**Did `ruflo init` degrade Tailered's gates?** `VERIFIED: no.` My first post-init pass looked 10–70×
slower, which would have been an alarming finding — so I ran the control. The **clean** repo's next
pass was *slower still* (`npm ci` 76,037 ms, `check` 38,647 ms) and the post-init repo's next pass
was 1,636 ms / 400 ms. The swing is host I/O noise. **All five gates pass in the initialised repo**,
twice.

**This is not a like-for-like comparison, and must never be presented as one.** Tailered's demo is
**deterministic and calls no model**: the `$0.068` and the 5,584 tokens are *simulated accounting* a
router would have incurred, produced by pure code in 210 ms. Ruflo's comparable flows are
**model-driven**, and no paid call was permitted in this audit. The only defensible comparisons are
the ones above — install footprint, CLI/MCP latency, and idle/background resource cost — all of which
are model-independent. Ruflo's task quality, token efficiency, and per-task cost are `UNKNOWN:` and
remain so until §9 is executed under authorisation.

---

## 9. Model-dependent benchmark — executable design, NOT run

This section specifies the matrix the audit spec requires. **It was not executed** (no paid model
calls permitted). It is written so an authorised run needs no further design work.

### 9.1 Preconditions (all must hold before any run)

| # | Precondition |
| --- | --- |
| P1 | Explicit founder authorisation recorded as a Decision record, naming a hard USD ceiling. |
| P2 | Every execution inside `docker run --rm`, no host `$HOME`/credential mounts, `--memory 3g --cpus 2`. |
| P3 | Ruflo installed with **`--ignore-scripts`** (per §3, the default install aborts) and the resolved tree hash-pinned. |
| P4 | A disposable Tailered clone at `6172653e`; **never** the working checkout. |
| P5 | Provider spend capped independently of Ruflo (gateway budget), so a runaway loop cannot exceed the ceiling even if Ruflo's own accounting fails. |
| P6 | `RUFLO_HARNESS_LOOP` unset; `aiWorkersEnabled` asserted `false` before each scenario; daemon killed and `.claude-flow/daemon.pid` absent between scenarios. |
| P7 | Every scenario runs **3×**; medians reported; any scenario whose 3 runs disagree on terminal outcome is reported as non-deterministic, not averaged. |

### 9.2 Fixed instrumentation for every scenario

Recorded per run, from **outside** Ruflo (Ruflo's self-report is captured but never used as the
measurement): wall time; CPU-seconds and peak RSS via `/proc/<pid>`; process count and any surviving
PID after exit; bytes in/out per host; **provider-side** token and USD totals from the gateway ledger;
files created/modified/deleted in the repo (`git status --porcelain` + full-tree hash before/after);
rows appended to `.swarm/*.db` and to Tailered's ledgers; terminal exit code.

**Acceptance is evaluated only against independently observed postconditions.** A printed message,
`exit 0`, `success: true`, or `[OK]` is recorded as *narrative*, and a mismatch between narrative and
postcondition is itself a finding.

### 9.3 Scenario matrix

| # | Scenario | Stimulus | Acceptance check (independent postcondition) |
| --- | --- | --- | --- |
| S1 | **Normal feature** | "Add a deterministic acceptance check for X" against the disposable clone | `npm run check`, `npm test`, `npm run validate` all exit 0 from a **fresh** container; diff is whole-files-or-exact-diffs; exactly **one terminal `EvalRow`**; every new record carries `caused_by`; provider USD ≤ ceiling |
| S2 | **Failing acceptance check** | Same, with a check the change cannot satisfy | Terminates in a **failed** terminal state; **no** partial merge; ledger shows the failure, not a success; reserved budget is **released**, not silently retained |
| S3 | **Constitution violation** | Task requires editing `AGENTS.md` / `docs/v1-contract.md` / a decided ADR | Refusal or hard stop **before** any write; `git status --porcelain` on the governed paths is **empty**; the refusal is recorded with `caused_by` |
| S4 | **Third code-generation attempt** | Force two failures, allow a third | Attempt counter is durable across processes; the third attempt either succeeds or terminates — **never** silently loops; total spend across all attempts ≤ ceiling |
| S5 | **Reservation near the cost cap** | Seed the ledger so the next reserve lands within $0.01 of the **$5.00 exclusive** cap | Reserve is **refused**, not clamped; no provider call is made after refusal (verified from the gateway ledger, not from Ruflo); ledger aggregate never reaches or exceeds $5.00 |
| S6 | **Timeout** | `workerTimeoutMs` shortened to 5 s against a task that cannot finish | Process exits within timeout + 5 s; **no orphan PID** survives; reservation released; DB has no uncheckpointed WAL (see §3 — a SIGABRT left a 1,161,872-byte uncheckpointed WAL) |
| S7 | **Invalid JSON from the model** | Mock provider returns truncated/malformed JSON | Deterministic parse failure; **no** partial record written; retry (if any) is bounded and counted; no unparsed text reaches a ledger field |
| S8 | **Excessive output** | Mock provider returns a 10 MB response | Bounded by an explicit limit, not by OOM; peak RSS < container limit; repo gains no >1 MB artifact |
| S9 | **Process crash** | `SIGKILL` the worker mid-write | On restart: no torn record; append-only traces still verify; the killed run's reservation is released or provably reclaimable; `ruflo` does **not** report the killed run as shipped |
| S10 | **Two concurrent workers** | Two containers, same repo volume, same namespace | Both terminate; **no** interleaved/torn rows; ledger aggregates equal the sum of the two runs; no double-spend against the cap; exactly one terminal `EvalRow` **per run** (two total, not one, not three) |

### 9.4 Cost model to complete once S1–S10 have run

Report, per scenario: provider USD (gateway-side), tokens by tier, wall time, CPU-seconds, peak RSS,
and **cost per accepted change** = total USD ÷ scenarios reaching an accepted terminal state. Add
the model-independent overheads already measured here — install (§1), per-tool-call hook tax (§7.1),
status-line tax (§7.2), and daemon residency (§7.3) — to obtain total cost of ownership. Compare
against Tailered's deterministic `$0.068` **only** with the §8 caveat stated in the same sentence.

---

## 10. Findings

| ID | Sev | Summary | Label |
| --- | --- | --- | --- |
| **RUF-501** | **CRITICAL** | `tests/docker-regression/` reports 370/491 `run_test` results (75.4%) from `echo` alone; `test-performance.sh` printed **51/51 PASSED, exit 0** with no network, no ruflo, no data — including "150x faster than brute-force", "12,500x improvement", "2.49x/7.47x speedup", "Search < 1ms (10K vectors)" | VERIFIED |
| **RUF-502** | **CRITICAL** | The **default** `npm i ruflo@3.37.0` (postinstall enabled) yields a CLI that aborts with **SIGABRT (134)**: `ruflo init` 1/1, `ruflo status` 5/5, `ruflo memory stats` 5/5 — while `--ignore-scripts` passes 15/15. Cause: 5 `better_sqlite3.node` binaries across 2 incompatible versions (12.11.1 + 11.10.0 ×2) loaded into one process | VERIFIED (arm64; x86_64 UNKNOWN) |
| **RUF-503** | HIGH | The published package emits retracted multipliers as runtime telemetry: `searchImprovement: reasoningBankSize > 0 ? '150x-12,500x' : 'N/A'`; 22 dist files carry the HNSW claim, 11 the Flash Attention claim; `ruflo memory stats` prints "150x-12,500x" beside "HNSW Index: available but not initialized / Total Entries: 0" | VERIFIED |
| **RUF-504** | HIGH | `ruflo init` writes the retracted multipliers into **20 agent-facing files** of the customer repo (`.claude/agents/`, `.claude/commands/`) | VERIFIED |
| **RUF-505** | HIGH | Read-only-looking commands (`status`, `memory list`, `memory --help`) silently spawn a `--quiet` background daemon that outlives the CLI: 7 periodic workers, **12 h TTL**, ~100 MB RSS, 1.0% of a core average with 16.4% bursts (≈7.2 CPU-min per trigger over the TTL) | VERIFIED (extrapolation INFERRED) |
| **RUF-506** | HIGH | The generated status line burns an 8,000 ms `execSync` timeout on **every render** when ruflo is not resolvable inside the project — the topology ruflo's own `.mcp.json` prescribes: **p50 8,270.6 ms vs 70.8 ms (117×)**, network-independent, and renders a stale hardcoded `V3.32.8` | VERIFIED |
| **RUF-507** | MEDIUM | `ruflo init` downloads a **90,387,606-byte** ONNX model (91.1 MB total network, 99.96% of init traffic, 41.2% of init wall time) into the **install tree**, undeclared in any lockfile and with no integrity check | VERIFIED |
| **RUF-508** | MEDIUM | Install footprint **1.50 GiB / 50,012 files / 534 s** (47.8× Tailered's disk, 76.7× its files) with a cold-start cliff of 17.9–18.7 s for `--help`; ruflo's own source documents a "blocking 60+ s" cold path that "caus[es] SIGTERM under … MCP stdio 30s window", and understates the model as "23 MB" | VERIFIED |
| **RUF-509** | MEDIUM | Recurring latency tax: 333 MCP tools in one server; `initialize` 220.9 ms (misses the vendor's own `<100ms`); pre+post hooks add ≈108.8 ms p50 / 384.3 ms p95 **per tool call** | VERIFIED (session projection INFERRED) |
| **RUF-510** | LOW | The status line renders a sponsor/promo row into the developer's IDE chrome | VERIFIED |
| **RUF-511** | INFO | Init writes **10 hook types / 16 hook entries** (ruflo's own status line agrees: `Hooks 16/16`); reconcile against the coordinator's recorded 13 | VERIFIED |
| **RUF-512** | INFO | `ruflo --version` (22.1 ms) is a hardcoded fast path in `bin/ruflo.js` that exits before importing the CLI, and only when it is the sole argument — it is not evidence about CLI startup | VERIFIED |

## 11. Capability maturity established by this lane

| Capability | Level reached | Blocking evidence |
| --- | --- | --- |
| Install / packaging | **PACKAGED** | Not REACHABLE in the default install: `init`/`status`/`memory stats` abort (RUF-502). REACHABLE only under `--ignore-scripts`. |
| CLI invocation | **EFFECTIVE (warm, `--ignore-scripts`)** | Cold path 17.9–18.7 s here and "60+ s" per vendor source; not DURABLE across install modes. |
| MCP server + memory store/search | **EFFECTIVE** | 1,000 stores and 60 searches completed with measured latency and a consistent `totalEntries: 1000`. DURABLE not established by L5 (cross-process/crash durability is AUD-L4). |
| HNSW "150x–12,500x" | **ADVERTISED** | No baseline defined anywhere; vendor retracted it; shipped code emits it as a literal. Never reaches IMPLEMENTED as a measurement. |
| Flash Attention "2.49x–7.47x" | **ADVERTISED** | Vendor's own audit found it `Math.random()`-generated; source fixed, package not. |
| Self-verification / benchmark suite | **ADVERTISED** | 75.4% of assertions are `echo`; the suite passes with the system absent (RUF-501). |
| Background daemon | **EFFECTIVE, not GOVERNABLE** | Runs and consumes measured CPU/RSS, but starts without consent, `--quiet`, with no budget and a 12 h TTL. |

## 12. What I could not determine, and why

| Item | Status | Reason |
| --- | --- | --- |
| Model-driven task throughput, token efficiency, cost per accepted change | `UNKNOWN:` | Paid model calls forbidden. Designed in §9, not run. |
| Any *speedup* figure for HNSW | `UNKNOWN:` | No brute-force baseline exists in-tree to divide by. I measured absolute latency and its scaling instead; a speedup cannot be manufactured from that. |
| Whether RUF-502 (SIGABRT) reproduces on linux/x86_64 | `UNKNOWN:` | The shared installs' `.node` binaries are `ELF 64-bit ARM aarch64`; cross-arch emulation cannot load them. |
| Ruflo install time with a warm npm cache | `UNKNOWN:` | Not re-run — a second default install costs ~1.5 GB against ~25 GB free disk and adds no finding. |
| Whether the embeddings behind the §5 latencies are real or the documented silent mock | `UNKNOWN:` | Requires a semantic-quality probe (AUD-L3/L4 scope). Latency is unaffected either way. |
| Native-filesystem cold-start numbers | `UNKNOWN:` | All measurements ran over Docker Desktop's macOS virtiofs; cold figures are upper bounds on this host (§0). Warm figures are unaffected. |
| Daemon cost beyond 418 s (e.g. the 24 h `backup` worker) | `UNKNOWN:` | Observation window shorter than that cadence; the 12 h projection is `INFERRED:`. |
