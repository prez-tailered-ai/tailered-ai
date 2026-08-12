<!-- audit: {"audit_id":"AUD-RUFLO-20260811-221322","tailered_sha":"6172653e0aca0981d0abaf4ad8e9d587667737e9","ruflo_release":"v3.37.0","ruflo_sha":"6ce18b5a7fcd4939a2f72c2e3b8fdbdec660e5a9","generated":"2026-08-11T23:00:00Z","evidence_class":"MIXED","lane":"AUD-L7b","caused_by":["AUD-RUFLO-20260811-221322/01-audit-charter.md"]} -->

# Spike B — Output-only swarm

## Question

Can a Ruflo swarm run against a disposable Tailered checkout, receive non-overlapping tasks
across multiple agents, return structured results, avoid duplicate work, identify conflicts,
preserve agent and task identity, terminate cleanly, and produce an aggregate proposal that
Tailered could validate — **without writing to the repository**?

## Method

A disposable copy of the Tailered checkout (already `ruflo init`-ed by the coordinator) was
mounted at `/repo` inside `docker run --rm` containers with a throwaway `$HOME`. The shared
install was mounted read-only. Before and after every command the full file tree was hashed
(`shasum -a 256`, `.git` excluded) from the **host**, outside the container, so every
postcondition claim below is an independent read.

Working copy: `/tmp/aud-ruflo-20260811/work/lane-L7b/spikeB/repo`
Command logs: `./evidence/`

## Headline answer

**Ruflo's swarm does not execute anything.** `swarm start` prints an agent deployment plan,
prints `[OK]`, exits 0, and then tells the operator that execution happens somewhere else
(Claude Code's Agent tool, `claude -p`, or `hive-mind spawn --claude`). No agent process is
started, no task is dispatched, no result is returned, and no proposal is produced. What Ruflo
provides at the CLI layer is a **state-tracking scaffold** for a swarm that a *different*
runtime would have to execute.

Consequently most of the Spike B questions have no positive answer to give: there is no
"return structured results", no "duplicate work avoidance", no "conflict identification", and
no "aggregate proposal", because nothing runs. The questions that *do* resolve — identity,
termination, and repository mutation — resolve badly.

**The repository question resolves worst of all: Ruflo mutates the repo on `--help`.**

## Findings

### RUF-701 — CRITICAL — `swarm start` reports success and deploys nothing

`swarm start -o "..." -s development --parallel` printed a plan for 8 agents
(1 coordinator, 1 architect, 3 coders, 2 testers, 1 reviewer), printed
`[OK] Swarm swarm-mspazrjq initialized with 8 agent slots`, and exited 0.

Independent postcondition read (host, after container exit):

- `.claude-flow/swarm/swarm-state.json` → the new swarm record has `"agents": []` and
  `"tasks": []`.
- No process, no queue entry, no work item anywhere in the tree.
- The command's own output admits it: *"This CLI coordinates agent state. Execution happens
  via: Claude Code Agent tool / `claude -p` / `hive-mind spawn --claude`."*

Reported success with no durable postcondition → CRITICAL by the audit evidence standard.
Evidence: `evidence/swarm-start.out`, `evidence/swarm-state-two-swarms.json`.

### RUF-702 — CRITICAL — `ruflo swarm --help` mutates the repository

A pure help invocation — no subcommand, no side-effecting verb — changed six files in the
company repo:

| File | Change |
| --- | --- |
| `.claude/helpers/statusline.cjs` | **content rewritten** (hash `df68f59…` → `0457fe5…`) |
| `.claude/helpers/.helpers-version` | rewritten to `3.37.0` |
| `.claude/proven-config.json` | created |
| `.claude/.proven-config-version` | created |
| `.claude-flow/harness-active-policy.json` | created |
| `.claude-flow/policy/state.json` | created |

It also printed `[INFO] Started Ruflo background daemon for /repo` — **every** invocation in
this spike, including `--help`, started a background daemon.

Tailered invariant 4 ("an external process agent must NOT mutate the company repo") is violated
by the safest command in the CLI. There is no read-only mode and no flag that suppresses it.
Evidence: `evidence/help-invocation-repo-mutation.diff`, `evidence/swarm-help.out`.

### RUF-703 — HIGH — the swarm ID shown to the operator is not the swarm ID persisted

`swarm start` printed `swarm-mspazrjq` and instructed the operator to
`Monitor: claude-flow swarm status swarm-mspazrjq`. Two different stores were written with two
different identities:

- `.claude-flow/swarm/swarm-state.json` → `swarm-1786491634758-kuqc44`
- `.swarm/state.json` → `swarmId: "swarm-mspazrjq"`

Neither store agrees with the other, and `swarm status <the id it told you to use>` reads the
single-slot `.swarm/state.json`, not the registry. Correlating console output with persisted
state is impossible. Evidence: `evidence/swarm-state-two-swarms.json`,
`evidence/swarm-dot-state-after-bogus-stop.json`.

### RUF-704 — HIGH — `swarm init` bounds are silently discarded by `swarm start`

`swarm init --topology mesh --max-agents 4 --strategy balanced` persisted
`{topology: mesh, maxAgents: 4, strategy: specialized, status: running}` — note `strategy`
already disagrees with the flag. `swarm start` then created a **second, unrelated** swarm with
`topology: hierarchical, maxAgents: 8`, leaving the first orphaned in `status: running`
forever. A declared agent ceiling is not a constraint on anything.
Evidence: `evidence/swarm-init.out`, `evidence/swarm-state-two-swarms.json`.

### RUF-705 — CRITICAL — `task list --all` returns zero tasks, always

Five tasks were created, each acknowledged with `[OK] Task created: task-…` and a detail table.
`task list --all` then reported `No tasks found matching criteria` and
`{"tasks": [], "total": 0}`.

Root cause, confirmed in source:

- `dist/src/commands/task.js:248` — `const status = ctx.flags.all ? 'all' : …`
- `dist/src/mcp-tools/task-tools.js:158-162` — the handler splits that string and filters
  `statuses.includes(t.status)`.

`'all'` is passed through as a **literal status value**. No task has status `"all"`, so the
documented "show all tasks" flag is a guaranteed empty result. `task list` without `--all`
(default filter `pending,running`) correctly returned all five.

An operator or CI wrapper using the documented flag sees an empty backlog while five tasks sit
in the store. Evidence: `evidence/tasks.out` (empty), `evidence/tasks2.out` (five present),
`evidence/tasks-store-after-5-creates.json`.

### RUF-706 — HIGH — no duplicate detection and no conflict detection

Deliberate probes, all accepted with `[OK]` and exit 0:

| Probe | Result |
| --- | --- |
| Byte-identical duplicate of an existing task description | new task created, no warning |
| Directly contradictory task ("Add `--json` to `src/dashboard.ts`" vs "Remove the `--json` flag from `src/dashboard.ts`") | new task created, no warning |

Nothing in the store links, dedupes, or flags either pair. Evidence: `evidence/tasks.out`.

### RUF-707 — HIGH — assignment has no referential integrity and silently steals ownership

| Probe | Ruflo result | Verified postcondition |
| --- | --- | --- |
| assign T1 → coder agent | `[OK] assigned`, exit 0 | coder `status: active`, `currentTask: T1` |
| assign T1 → tester agent (T1 already owned) | `[OK] assigned`, exit 0, **no warning** | `assignedTo` **replaced** with `[tester]`; coder silently reverted to `idle` |
| assign T2 → `agent-does-not-exist-999` | `[OK] assigned`, exit 0 | the fake ID is written into `assignedTo` |
| assign a nonexistent task | `[ERROR] Unexpected error: TypeError: Cannot read properties of undefined (reading 'join')`, exit 1 | unhandled crash, not a validation error |

Source: `task-tools.js:370` — `task.assignedTo = agentIds` (replace, not merge); the
`if (agentStore.agents[agentId])` guard only skips the *status* update, so unknown agent IDs
still land in `assignedTo`.

Assignment also flips the task to `status: "in_progress"` and stamps `startedAt` even though
nothing is executing — the store asserts work is in flight that has never begun.
Evidence: `evidence/tasks2.out`.

### RUF-708 — MEDIUM — operator-assigned agent names are discarded

`agent spawn -t coder --name alpha-coder` printed a table containing `Name: alpha-coder` and
`[OK] Agent alpha-coder spawned successfully`. Independent verification:

```
grep -rl "alpha-coder" . --exclude-dir=.git   →   (no output)
```

`.claude-flow/agents/store.json` records `agentId`, `agentType`, `status`, `health`,
`taskCount`, `config`, `model`, `modelRoutedBy` — no name field. `agent list` has no name
column. The name exists only in the confirmation message.

Agent **ID** and **type** identity *are* preserved across process restarts (VERIFIED — read
from the host after container exit). Operator-facing identity is not.
Evidence: `evidence/spawn.out`.

### RUF-709 — MEDIUM — `swarm stop <nonexistent-id>` reports success and stops the real swarm

`swarm stop totally-bogus-swarm-id --force` → exit 0,
`[OK] Swarm totally-bogus-swarm-id stopped`, and `.swarm/state.json` (belonging to a different
swarm, `swarm-mspazrjq`) was rewritten to `status: "stopped"`.

Source: `swarm.js:764-786` — the ID argument is never validated against any store; the handler
unconditionally mutates the single-slot state file and unconditionally calls `printSuccess`.
"Terminate cleanly" cannot be demonstrated because termination is not addressed to a swarm.
Evidence: `evidence/exitcodes.out`, `evidence/swarm-dot-state-after-bogus-stop.json`.

### RUF-710 — MEDIUM — `hive-mind spawn` ignores `--max-workers`

`hive-mind spawn "<objective>" --max-workers 3` printed `Spawning 1 worker agent(s)` and then
failed with `[ERROR] Hive-mind not initialized` (exit 1 — this path *does* fail loudly).
Evidence: `evidence/hive.out`, `evidence/exitcodes.out`.

## What Ruflo did NOT do (verified positives)

- **No canonical source file was touched.** `git status --porcelain -- src/ test/ docs/
  decisions/ evals/ labels/ loops/ policies/ product/ seats/ benchmarks/ package.json
  tailered.config.json AGENTS.md README.md tsconfig.json` was empty after every swarm, agent,
  and task command. All mutation was confined to Ruflo's own directories plus
  `.claude/helpers/` (RUF-702) and `.gitignore`.
- **Agent identity survives process death.** Three agents spawned in one container were read
  back correctly by a later container and by a host-side read of
  `.claude-flow/agents/store.json`.
- **No lost updates under concurrency.** 8-way and 16-way concurrent `task create` bursts
  persisted 8/8 and 16/16 with zero errors (see Spike D, `cost-accounting/evidence/conc4.out`
  and `final.out`).

## Capability maturity

| Capability | Level reached | Blocking evidence gap |
| --- | --- | --- |
| Swarm topology declaration | PACKAGED | `swarm init` bounds ignored by `swarm start` (RUF-704) |
| Multi-agent task distribution | REACHABLE | never EFFECTIVE — no executor; results never returned |
| Non-overlapping work assignment | ADVERTISED | no dedupe, no conflict detection, replace-semantics assignment |
| Structured result return | ADVERTISED | nothing executes; no result channel exists at the CLI layer |
| Agent identity | DURABLE (id + type) / ADVERTISED (name) | RUF-708 |
| Task identity | DURABLE in store / broken in the documented read path | RUF-705 |
| Clean termination | ADVERTISED | RUF-709 — stop is not addressed to a swarm |
| Aggregate proposal | NOT REACHED | no execution → no proposal to validate |
| Read-only operation against a repo | **FAILED** | RUF-702 — `--help` writes to the repo |

## Answer to the §24 blocker question

> Does the swarm WRITE to the repo directly?

**Yes — VERIFIED, and it does so before any swarm even exists.** `ruflo swarm --help` rewrote
`.claude/helpers/statusline.cjs` and created four config/policy files. Every subsequent command
started a background daemon that wrote `daemon.pid`, `daemon-state.json`, and `logs/daemon.log`
into the repository and left `"running": true` with a stale container PID after the process
died.

The swarm does not write to *source* files — only because it never executes. That is not a
safety property; it is an absence of function. **Tailered invariant 4 is violated. This is a
§24 blocker.**

Any adoption would require Ruflo to run against a throwaway worktree that is never the company
repo, with its entire output treated as an untrusted proposal.

## What could not be determined without credentials

- Whether an executing swarm produces structured, non-overlapping results, avoids duplicate
  work, or detects conflicts. **UNKNOWN** — the only execution paths are `claude -p`, the Claude
  Code Agent tool, and `hive-mind spawn --claude`, none of which can run without model
  credentials, and none of which are present in the containers.
- Whether an executing swarm writes to source files. **UNKNOWN, and the higher risk** — the
  documented executor is Claude Code with built-in tools, which has unrestricted write access to
  the cwd. Nothing observed in this spike constrains it.
- Whether an aggregate proposal format exists at all. **UNKNOWN** — no schema for one was found
  in the CLI dist tree.

The failure mode without credentials is **quiet, not loud**: `swarm start` returns exit 0 and
`[OK]`. A pipeline gating on exit status would treat a swarm that did nothing as a success.
