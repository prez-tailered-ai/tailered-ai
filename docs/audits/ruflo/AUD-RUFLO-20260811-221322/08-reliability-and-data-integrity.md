<!-- audit: {"audit_id":"AUD-RUFLO-20260811-221322","tailered_sha":"6172653e0aca0981d0abaf4ad8e9d587667737e9","ruflo_release":"v3.37.0","ruflo_sha":"6ce18b5a7fcd4939a2f72c2e3b8fdbdec660e5a9","generated":"2026-08-11T23:00:00Z","evidence_class":"MIXED","lane":"AUD-L4","caused_by":["AUD-RUFLO-20260811-221322/01-audit-charter.md"]} -->

# 08 — Reliability, persistence, and data integrity (lane AUD-L4)

Every stateful claim below was checked by an **independent postcondition read from a separate
process** — host `sqlite3`, host `md5`/`md5sum`, `strings`, `find`, `python3`, or a full-filesystem
`grep` run from a shell that is not Ruflo. Where Ruflo's own output is quoted it is quoted as the
*claim under test*, never as the evidence.

Machine-readable record: `evidence/test-results.json` (38 scenarios; 12 PASS, 21 FAIL, 3 PARTIAL,
1 FAIL-LOUD-BUT-MISLEADING, 1 NOT-REPRODUCED).

---

## 0. Verdict

**Ruflo's memory persistence is NOT DURABLE. It is durable only when a native `better-sqlite3`
binary loads successfully at runtime; in every other environment it accepts writes, reports
`[OK] Data stored successfully`, exits 0, and discards the data with no error of any kind.**

The failure is not confined to an exotic configuration. It was reproduced in **four** distinct
environments, including one built from the *fully native, postinstall-ran* install directory:

| Environment | Native `better-sqlite3` loads? | `memory store` says | Independent read | Verdict |
|---|---|---|---|---|
| `install-default` on `node:24` (glibc) | yes | `[OK]`, exit 0 | row present | **durable** |
| `install-default` on `node:24-alpine` (musl) | **no** | `[OK]`, exit 0 | **nothing; DB md5 unchanged** | **total loss** |
| `install-noscripts` (`npm i --ignore-scripts`) | no | `[OK]`, exit 0 | **nothing; DB md5 unchanged** | **total loss** |
| `install-nooptional` (`npm i --omit=optional`) | no | `[OK]`, exit 0 | **nothing** | **total loss** |

The same install directory that persists correctly on glibc loses every write on musl. Backend
selection is a silent runtime `try/catch` on native module load, so **a working Ruflo installation
becomes a silent data-loss installation with no version change, no config change, no warning, and
no change in exit code.**

Ruflo's own initialization self-check reports `Verification passed (6/6 tests)` in exactly this
state, because the check writes and reads the *same in-memory image* and never re-opens the file
from disk.

---

## 1. Memory durability across process boundaries — the central test

### 1.1 Native path: PASS (S01)

Container A, `install-default` on `node:24`:

```
memory store --key AUD_L4_SENTINEL --value "RUFLO-L4-DURABILITY-PROBE-7f3a9c21-ZETA"
→ exit 0, "[OK] Data stored successfully", "Vector: Yes (384-dim)"
```

Container A was destroyed. Container B — a **brand-new container with a fresh `HOME`** — read it
back verbatim, exit 0.

Independent confirmation (host `sqlite3`, never Ruflo):

```
entry_1786488210609_ca9b4d0e38fa2ade|AUD_L4_SENTINEL|default|
RUFLO-L4-DURABILITY-PROBE-7f3a9c21-ZETA|semantic|384|unknown|active|1786488210629
```

`strings memory.db | grep -c 7f3a9c21-ZETA` → `1`.

**VERIFIED — storage backend actually used:** SQLite, file `.swarm/memory.db`, `journal_mode=wal`,
34 tables, written by native `better-sqlite3` 12.11.1 vendored under
`node_modules/agentdb/node_modules/better-sqlite3`. Embeddings are real:
`embedding_model = Xenova/all-MiniLM-L6-v2`, 384 dimensions, a genuine float vector.
Semantic search returned the sentinel at score 0.71 (S15).

### 1.2 Degraded paths: total silent loss (S02–S06)

`install-nooptional`, `install-noscripts`, and `install-default`-on-Alpine all announce
`✅ Using sql.js (WASM SQLite, no build tools required)` — an **advertised, supported fallback**,
not an error state — and then lose everything.

**The decisive measurement (S04)** removes all interpretation. In one container, with the DB file
hashed by a separate shell command immediately before and after the store:

```
md5 BEFORE : fd4c18546b2355b801019c3414b2f496
store       : exit 0, "[OK] Data stored successfully"
md5 AFTER  : fd4c18546b2355b801019c3414b2f496      ← byte-identical
grep -rl "MECHANISM-PROBE-4d1e77-KAPPA" /  (whole container filesystem)
            → zero files
```

The value exists nowhere on disk. It was never written to any file, temp file, journal, or cache.

Reproduced against a copy of the **coordinator's already-`ruflo init`ed Tailered repository**
(S06): md5 `77851703116d7332230222d5662894df` before and after, 0 rows, `[OK]` reported.

Ruflo's own reader agrees with the independent reader — which is what makes this data *loss*
rather than a read-path bug: `memory retrieve` in a fresh container returns
`[WARN] Key not found` (exit 1) and `memory list` returns `[WARN] No entries found` (exit 0).

### 1.3 Root cause (VERIFIED by code read + reproduction)

1. `@claude-flow/cli/dist/src/memory/memory-bridge.js :: getDb()` takes its handle from
   `registry.getAgentDB().database`.
2. When `better-sqlite3` cannot be `require`d, `agentdb/dist/src/db-fallback.js` supplies a
   **sql.js (WASM) database that lives entirely in the WASM heap**.
3. That wrapper persists **only** in `save()`, which is called only from `close()`
   (`db-fallback.js:380-395`). Its one `setInterval` is a *statement-leak warning* timer, not an
   autosave (`db-fallback.js:272-276`).
4. The bridge never calls `save()` or `close()`. Nothing flushes. The process exits.
5. `storeEntry` returns `{success: true, guarded: true, cached: true, attested: true}` and the CLI
   prints `[OK] Data stored successfully` with exit 0.

A `wal_checkpoint(PASSIVE)` *is* attempted after each write, and on the sql.js path it throws
`Invalid PRAGMA command` — but it sits inside `catch { /* non-WAL, busy, or unsupported —
non-fatal */ }` (`memory-bridge.js:895-906`). The one signal that something is wrong is printed to
stderr and then explicitly discarded.

There is a guard in this code — `#2735` refuses an unsafe sql.js whole-image write **when
`-wal`/`-shm` sidecar files exist**. That is why the read-only test (S11) fails loudly. In a repo
that has never had a native writer there are no sidecars, the guard does not fire, and the write is
accepted and dropped. The guard covers the corruption case and misses the data-loss case.

---

## 2. The self-check cannot detect it (S07)

`memory-initializer.js :: verifyMemoryInit` (line 2264) is the source of
`Verification passed (6/6 tests)`. It:

- loads the DB file into **one** in-memory `sql.js` image,
- `INSERT`s a test row into that image,
- `SELECT`s it back **from the same image**,
- writes an embedding into the same image,
- **never calls `db.export()`, never writes the file, never re-opens it in a fresh handle.**

Its read-after-write can only ever pass. It reported 6/6 in S02 and S05 while storage was a
complete no-op, and its own `verification_test` row was itself discarded. `memory stats` compounds
this on the same broken installs by reporting `Provider: Xenova/all-MiniLM-L6-v2`,
`Semantic Search: yes`, and `V3 Performance: 150x-12,500x faster search with HNSW indexing` for a
database containing zero rows (S16).

This is the canonical "Ruflo verifying Ruflo" trap named in the audit charter: the product's own
health signal is structurally blind to its worst failure mode.

---

## 3. Crash, restart, interruption

| Scenario | Behavior | Class |
|---|---|---|
| **SIGKILL mid-write, ×6** (S10) | 5 killed attempts wrote nothing; the 1 that completed persisted; `integrity_check = ok`; **no** stray `.lock`/`.tmp`/`.agentdb.lock`; `-wal` truncated to 0 | **loud, atomic — PASS** |
| **Read-only filesystem** (S11) | exit 1, explicit `[ERROR] … refusing an unsafe sql.js whole-image write … attempt to write a readonly database` | **loud — PASS** |
| **Graceful re-invocation** (S01, S14) | 6 concurrent stores → 6/6 durable, `integrity_check = ok` | **PASS** |
| **`memory store` before `memory init`** (S33) | `[ERROR] Database not initialized`, **exit 1** | **loud — PASS** |
| **Truncated `ruvector.db`** (S12) | Rust panic in `redb-2.6.3 page_manager.rs:243` → `fatal runtime error … aborting`, **exit 133**, for `memory list` *and* `memory store` | **loud but catastrophic — FAIL** |
| **Corrupt `memory.db`** (S13) | `integrity_check` fails; Ruflo lists and **writes into it**, exit 0, **no warning** | **silent — FAIL** |
| **`memory init` on the native path** (S08) | native assertion abort, **exit 133**, no success output — *but the DB was fully and correctly created* | **false failure — FAIL** |
| **`memory stats` on the native path** (S09) | same abort, **exit 133**, reproducible on a clean repo — output never produced | **FAIL** |

Two of these deserve emphasis.

**`ruvector.db` is a single point of total failure.** `ruflo init` writes a 1.5 MB `redb` binary
into the **repository root**. Truncating it to 4 KB makes *every* memory command abort — including
purely read-only ones — with a Rust panic that names neither the file nor a recovery path. There is
no surviving command that can repair it. A partial clone, an LFS misconfiguration, an interrupted
write, or an editor touching a binary file in the repo root is enough.

**The native path aborts at interpreter teardown on linux/arm64.** `Statement::~Statement()` in
`better_sqlite3.node` calls `node::RemoveEnvironmentCleanupHook` after the environment is gone:

```
node[1]: void node::RemoveEnvironmentCleanupHook(...) at ../src/api/hooks.cc:142
Assertion failed: (env) != nullptr
 3: Statement::~Statement() [/rf/node_modules/agentdb/node_modules/better-sqlite3/…]
```

`memory init` survives it (work already committed — a *false failure*), `memory stats` does not
(output never reached). Both exit 133. Scope caveat: observed on **linux/arm64, Node v24.19.0**;
whether x64 is affected is **UNKNOWN** (the prebuilt binary in the shared install is arm64, so an
amd64 container could not exercise the same artifact).

---

## 4. Workflow and autopilot persistence

### 4.1 Autopilot — checkpointing is real (S20)

`.claude-flow/data/autopilot-state.json` and `autopilot-log.json` are written with
`writeFileAtomic`. Across **three separate processes** the iteration counter advanced 1 → 2 → 3 and
`history` grew to 3 entries; a later run reached `iteration 4/4`, then
`ALLOW STOP: Max iterations (4) reached`, then `ALLOW STOP: Autopilot disabled`.
**A terminal state always exists** (all-tasks-done, max-iterations, timeout, disabled).

**But the completion signal fails open (S21).** Writing malformed JSON into the task source
produced:

```
ALLOW STOP: No tasks discovered from any source     (exit 0)
```

— byte-identical to the genuinely-empty case, and `autopilot status` reports `Tasks: 0/0 (100%)`.
For a feature whose headline claim is *"keeps agents working until ALL tasks are done"*, **a
corrupt work queue silently means "done", at 100%.**

Autopilot does not execute tasks; it is a stop-hook gate that re-engages the agent. It keeps no
effect ledger, so **duplicate-effect safety on resume is entirely delegated** to a `status` field
in a task file that the agent itself writes. Ruflo provides no idempotency guarantee here.

### 4.2 Workflow — state persists, the read path is broken (S22–S25)

`workflow run -t development --task "probe task"` exits 0, prints a workflow ID and a stage table,
and **does** write `.claude-flow/workflows/store.json`:

```json
"status": "running", "currentStep": 0, "steps": [{"status": "pending"}]
```

Nothing then executes and no terminal status is written. Two runs left **two permanent zombie
`running` records** for processes that no longer exist.

Those records are invisible by default:

```
workflow list  →  [INFO] No workflows found      (exit 0, with 2 records in store.json)
```

Root cause read from the shipped code and confirmed empirically: `commands/workflow.js:276-278`
sends `status: status || 'all'`, and `mcp-tools/workflow-tools.js` applies it as a literal equality
filter `w.status === input.status`. The sentinel `'all'` can never match a real status.
`workflow list --status running` returns exactly 1 — proving the store is readable and the *default
view* is the defect. That view then renders with an empty ID, empty Template, `undefined%`, and
`Invalid Date`, because the tool returns `workflowId`/`createdAt` while the table declares columns
`id`/`template`/`progress`/`startedAt`.

`workflow stop <id>` does write a proper terminal state (`status: failed`, `steps[0]: skipped`,
`error: "Stopped by user"`, `completedAt`) — but only for an ID the operator already knows, since
the inventory command will never show it to them.

**UNKNOWN, stated explicitly:** no model credentials exist in these containers, so no workflow or
autopilot run performed real LLM-driven work. Whether a *credentialed* run writes step-level
progress, and whether a resume re-executes completed external effects, was **not determined** and
must not be inferred from the above. What *is* determined: a checkpoint file exists, a terminal
state is reachable only via an explicit `stop`, and the run path itself never writes one.

---

## 5. Accounting integrity — the decisive section for Tailered invariants 11–14

Because `policy budget set` refuses in any non-TTY context (below), the accounting semantics were
measured by driving the shipped `policy-runtime.js` directly from a Node probe — i.e. the same
library the product ships, with the CLI's interactive gate bypassed.

### 5.1 What works (S26, S28, S32)

- The budget **is a genuine pre-decision check**: `engine.js :: applyBudget` runs *before* the
  allow, `consumeBudget` after. A single `costUsd: 1000` request against a `$5` cap was **denied
  pre-flight**.
- Usage **is durable across processes**. Three separate `node` processes accumulated
  4.000000000000002 → 4.899999999999999 → 4.999999999999998 in `.claude-flow/policy/state.json`,
  and the 51st and 52nd calls were denied with `budget-exceeded:cap5`.
- Unmetered actions **fail closed**: an action with no `costUsd` is denied with
  `budget-metering-required:cap5:costUsd`.
- Receipts are **hash-chained and tamper-evident** (`verifyLedger` → `{"valid":true,"length":10}`),
  with optional HMAC signing.

### 5.2 What does not (S27, S29, S30, S31)

**The component that actually spends money never consults the budget.**
`headless-worker-executor.js` — which spawns the model-backed workers — contains **zero**
references to the policy engine (`grep` for `evaluatePolicyRequest`, `authorizeMcpTool`, `policy`:
no matches). Cost arrives **after the fact**, parsed out of the result envelope at line 371:

```js
costUsd: numOrUndef(obj.total_cost_usd ?? obj.cost_usd ?? obj.totalCostUsd)
```

The single policy call site is `mcp-client.js:234`, for outbound MCP tool calls, and its attributes
come from `classifyMcpTool()`, which returns `{actionType, network, destructive, namespaceAccess}`
and **never** `costUsd`. Combined with the correct fail-closed rule in §5.1, this means that
configuring a cost budget in enforce mode would deny *every MCP tool call* as unmetered while still
not gating model spend at all.

**There is therefore no reserve-and-settle and no hard pre-spend ceiling.** Ruflo can *report*
spend after it happens; it cannot *prevent* it.

**The ledger is floating-point USD, not integer micro-dollars.** `consumeBudget` does
`usage.costUsd += request.action.costUsd ?? 0` on JS numbers. Forty `$0.10` charges produced
`4.000000000000002`; the final total against a `$5.00` cap settled at `4.999999999999998`. The
enforced ceiling is approximate, and the error is signed and accumulates. This directly violates
the Tailered invariant that deterministic code owns money.

**Out of the box there is no ceiling at all.** The state Ruflo writes unprompted is:

```json
{"version":1,"mode":"legacy","rules":[],"budgets":[],"usage":[],"approvals":[],"receipts":[]}
```

`engine.js` ranks modes `legacy=0, observe=1, enforce=2`, and every budget violation returns
`enforcedOutcome: 'allowed'` unless `mode === 'enforce'`. Default = no budgets, non-enforcing.

**And the ceiling cannot be configured in automation.** `commands/policy.js:18` requires
`process.stdin.isTTY && process.stdout.isTTY`; both a plain container run and `docker run -t` were
refused with `[ERROR] policy administration requires an interactive local terminal`, and
`state.json` was verified unchanged. The intent — preventing an agent from raising its own
budget — is sound. The consequence is that the only cost control Ruflo has is unreachable from CI,
containers, provisioning scripts, and headless agent sessions. *(Whether it succeeds under a real
pty is **UNKNOWN** — no pty was available in this harness.)*

Finally: the budget state, the usage counters, and the receipt chain all live in a repo-local JSON
file writable by the same agent they govern. Compared with Tailered's `ReserveSettleBudget`
(integer micro-dollars, hard pre-reservation, exclusive $5.00 cap), Ruflo's mechanism is a
plausible *observability* layer and **not** an enforcement boundary.

---

## 6. Unrequested durable side effects (S18, S19, S34, S35, S36)

Every `memory` subcommand — including read-only ones — prints
`[INFO] Started Ruflo background daemon for /repo` and spawns a daemon that schedules **7 recurring
workers** (`map` 15m, `audit` 10m, `optimize` 15m, `consolidate` 30m, `testgaps` 20m, `backup` 24h,
`harness` 6h; TTL 12h, idle shutdown 30m). There is no prompt, no flag, and no `--no-daemon` on the
store command. It creates, in the repository:

`.claude-flow/daemon.pid`, `.claude-flow/daemon-state.json`, `.claude-flow/logs/daemon.log`,
`.claude-flow/metrics/codebase-map.json`, `.claude-flow/policy/state.json`, `ruvector.db` (repo
root) — plus `$HOME/.claude-flow/update-state.json` outside the repo.

This is a direct conflict with the Tailered invariant that **an external process agent must not
mutate the company repo**: reading memory mutates it.

Smaller integrity defects in the same area:

- `daemon-state.json` persists `"running": true` with a stale PID after the process dies. The
  reader liveness-checks the PID and correctly says `STOPPED`, so it is contained — but it is a
  durable false statement, and PID liveness is unreliable across container/host boundaries.
- `.claude-flow/memory-package.json` bakes an **absolute host path** into a repo file:
  `{"distPath":"/rf/node_modules/@claude-flow/memory/dist/index.js"}`.
- Two databases are created — `.swarm/memory.db` and `.claude/memory.db`, byte-identical at
  creation (`Synced to: /repo/.claude/memory.db`), after which only `.swarm` is maintained.
- The `metadata` table records `sql_js|true` **even when native `better-sqlite3` performed the
  writes** — the database's own record of which engine wrote it is wrong, which is precisely the
  field a post-incident investigation of the data-loss bug would consult.
- `memory --help` teaches `memory store -k "key" -v "value"`, but `-v` binds to `--verbose`; the
  value survives only as a positional and the command silently switches into DEBUG mode. A value
  beginning with `-` would be consumed as a flag.

---

## 7. Capability maturity established by this lane

Ladder: ADVERTISED → IMPLEMENTED → PACKAGED → REACHABLE → EFFECTIVE → DURABLE → GOVERNABLE.

| Capability | Level reached | Blocking level, and why |
|---|---|---|
| Memory store/retrieve (native `better-sqlite3`, glibc) | **DURABLE** | Not GOVERNABLE: durability is environment-conditional with no runtime assertion, and the DB's own backend metadata is wrong. |
| Memory store/retrieve (sql.js/WASM fallback) | **REACHABLE** | Fails EFFECTIVE. Writes are accepted, reported successful, and discarded (S02–S06). |
| Memory durability self-verification | **REACHABLE** | Fails EFFECTIVE. Cannot observe the failure it exists to catch (S07). |
| Semantic / vector search (native) | **DURABLE** | Real 384-dim MiniLM embeddings; score 0.71 on the sentinel (S15). |
| Semantic / vector search (fallback) | **ADVERTISED** | Reports `Semantic Search: yes` over an empty store (S16). |
| `memory backup` | **DURABLE** | Snapshot independently opened: `integrity_check = ok`, 8 rows matching live (S17). The cleanest result in the subsystem. |
| Crash atomicity (native) | **DURABLE** | SIGKILL ×6 left no partial rows, no residue, valid DB (S10). |
| Corruption detection / repair | **not IMPLEMENTED** | Corrupt DB used silently (S13); truncated `ruvector.db` aborts every command with no repair path (S12). |
| `memory stats` / `memory init` (native, linux-arm64) | **REACHABLE** | Fails EFFECTIVE — native assertion abort, exit 133 (S08, S09). |
| Autopilot checkpoint + terminal state | **DURABLE** | Persists across processes; terminal states reached (S20). |
| Autopilot completion correctness | **REACHABLE** | Fails EFFECTIVE. Corrupt queue ⇒ `ALLOW STOP` at 100% (S21). |
| Workflow checkpoint write | **EFFECTIVE** | Not DURABLE as a *system*: run path never writes a terminal state; zombie `running` records persist (S22). |
| Workflow inventory (`workflow list`) | **REACHABLE** | Fails EFFECTIVE. Default filter can never match; rendering is broken (S23, S24). |
| Workflow resume / duplicate-effect safety | **UNKNOWN** | Requires model credentials; not executed. Explicitly not inferred. |
| Cost/token accounting (mechanism) | **DURABLE** | Pre-check, cross-process persistence, hash-chained receipts (S26, S32). |
| Hard pre-spend ceiling on model spend | **not IMPLEMENTED** | The spender never consults the engine; cost is post-hoc (S31). |
| Cost ceiling configurability in automation | **REACHABLE** | Fails EFFECTIVE — TTY-gated, default `legacy`/no budgets (S29, S30). |

---

## 8. Findings

| ID | Severity | Summary |
|---|---|---|
| **RUF-401** | **CRITICAL** | sql.js/WASM fallback accepts memory writes, prints `[OK] Data stored successfully`, exits 0, and discards them entirely. DB file byte-identical before/after; value absent from the whole filesystem. Reproduced on `--ignore-scripts`, `--omit=optional`, `node:24-alpine` with the fully-native install, and on a Tailered repo copy. |
| **RUF-402** | **CRITICAL** | `verifyMemoryInit` reports `Verification passed (6/6 tests)` in exactly that state: it writes and reads one in-memory sql.js image and never re-reads from disk. |
| **RUF-403** | **HIGH** | Backend selection is a silent runtime try/catch. The same install directory persists on glibc and loses everything on musl, with no error, no warning, no exit-code change. |
| **RUF-404** | **HIGH** | `memory stats` (and `memory init`) abort with a native assertion in `better_sqlite3.node`, exit 133, on the default install / linux-arm64 / Node 24. `stats` output is never produced; `init` reports failure after succeeding. |
| **RUF-405** | **HIGH** | A truncated `ruvector.db` (a 1.5 MB binary Ruflo writes into the **repo root**) causes an unrecoverable Rust panic that aborts every memory command, including read-only ones. No file named, no recovery path, no surviving repair command. |
| **RUF-406** | **HIGH** | No hard pre-spend ceiling: `headless-worker-executor.js` never calls the policy engine; cost is parsed post-hoc from the result envelope. The only gated surface (`mcp-client.js`) never supplies `costUsd`. |
| **RUF-407** | **MEDIUM** | Budget ledger accumulates IEEE-754 float USD (`4.000000000000002`, `4.999999999999998`) rather than integer micro-dollars. |
| **RUF-408** | **MEDIUM** | Default policy is `mode: legacy` with zero budgets (violations recorded, not enforced), and `policy budget set` refuses in any non-TTY context — unconfigurable from CI, containers, or headless sessions. |
| **RUF-409** | **MEDIUM** | Autopilot treats an unreadable/malformed task source as "no tasks" → `ALLOW STOP` at `0/0 (100%)`. Fail-open completion. |
| **RUF-410** | **MEDIUM** | No integrity validation: Ruflo lists from and writes into a SQLite file whose `integrity_check` fails, with no warning. |
| **RUF-411** | **MEDIUM** | Every `memory` subcommand silently spawns a background daemon with 7 recurring workers and writes 6 files into the repository plus one into `$HOME`. Reading memory mutates the repo. |
| **RUF-416** | **MEDIUM** | The `metadata` table records `sql_js=true` even when native `better-sqlite3` did the writing — wrong provenance in the exact field an incident investigation would use. |
| **RUF-417** | **MEDIUM** | `workflow run` writes a `status: "running"` checkpoint, executes nothing, and never writes a terminal state — permanent zombie records. |
| **RUF-418** | **MEDIUM** | `workflow list` can never list anything: the CLI passes the sentinel `'all'` as a literal equality filter. With an explicit `--status` the table renders empty ID/Template, `undefined%`, `Invalid Date` (column-key mismatch). |
| **RUF-412** | **LOW** | `.claude-flow/memory-package.json` bakes an absolute host path (`/rf/node_modules/...`) into a repo file. |
| **RUF-413** | **LOW** | `daemon-state.json` persists `"running": true` + a stale PID after process death (contained: the reader liveness-checks). |
| **RUF-414** | **LOW** | Two databases created (`.swarm/memory.db`, `.claude/memory.db`), identical at creation, only one maintained. |
| **RUF-415** | **INFO** | `-v` binds to `--verbose`, not `--value`; the tool's own `--help` example teaches the ambiguous form and silently enables DEBUG output. |
| **RUF-419** | **INFO (INFERRED)** | Ruflo's own source documents that agentdb silently falls back to **mock random-vector embeddings** when its transformers path fails, and ships a monkey-patch that itself depends on `ruvector` — a package absent from `--omit=optional`. Not reproduced: on those installs nothing persists at all. |

---

## 9. Implications for the Tailered invariants

- **"Repo is sole source of truth; an external process agent must not mutate the company repo."**
  Violated by construction (RUF-411): a read-only memory query starts a daemon and writes six repo
  files plus a 1.5 MB binary in the repo root.
- **"Deterministic code owns money/tokens/hashes/timing/ledger aggregates."** Violated (RUF-407):
  float USD accumulation. Not satisfiable by configuration.
- **Reserve-and-settle with a hard exclusive $5.00 cap.** Not achievable with Ruflo as shipped
  (RUF-406): no pre-reservation on the spending path, post-hoc cost, and the ceiling is
  unconfigurable in automation (RUF-408).
- **"Append-only traces; `caused_by` on every record; one terminal `EvalRow` per run."** The memory
  store cannot be trusted as a trace substrate in any environment where the native module does not
  load (RUF-401), and the workflow subsystem does not guarantee a terminal state (RUF-417).

**None of these are Tailered defects.** The Tailered baseline at
`6172653e0aca0981d0abaf4ad8e9d587667737e9` was not modified by this lane; every scenario ran
against throwaway copies under `/tmp/aud-ruflo-20260811/work/lane-L4/`.

---

## 10. What could not be determined, and why

1. **Credentialed workflow/autopilot execution.** No model credentials exist in the containers by
   audit rule. Whether a real run writes step-level progress, and whether resume replays completed
   external effects, is **UNKNOWN**. Static reading established only that a checkpoint file exists,
   that `autopilot` keeps no effect ledger, and that the `workflow run` path writes no terminal
   state.
2. **Whether `policy budget set` succeeds under a genuine pty.** No pty was allocatable from this
   harness (`script` failed: `tcgetattr/ioctl: Operation not supported on socket`). The refusal in
   non-TTY and stdout-only-TTY contexts is VERIFIED; success with a full pty is **UNKNOWN**.
3. **Architecture scope of the `better_sqlite3.node` abort (RUF-404).** Observed on linux/arm64,
   Node v24.19.0. The shared install's prebuilt binary is arm64, so an amd64 container cannot
   exercise the same artifact. x64 behavior is **UNKNOWN**.
4. **Mock-embedding fallback (RUF-419).** Documented in Ruflo's own source; not reproduced, because
   on every install where that path is reachable nothing persists at all, making embedding quality
   unobservable. Labeled **INFERRED**.
5. **sql.js concurrent whole-image overwrite.** The shipped source documents that an unlocked
   concurrent whole-image write "flushes a predecessor image over it and silently drops the new
   row" (`memory-initializer.js` #2878). Not separately reproduced, since that path drops writes
   unconditionally. Native-path concurrency was tested and passed.
