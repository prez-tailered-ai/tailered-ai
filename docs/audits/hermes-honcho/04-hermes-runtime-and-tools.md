# 04 — Hermes runtime and tool system

Companion to `03`. This artifact traces one request end to end and characterises the tool
registry, because those two things determine what a Hermes-derived process agent would
actually do behind Tailered's protocol boundary.

## One turn, ingress to persistence

`agent/conversation_loop.py:run_conversation` (line 1422) is the whole turn.
`run_agent.AIAgent.run_conversation` (`run_agent.py:7895`) is a thin forwarder.

**Prologue** — `agent/turn_context.py:build_turn_context` (:430)

1. Resolve session / task / turn ids. **There is no authenticated end-user identity in the
   core runtime**; caller-supplied strings are the only identity (HA-118). Any multi-user
   deployment must authenticate before this point.
2. Restore or build the cached system prompt (3 tiers: stable / context / volatile).
3. Run idle + preflight compaction.
4. Fire the `pre_llm_call` hook.
5. **Prefetch external memory** — bounded, fails open (see `10`).
6. Stamp the `api_content` sidecar and crash-persist the user row.

**Loop** — doubly nested

- Outer: `while api_call_count < max_iterations and iteration_budget.remaining > 0` (:1634)
- Inner: `while retry_count < max_retries` (:2427)

Per API call, `api_messages` is rebuilt from scratch by structurally cloning every history
message (:1838) and replaying each message's `api_content` sidecar so the wire prefix is
**byte-identical** to what was sent when the message was live (:1883-1897). Cache
breakpoints are re-planned per request and again per retry after failover.

**Tool execution** — segment-planned (`agent/tool_dispatch_helpers.py:116`): maximal
contiguous runs of parallel-safe calls separated by sequential barriers, with reader/writer
path reservations. Concurrent execution (`agent/tool_executor.py:758`) preserves emission
order by writing into **pre-indexed result slots**, and has a start-order gate, an
authorization gate, and a 420 s batch deadline (HA-109).

**Finalize** — `agent/turn_finalizer.py:finalize_turn` (:70): budget-exhaustion summary,
micro-compaction, durable persist, hooks, result assembly, and — after ≥10 tool
iterations — the fork of the autonomous skill writer (see `06`).

### Failure and completion semantics

- 30 `FailoverReason` values, ~14 one-shot in-retry recovery branches guarded by
  `TurnRetryState` flags, ~20 distinct terminal return shapes (HA-112, HA-101).
- Compression fires from five sites under one shared per-turn cap
  (`max_compression_attempts`, default 3), and distinguishes a soft `compression_deferred`
  (lock contention) from `compression_exhausted`, which the gateway treats as a session
  reset (HA-113).
- Session persistence is **fail-closed around tool side effects**: the assistant tool-call
  turn is committed to SQLite before the tools run, so a crash cannot lose the record of an
  effect that already happened (HA-114). This is a genuinely good property.
- **HA-115 (LOW, but important for this audit):** "completion" is *not* verified against
  evidence. It is a heuristic over exit reason, iteration count, and failure flags.

That last point is the sharpest architectural contrast in the entire audit. Tailered's
definition of done is **executable** — `assertGatingDefinitionOfDone` (`src/ship.ts:486-524`)
checks outcome, preview URL, every acceptance test passing, verdict exactly `approve`, no
edit diff, cost below the exclusive cap, wall time under the ceiling, and ≥2 self-written
ADRs, and throws otherwise. Hermes infers completion; Tailered proves it. **Tailered's model
is stronger and must not be weakened by any adoption.**

### Abandonment hazards

- **HA-119 (MEDIUM):** an abandoned concurrent tool batch leaves wedged worker threads
  running **detached** while the turn synthesizes timeout results — side effects can land
  after the turn believes the batch is over.
- **HA-416 (MEDIUM):** interrupt propagation cannot hard-kill; an abandoned child keeps
  running inside the parent process.
- **HA-508 (MEDIUM):** compression deliberately does **not** carry outstanding commitments
  forward. The template has no "Remaining Work" / "Pending User Asks" / "In Progress"
  sections, and the handoff prefix orders the model to *discard* them. An iterative-update
  instruction at `context_compressor.py:4158` still references a section the template no
  longer defines — an unsatisfiable instruction.

For a long autonomous run, HA-508 means the system can forget what it still owed the user
at exactly the moment it compresses.

## The tool registry

`tools/registry.py` (1,002 lines) is populated by ~86 top-level `registry.register(...)`
calls across `tools/*.py`. Discovery is an AST scan for those calls, memoized on disk by
`(mtime_ns, size)`, then `importlib.import_module` — **importing a tool module *is* the
registration mechanism, so any file dropped into `tools/` executes at startup.**

`ToolEntry` carries schema, handler, a `check_fn` availability probe (30 s TTL cache with a
60 s transient-failure grace that keeps a failing tool advertised, HA-219), toolset, and
optional dynamic schema overrides.

`registry.dispatch()` (:801) executes the handler with **no permission, approval, or
enabled-tool check of any kind** — it only normalizes result types and bounds error strings.
Toolset scoping is enforced in the conversation loop (`conversation_loop.py:6370`), not at
dispatch, so alternate dispatch entrypoints do not inherit it (HA-214).

### High-authority surface (HA-220)

**12 registered tools can execute arbitrary code or drive arbitrary host input; 23+ reach
the network.** The principal ones:

| Tool | Authority | Gate |
|---|---|---|
| `terminal` | shell on the host (`bash -l -c`), default backend `local` | `check_all_command_guards` — bypassable per `05` |
| `process(write\|submit)` | arbitrary bytes to a live PTY | **bypasses** command guards (HA-204) |
| `execute_code` | host Python child | **no gate** in interactive CLI (SEC-H-03) |
| `browser_exec` | host Python via browser-use CLI | **no gate at all** (SEC-H-04) |
| `computer_use` | full host mouse/keyboard | **defaults to allow** with no callback (HA-203) |
| `write_file` / `patch` | filesystem | protected-instruction files gated separately and correctly |
| `delegate_task` | child agents in-process | see `06` |
| `cronjob` | scheduled persistence | small regex tripwire only (SEC-H-17) |
| `skill_manage` | writes files that auto-load into future prompts | `write_approval` default **off** |
| MCP tools | whatever the server offers | `trust: full` default → gate is a no-op (HA-207) |

### Execution backends

Seven: `local` (**default**), Docker, SSH, Singularity, Modal, Daytona, Vercel Sandbox.
The README's "runs anywhere" claim is `CONFIRMED`. Note that isolated-container backends
**skip all command approval** (HA-215) on the theory that the container is the boundary —
consistent with `SECURITY.md` §2.2, and correct as long as the operator actually chose a
container backend.

## Cost control: the decisive economic finding

**HA-502 (HIGH): there is no reserve-before-spend anywhere in Hermes.**

The exact path: the API call is made, and **only after it returns** does
`conversation_loop.py:3690` call `estimate_usage_cost(...)` on the response's usage block;
`:3697` adds it to `session_estimated_cost_usd`; `:3743-3759` calls `queue_token_counts(...)`,
which is a deque append handed to a background writer thread
(`hermes_state.py:5791-5833`). **Nothing on this path can deny a call.**

The lane ran exhaustive negative checks: no config key for a monetary budget exists;
`grep` for `spend_cap|budget_usd|max_cost|cost_limit|daily_budget|hard_cap|spending_limit`
returns **zero enforcement sites**; `tools/budget_config.py` is a *character* budget for tool
persistence, not money. Tests: none found asserting a pre-call cost denial, because no such
path exists.

The only hard pre-call ceiling is `IterationBudget` (HA-503) — and
`tools/delegate_tool.py:1655` passes `iteration_budget=None` with the comment "fresh budget
per subagent", so **total work is not bounded by the parent cap**.

Accounting is additionally best-effort (HA-513): `_apply_token_batch` swallows every
exception per delta; `_stop_token_writer` gives the thread 10 s and then explicitly logs
"%d queued delta(s) not persisted"; the call site catches all exceptions and only
`logger.debug()`s them, with the in-code comment "silent loss here is the root cause of
undercounted analytics."

Telemetry compounds it: the OTLP plane carries **only gateway and cron health — zero
LLM-call, token, or cost telemetry** (HA-512).

### Why this is disqualifying for direct adoption

Tailered's fourth operating law is: *"Reserve a hard projected ceiling before each model
call and settle actual usage afterward"* (`AGENTS.md:20`), and *"A projected total greater
than or equal to $5.00 halts before spending"* (`AGENTS.md:21`). POC-A proved that law is
enforced in practice: an agent reporting $1.00 against its own $0.50 reservation produced
`halted_budget` with the spend still ledgered.

Hermes's model is the exact inverse — measure after, best-effort, silently lossy. Adopting
Hermes's accounting would violate `AGENTS.md:20-21` outright. That is why decision #15 in
`17-adoption-decision-matrix.md` is `REJECT`.

It also constrains Architecture D: Hermes can only sit behind Tailered's protocol if
**Tailered's** reserve/settle wraps it, with the process-agent config supplying the hard
ceilings (`docs/agent-protocol.md:22`: "The process must constrain its provider call so
actual cost and total tokens cannot exceed the selected tier's ceiling"). Hermes has no
mechanism to honour that contract today — a wrapper would have to impose it, and no such
wrapper exists.
