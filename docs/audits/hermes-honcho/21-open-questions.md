# 21 — Open questions and explicit blockers

Everything this audit could not resolve, recorded rather than bridged by inference. Each
item states what would resolve it. Nothing here is presented as a finding.

## Blocked by design: no upstream execution

The audit's governing rules forbade installing either project into a Tailered or Dime
dependency graph, and the operating model policy restricts API credit. Consequently:

| # | Question | Why blocked | What would resolve it |
|---|---|---|---|
| B1 | What does a Hermes worker actually cost and achieve on a Tailered benchmark? | POC-B: needs Hermes's dependency tree installed plus paid inference | Isolated disposable VM, scoped provider key with a hard cap, owner-authorized spend |
| B2 | Does a stored procedure measurably reduce repeated reasoning? | POC-D: needs paired first-run vs learned-run measurements with model calls | Same as B1. **No efficiency claim for skill reuse appears anywhere in this audit** |
| B3 | Does Honcho preserve useful context while leaving model output unchanged? | POC-E: needs PostgreSQL + pgvector, optionally Redis, an LLM key and an embedding provider | Stand up the stack; run DA-208 test 1 as the acceptance gate |
| B4 | Does a persistent agent correctly prioritise the current instruction over inferred memory? | POC-F: needs both stacks live | Partially answered adversely from code (HH-207: no precedence rule exists) |
| B5 | Is the cross-peer memory write chain exploitable end to end? | POC-G: no exploit was constructed and none is published | A contained lab with two peers and `USE_AUTH=False`. Severity HIGH currently rests on **static reachability**, not execution |
| B6 | Do Honcho's published benchmark numbers reproduce? | Requires datasets, judge models, and paid inference | Re-run the harness. Until then no upstream benchmark number is repeated as fact in this audit |

## Coverage limits — what was not read

Hermes is 803 MB with ~4,017 Python and ~1,417 TypeScript files; exhaustive reading is
impossible for any process. Each lane read its core modules in full and grepped the rest.
Modules outside all seven lane scopes are **unaudited and not claimed otherwise**. The
specific gaps the lanes recorded themselves:

- `agent/context_compressor.py` (7,386 lines) — recognizer surface and call contract read;
  the summarization/rotation body was not. Claims about in-place vs rotation compaction rest
  on the loop-side contract and docstrings.
- `hermes_state.py` (11,165 lines) — `append_messages_batch` read; the projection logic in
  `get_messages_as_conversation` was not.
- `cli.py` (~18,915 lines) and `gateway/` — how a turn is *ingressed* (who constructs
  `AIAgent`, who supplies `session_id`/`user_id`) was not verified. HA-118's conclusion is
  scoped to "the core runtime does not authenticate identity," **not** to the whole product.
- `hermes_cli/kanban_db.py` (11,320) and `cron/scheduler.py` (5,130) — read selectively by
  function. Workflow templates, tenants, and `kanban_swarm.py` are unaudited.
- `tools/kanban_tools.py` (2,476, the model-facing board surface), `gateway/turn_lease.py`,
  `gateway/drain_control.py`, and the ACP/A2A delegation surfaces were not covered.
- The streaming aggregator body (`agent/chat_completion_helpers.py:2732-4700`) was cited
  from its construction sites, not read end to end.
- `honcho-ai` SDK v2.2.0 internals are in neither repo and were not inspected; any
  peer-scoping the SDK performs between Hermes's call and the HTTP request is **unverified**,
  which is a live caveat on HH-106.

## Specific unresolved questions

1. **HA-411 — gateway RPC authority.** `subagent.interrupt` and `delegation.pause` showed no
   authorization at dispatch (`tui_gateway/server.py:1898-1934`), but the transport binding
   (UDS vs TCP), connection handshake, and peer-credential checks in front of dispatch were
   not traced. If such a gate exists, severity drops to LOW. The lane flagged this as its
   single most important unverified item.
2. **HH-113 reachability.** Whether any Hermes gateway emits a `user_id` containing
   characters outside `[a-zA-Z0-9_-]` — the precondition for two users' memories silently
   merging — was not enumerated. Recorded as INFERRED.
3. **HA-416 — can `interrupt()` break a child out of a blocking subprocess read**, or does it
   only take effect at the next tool-call boundary? Needs `agent/interrupt_compat.py` plus
   the terminal tool's blocking-read path.
4. **Test-coverage claims are weak throughout.** Where a lane wrote "NONE FOUND," that means
   its greps found nothing. Per this program's own rule that an unreproduced absence is the
   least reliable finding class, **treat those as unproven rather than proven-absent.**
5. **Kanban atomicity.** The CAS/claim logic is correct as written, but its guarantees depend
   on SQLite transaction-mode and WAL details under concurrent writers that were not
   verified.
6. **Whether Hermes's `AGENTS.md` rubric line about synthetic user messages is a binding
   runtime invariant or contribution guidance** is a question of authorial intent that
   cannot be resolved from code. The textual contradiction (HA-105) is recorded; the intent
   is not asserted.

## Questions for the founder, not the code

These are decisions, not facts, and the audit deliberately does not make them:

1. **Is institutional memory wanted in Tailered at all?** `docs/blueprint-execution.md:34-42`
   refuses subsystems whose data dependency is unmet, and the eval/label exclusion from
   context (TA-014a) is deliberate and documented. Gate 2 exists only if the answer is yes.
2. **Should Dime Chat leave owner-only?** It is owner-only in production today (DA-110), so
   a personalization pilot currently serves one user. The value of Gate D2 depends entirely
   on this.
3. **Is the AGPL service boundary acceptable** for a commercial product, given counsel
   review? See `15`.
4. **Should ADR-004 (drafted in `17`) be accepted?** Under `AGENTS.md:17` that is intent, and
   intent is the founder's.

## What would most change this audit's conclusions

Stated plainly, so the audit can be falsified rather than defended:

- If POC-B showed a Hermes worker completing Tailered benchmark tasks **within the $5 cap
  with a wrapper enforcing the tier ceiling**, Gate 3 would move from DEFER toward a real
  trial.
- If POC-D showed measurable token/tool-call reduction from a learned procedure, the
  `REJECT` on the autonomous skill writer would weaken to `ADAPT` — the objection is the
  missing measurement, not the idea.
- If the `honcho-ai` SDK turns out to enforce peer scoping client-side, HH-106 drops from
  HIGH to MEDIUM.
- If Hermes shipped a wheel and a reserve-before-spend hook, the two structural blockers to
  direct dependency (HA-601, HA-502) would both fall.
