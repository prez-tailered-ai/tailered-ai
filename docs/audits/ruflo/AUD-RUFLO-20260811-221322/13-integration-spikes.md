<!-- audit: {"audit_id":"AUD-RUFLO-20260811-221322","tailered_sha":"6172653e0aca0981d0abaf4ad8e9d587667737e9","ruflo_release":"v3.37.0","ruflo_sha":"6ce18b5a7fcd4939a2f72c2e3b8fdbdec660e5a9","generated":"2026-08-11T23:00:00Z","evidence_class":"VERIFIED","lane":"AUD-L7a","caused_by":["AUD-RUFLO-20260811-221322/01-audit-charter.md"]} -->

# 13 — Integration spikes

Each section is written by a separate spike lane and merged by the coordinator. This lane
(`AUD-L7a`) owns Spike A only.

## Spike A — Process-agent adapter

### What was built and what was proved

A minimal Tailered process agent lives at
`docs/audits/ruflo/AUD-RUFLO-20260811-221322/spikes/process-agent-adapter/`. It takes one JSON
`AgentRequest` on stdin and returns exactly one JSON `AgentResponse` on stdout. No file outside
that directory was created or modified; no Tailered runtime file was touched.

The spike answers one question — *can an external process orchestrator be attached to Tailered's
agent seat without breaking Tailered's invariants* — and it answers it by measurement. Every
postcondition below was read back independently of the process under test: repository hashes
recomputed with Tailered's own `hashDirectory`, filesystem inventories walked directly, `ps`
tables sampled from the driver, and heartbeat timestamps written by the subject process to a file
the driver reads afterwards. No exit code, log line, `[OK]`, or self-report was accepted as
evidence of a postcondition.

All execution was inside `docker run --rm` on `node:24` (`linux/arm64` unless noted), with the
shared 1.5 GB install mounted read-only at `/rf`, an isolated `HOME`, and no host credential path
mounted. **No provider credentials exist in these containers**, so the default engine is a
deterministic local mock, and every claim about what a model *would produce* is `INFERRED`. What
is `VERIFIED` is the boundary: where processes write, what they inherit, what survives
cancellation, and what Tailered accepts.

Evidence roots for this section:

- `S =` `.../spikes/process-agent-adapter/`
- `S/results/` — every recorded run, verbatim
- `TA =` `/tmp/aud-ruflo-20260811/tailered-ai-audit/` (Tailered at `6172653e`)

### Capability maturity established

| Capability | Level reached | Blocking evidence gap |
| --- | --- | --- |
| Tailered `ProcessAgent` accepts a third-party agent binary | **EFFECTIVE** | — (27/27 boundary cases behaved as the code specifies) |
| A bounded adapter can contain Ruflo's filesystem side effects | **EFFECTIVE** | — (`ruflo init` contained: repo hash unchanged, 313 entries in the disposable sandbox) |
| Ruflo can serve as a Tailered *implementation* seat | **REACHABLE only** | no credentials; no ruflo invocation has yet produced a Tailered payload. Nothing above REACHABLE is claimed |
| Tailered's agent boundary is *safe* for an untrusted orchestrator | **NOT REACHED** | four structural defects below (RUF-710, RUF-713, RUF-715, RUF-716); the boundary confines nothing today |
| Cost/token accounting across the boundary | **IMPLEMENTED** | usage is self-reported by the agent and cross-checked by nothing (RUF-714) |
| Model/provider identity across the boundary | **ADVERTISED** | `AgentResponse` has no field for it (RUF-712) |

### The boundary as the code actually defines it

`TA/src/agent.ts:56-103` is the whole contract. `spawn(command, args, {shell:false,
stdio:["pipe","pipe","pipe"], signal: AbortSignal.timeout(timeoutMs)})`, resolve on `close` with
code 0, reject on invalid JSON, non-zero exit, or stdout above 5 MB, then
`validateAgentResponse` requires `payload` plus integral non-negative `usage.input`/`usage.output`
and a finite non-negative `usage.costUsd`.

Three things are conspicuously **absent** from that `spawn` call, and all three are load-bearing:
no `cwd`, no `env`, and no kill escalation. Section H below measures what each absence costs.

### Adversarial boundary results

27 cases, `S/results/boundary-results.json`. Every case behaved exactly as the source specifies —
there were no surprises in Tailered's *implementation*. The surprises are all in what the
specification permits.

| Case | Input | Result |
| --- | --- | --- |
| `A1` | adapter, mock engine | `{payload, usage:{input:261, output:236, costUsd:0.000433}}` accepted |
| `A2` | same request twice | byte-identical responses — no hidden state |
| `A3` | two adapter invocations | repo hash `2b3fb864…` unchanged |
| `A4` | provenance | `provider_actual: local.mock`, `model_actual: mock-mid-1.0` ≠ requested `mid-available` |
| `B1`–`B7` | 7 malformed stdin shapes | adapter exits 64/65/70 with **empty stdout** in all 7 |
| `C1` | prose banner then valid JSON | `ValidationError: Agent returned invalid JSON` |
| `C2`/`C3` | missing `usage` / missing `payload` | rejected |
| `C4` | `input: 12.5`, `costUsd: -0.01` | `Agent usage is invalid.` |
| `C5` | valid JSON, exit 7 | `Agent process failed (exit 7)` — **payload discarded** |
| `D1` | 8 MB stdout | `Agent stdout exceeded 5 MB.` after 24 ms |
| `D2` | same child, 4 s later | child confirmed dead |
| `E1` | agent that never answers, `timeoutMs: 2000` | `AbortError` at 2 018 ms |
| `E2` | child that traps SIGTERM | **survives**; still in `ps` after the abort |
| `F1` | `costUsd: 812.5` in one response | **accepted** by `ProcessAgent` |
| `F2` | same usage settled | `AccountingInvariantError` from `ReserveSettleBudget` |
| `G1` | `product/../decisions/ADR-000.md` | **written**; accepted ADR-000 and `AGENTS.md` overwritten |
| `G2` | same payload, adapter guard | refused |
| `H1` | agent that writes to its CWD | **repo hash changed**; `AGENT_WAS_HERE.txt` created in the repo |
| `J1` | `{files: []}` with 904 tokens billed | **accepted** as a successful codegen |
| `I1` | request keys | no projection field present |

### Decisive experiment 1 — orphaned processes

`S/experiments/orphan/`, results in `S/results/orphan-results.json`.

`ProcessAgent` cancels by killing the direct child. A process agent that starts a worker — which
is precisely what a swarm orchestrator, an MCP daemon, or an ONNX worker pool is — leaves that
worker behind.

**`ORPHAN-1` (VERIFIED).** The agent spawned a detached worker and hung. Tailered aborted at
2 513 ms with `AbortError`. The worker emitted **11 further heartbeats**, the last **4 803 ms
after the rejection**, never received `SIGTERM`, and appeared in the container process table
reparented to init:

```
   21     1    21 Ssl  00:07 /usr/local/bin/node .../grandchild.mjs
```

What Tailered leaks, exactly: every descendant of the agent process other than the agent itself,
holding whatever file handles, sockets, database locks, and memory it held at abort time. Tailered
has no process group, no `pgid` tracking, and no reaper. It also never escalates: `E2` shows a
child that merely *ignores* `SIGTERM` outlives the abort too, because there is no `SIGKILL`
follow-up anywhere in `TA/src/agent.ts`.

**`ORPHAN-2` (VERIFIED) — the more serious result.** The agent wrote a valid response and exited 0
within milliseconds, but left a worker that had inherited fd 1. `timeoutMs` was 4 000 ms.
`invoke()` returned **`ok: true` after 45 338 ms** — eleven times its own timeout, with no error.

The mechanism was isolated in `S/experiments/probe-abort-mechanism.mjs`
(`S/results/abort-mechanism.json`, Node v24.19.0):

| Case | Events |
| --- | --- |
| child exits at 276 ms, grandchild holds fd 1 until 3 000 ms, `timeout 800 ms` | `exit` @276 ms, `close` @3 133 ms — **no `AbortError` at all** |
| control: child hangs, `timeout 800 ms` | `error AbortError` @804 ms, `exit SIGTERM` @808 ms |

Node removes the abort listener once the child emits `exit`, and `ProcessAgent` resolves only on
`close`, which waits for the stdio pipes to drain. So **`timeoutMs` does not bound the call** — it
bounds only the direct child's lifetime. Any surviving descendant holding stdout or stderr keeps
`invoke()` pending indefinitely, with the abort already disarmed. Against a long-lived daemon this
is an unbounded hang, and an unbounded hang means the run never appends its terminal `EvalRow` —
the invariant "every started run appends exactly one terminal `EvalRow`" is violated by silence
rather than by a wrong row.

**`ORPHAN-3` (VERIFIED) — the fix works.** The same worker, started through the adapter's
`spawnSandboxed` (detached, tracked pgid) and cancelled by the adapter's own 2 500 ms deadline:
`invoke` failed at 2 601 ms under a 20 000 ms Tailered timeout, **zero heartbeats after the
deadline**, `ps` empty, and the adapter's stderr surfaced verbatim inside Tailered's
`ValidationError` (`reaped process group 50 with SIGKILL`). Containment belongs to the adapter,
because Tailered cannot do it.

### Decisive experiment 2 — the MCP-mode trap

`S/experiments/mcp-trap/`, results in `S/results/mcp-trap-results.json`.

`ruflo@3.37.0` `bin/ruflo.js:53-55`:

```js
const isExplicitMCP = cliArgs.length >= 1 && cliArgs[0] === 'mcp'
                      && (cliArgs.length === 1 || cliArgs[1] === 'start');
const isMCPMode = !process.stdin.isTTY && (process.argv.length === 2 || isExplicitMCP);
```

`ProcessAgent` always spawns with `stdio:["pipe","pipe","pipe"]`, so `process.stdin.isTTY` is
`undefined` in **every** Tailered-spawned agent and `!isTTY` is permanently true. The TTY term can
never protect a Tailered integration; only argv can. MCP mode is therefore entered whenever
`args` is empty, or `args[0] === "mcp"` and `args[1]` is absent or `"start"`.

**What actually happens (VERIFIED, and it corrects my prior expectation).** I expected a hang.
Measured instead:

| Case | argv after the binary | Elapsed | Outcome |
| --- | --- | ---: | --- |
| `MCP-TRAP-1` | `[]` | 460 ms | `ValidationError: Agent response must include payload and usage.` |
| `MCP-TRAP-2` | `["mcp","start"]` | 146 ms | same |
| `MCP-TRAP-3` | `["--version"]` | 50 ms | `Agent returned invalid JSON: … "ruflo v3.37.0\n"` |

`ProcessAgent` calls `child.stdin.end(input)`, and the MCP stdio server treats EOF as shutdown, so
it exits 0 rather than hanging. Before exiting it emits, on stdout:

```json
{"jsonrpc":"2.0","error":{"code":-32600,"message":"Invalid Request: missing method"}}
```

That is **well-formed JSON**, so `JSON.parse` succeeds and the run reaches
`validateAgentResponse`, which rejects it only because it lacks `payload` and `usage`. The trap is
narrower than a hang but sharper than it looks: the failure is a *schema* failure one field away
from acceptance, on a channel whose framing (JSON-RPC) is structurally compatible with the one
Tailered parses. A future MCP error envelope that happened to carry those two key names would be
accepted as an agent response.

The cost of the trap is not the 460 ms. `TA/src/ship.ts:204-219` settles the **full projection
ceiling** on any agent failure — 20 000 tokens and $0.10 of the $5.00 cap for the `mid` tier — then
raises `AttemptsHaltError`, halting the run.

Raw capture, `MCP-TRAP-4`: with stdin left **open** (not the `ProcessAgent` shape) the same server
was still running when sampled at 20 020 ms, having emitted 86 bytes, logging
`[claude-flow-mcp] … Starting in stdio mode` on stderr. Combined with `ORPHAN-2`, an MCP server
started as a *descendant* of an agent — rather than as the agent itself — is exactly the
unbounded-hang shape.

**Required argv.** Any adapter that shells out to ruflo must build argv through a guard that
refuses both trapping shapes (`S/lib/ruflo-argv.mjs`):

```js
safeRufloArgv("swarm", ["run", "--json"]);   // -> ["swarm","run","--json"]
safeRufloArgv("mcp", ["start"]);             // -> throws
```

Minimum rule: **argv must be non-empty and `argv[0]` must not be `"mcp"`.** Pointing
`ProcessAgentConfig.command` at `ruflo` with `args: []` is the single-line mistake that produces
a fully-billed, halted run and a JSON-RPC document masquerading as an agent response.

### The repository-mutation hazard, measured

`TA/src/agent.ts:63-67` passes neither `cwd` nor `env`. The agent therefore inherits the
orchestrator's working directory — which is the company repository whenever the founder runs
`tailered ship --repo .` — and the orchestrator's entire environment.

**`H1` (VERIFIED).** A trivial agent wrote `AGENT_WAS_HERE.txt` into `/repo` and reported back
`{"cwd":"/repo","visible_secret_env_names":["SPIKE_FAKE_API_KEY"]}`. The repository hash changed
from `2b3fb864…` to `3c678f1d…` while `invoke()` returned success.

**`CWD-4` (VERIFIED) — the same hazard with the real tool.** `ruflo init` invoked *as a Tailered
agent* (`S/results/init-as-agent-results.json`), CWD inherited as the company repo:

- the call **failed**: `Agent process failed (SIGABRT)`, a native assertion inside
  `better_sqlite3.node`'s `Statement::~Statement()`, after 1 089 ms;
- and the repository was **mutated anyway**: `repo_mutated: true`, **309 paths added** —
  `.claude/`, `.claude-flow/`, `.mcp.json`, `.swarm/` including a 172 032-byte `.swarm/memory.db`;
- the operator's `HOME` also gained `~/.claude-flow/update-state.json`.

A failed, crashed agent call left 309 files in the company repository, and Tailered's failure path
records the crash while remaining structurally unaware that the repo it is about to hash, commit,
and evaluate is no longer the repo it snapshotted. `evals`, `decisions/`, `labels/` and the run's
context snapshot are all computed over a directory a third-party process is free to edit
mid-run.

`CWD-1`–`CWD-3` show the hazard is not uniform: `ruflo status`, `memory store` and `swarm status`
each exited non-zero without writing (`RuFlo is not initialized in this directory`). The
destructive surface is concentrated in `init` and in whatever runs after it.

**Architecture split (VERIFIED, `S/results/arch-init-comparison.txt`).** The crash is specific to
the *default* install on arm64:

| Install tree | Arch | `ruflo init` | Directory left behind |
| --- | --- | --- | --- |
| `--ignore-scripts` | arm64 | exit 0 | full init incl. `CLAUDE.md`, `ruvector.db`, `.agents/`, modified `.gitignore` |
| default (postinstall ran) | arm64 | **exit 134 (SIGABRT)** | **partial**: `.claude/`, `.claude-flow/`, `.mcp.json`, `.swarm/` only |
| default | x64 (emulated) | exit 0 | full init, but `agentdb.rvf` + `agentdb.rvf.lock` instead of `ruvector.db` |

The recommended installation is the one that aborts on Apple-silicon-class hardware, and it aborts
*after* writing, leaving a half-initialised directory with no cleanup and no error the caller can
act on beyond a native stack trace. The same command also produces **different on-disk artifacts
per architecture**, which any hash-based integrity check would read as drift.

### The containment demonstration

`CONTAIN-1` (`S/results/contained-ruflo-results.json`) runs the identical `ruflo init` through the
adapter: engine cwd set to the ephemeral sandbox, env sealed, argv guarded, child detached.

- `repo_mutated: **false**` — repository hash identical before and after;
- all **313** entries landed under `/out/sandboxes/tpa-f94O2U/{context,work}`;
- the SIGABRT was reported honestly as `{how:"closed", exit_code:null, signal:"SIGABRT"}` inside
  a valid Tailered response, rather than being swallowed;
- `provenance.model_actual` was reported as `UNKNOWN(requested=mid-available)` — the honest answer
  for a non-LLM invocation;
- no residual ruflo or claude-flow processes.

The adapter cannot fix the boundary for agents that do not use it. What it demonstrates is that
containment is *achievable* at this seam, and that all of it must live on the agent side of the
pipe, because Tailered supplies none of it.

### Findings

Severity reflects the Tailered invariant at risk. `PRE-EXISTING TAILERED` marks defects in
Tailered at `6172653e` that exist with or without Ruflo; `RUFLO` marks Ruflo behaviour. Attributing
one to the other would be wrong in both directions.

| id | sev | class | summary |
| --- | --- | --- | --- |
| RUF-710 | CRITICAL | PRE-EXISTING TAILERED | `product/` confinement is a textual prefix test; `product/../decisions/ADR-000.md` overwrites an accepted ADR |
| RUF-713 | CRITICAL | PRE-EXISTING TAILERED | `ProcessAgent` passes no `cwd`/`env`; agents inherit the company repo and every secret in the environment |
| RUF-715 | CRITICAL | PRE-EXISTING TAILERED | `timeoutMs` does not bound `invoke()`; a descendant holding stdout disarms the abort and hangs the run unboundedly |
| RUF-720 | HIGH | RUFLO | `ruflo init` as an agent mutated the repo with 309 paths **on a call that crashed with SIGABRT** |
| RUF-716 | HIGH | PRE-EXISTING TAILERED | cancellation kills only the direct child, never escalates past `SIGTERM`, and leaks the whole descendant tree |
| RUF-717 | HIGH | RUFLO | `ruflo` with empty argv under piped stdin becomes an MCP server and answers with a JSON-RPC error that parses as JSON |
| RUF-712 | HIGH | PRE-EXISTING TAILERED | `AgentResponse` carries no model or provider identity; "model identity only from `tailered.config.json`" is unverifiable at the boundary |
| RUF-714 | HIGH | PRE-EXISTING TAILERED | `usage` is agent-asserted and cross-checked by nothing; a lying agent controls the ledger |
| RUF-721 | HIGH | RUFLO | default install aborts (exit 134) on arm64 leaving a partial init; artifacts differ by architecture |
| RUF-711 | MEDIUM | PRE-EXISTING TAILERED | `AgentRequest` omits the projection; the agent is never told the ceiling it is measured against |
| RUF-718 | MEDIUM | PRE-EXISTING TAILERED | a failed call writes `usage.input = projection.maxTokens` into the append-only trace as if measured |
| RUF-719 | MEDIUM | PRE-EXISTING TAILERED | `{files: []}` is a valid, billable codegen success |
| RUF-722 | LOW | PRE-EXISTING TAILERED | agent stderr is captured but discarded on success; a successful call has no diagnostic channel |

#### RUF-710 — `product/` confinement is textual (CRITICAL, PRE-EXISTING TAILERED)

`TA/src/ship.ts:557-568` guards with `if (!file.path.startsWith("product/"))`, then resolves with
`resolveRepoPath`, which rejects escapes from the **repository root** only
(`TA/src/files.ts:16-32`). `product/../decisions/ADR-000.md` satisfies the prefix test, resolves
inside the root, and `writeAtomic`'s `rename` overwrites the target.

Executed with Tailered's own exported `resolveRepoPath` and `writeAtomic` against a scratch
repository (`G1`): `decisions/ADR-000.md` and `AGENTS.md` were both replaced by agent-supplied
content. That defeats "accepted decisions are immutable", "humans own intent", and the
constitution itself in one payload, and every subsequent critique reads the replaced
constitution. Fix: normalise before comparing, and confine to `product/` rather than to the root
(`S/lib/payload-guard.mjs` shows the three-line form; `G2` confirms it refuses the same payload).

#### RUF-713 — agents inherit CWD and environment (CRITICAL, PRE-EXISTING TAILERED)

Evidence `H1`, `CWD-4`. The v1 contract's "an external process agent must not mutate the company
repo" is enforced by nothing. Fix: pass an explicit `cwd` (a scratch dir, never the repo) and an
explicit allow-listed `env` in the `spawn` call at `TA/src/agent.ts:63`.

#### RUF-715 — the timeout does not bound the call (CRITICAL, PRE-EXISTING TAILERED)

Evidence `ORPHAN-2` (45 338 ms under a 4 000 ms timeout, returning success) and
`S/results/abort-mechanism.json`. Fix: race the child promise against an independent
`setTimeout` owned by the caller, and do not rely on `AbortSignal` surviving child exit.

#### RUF-714 — usage is asserted, not measured (HIGH, PRE-EXISTING TAILERED)

`F1`: `{input: 4000000, output: 900000, costUsd: 812.5}` is contract-valid. The budget catches it
only because it exceeds the reservation (`F2`); an agent under-reporting usage is caught by
nothing, and the ledger, the `EvalRow`, and the $5.00 cap all derive from the agent's own
numbers. AGENTS.md line 33 says deterministic code calculates money and tokens; at this boundary
it transcribes them.

#### RUF-718 — fabricated usage on the failure path (MEDIUM, PRE-EXISTING TAILERED)

`TA/src/ship.ts:207-216` records `usage: {input: projection.maxTokens, output: 0}` and
`costUsd: projection.maxCostUsd` in an append-only `AgentCallTrace` after any failure. The
direction is conservative (it over-bills), and `status: "failed"` marks it, but a projection is
written into a field named `usage` in an immutable record. Every MCP-trap run above burned 20 000
notional tokens this way for a 460 ms JSON-RPC error.

### What I could NOT determine, and why

- **Anything about Ruflo's output quality, model routing, or agent reasoning.** No credentials
  exist in the audit containers by design. Every model-dependent statement is `INFERRED`; no
  ruflo invocation in this lane produced a Tailered payload, so the "Ruflo as an implementation
  seat" capability stops at REACHABLE.
- **Whether the arm64 SIGABRT occurs on native x86_64 hardware.** It did not occur under x64
  emulation, which is strong but not identical evidence; `UNKNOWN` for bare-metal x86_64.
- **Whether a long-running ruflo mode leaves a daemon under `ProcessAgent`.** `MCP-TRAP-1`/`2`
  left no residual processes because `stdin.end()` shuts the server down; whether `swarm`/`hive`
  modes do differs by subcommand and could not be exercised without credentials and an
  initialised project. The `ORPHAN-2` mechanism means any such mode would hang the run
  unboundedly — `INFERRED`, and the highest-value follow-up for a lane with an initialised
  fixture.
- **Whether Ruflo's hooks (10 hook types / 13 entries written by `init`) can re-enter the
  repository during an agent call.** Out of this lane's scope; it interacts directly with RUF-713
  and should be tested against a repo-hash tripwire.
- **Real concurrency.** Every measurement here is a single agent call. Two agents sharing an
  inherited CWD, `.swarm/memory.db`, or `agentdb.rvf.lock` is a separate lane's question.
