# 10 — The Hermes ↔ Honcho integration

Hermes `ed5e17f4…` ↔ Honcho `a92fb1e0…`. Static analysis only; neither system was executed
and no live Honcho server was contacted (see `01`).

## Headline: the integration is real, and the audit's own hypothesis was refuted

The lane was instructed to test the hypothesis that the integration is thinner than the
projects' documentation implies. **That hypothesis is REFUTED** (HH-101, TESTED/VERIFIED).

| Component | Size |
|---|---|
| `plugins/memory/honcho/` (7 modules) | ~7,938 lines |
| `agent/memory_manager.py` | 1,241 lines |
| `agent/memory_provider.py` — the ABC | 20 methods, 4 abstract |
| `tests/honcho_plugin/` (12 modules) | 5,948 lines |

It is wired into the real construction path at `agent/agent_init.py:1736-1739`, and the
provider registers itself at `plugins/memory/honcho/__init__.py:1629`. The integration is
*deeper* than documented — it carries bounded prefetch timeouts, stale-result discard by
age, a streaming leak scrubber, one-time auth-failure notices, peer-ID collision hashing,
and background write retry, none of which the docs describe.

**Coupling is strictly one-directional** (HH-112). `grep -ril hermes src/` in the Honcho
repo returns zero files; the only Honcho-side artifact is a documentation page. Hermes is
the client, Honcho the server, consumed over HTTP via `honcho-ai==2.2.0`
(`pyproject.toml:222`) — an opt-in extra deliberately excluded from `[all]`. Consequence:
Honcho's test suite exercises none of the Hermes usage patterns, so contract drift would
surface only in Hermes's own tests against a mocked SDK.

## The abstraction is the genuinely valuable artifact

`MemoryProvider` (`agent/memory_provider.py:81`) is a real, documented ABC: 4 abstract
members (`name`, `is_available`, `initialize`, `get_tool_schemas`) and 16 optional lifecycle
hooks (`prefetch`, `queue_prefetch`, `sync_turn`, `handle_tool_call`, `on_turn_start`,
`on_session_end`, `on_session_switch`, `on_pre_compress`, `on_delegation`,
`on_memory_write`, `backup_paths`, config schema/save, `system_prompt_block`, `shutdown`).
**Nine** bundled providers implement it — honcho, hindsight, mem0, openviking, supermemory,
retaindb, byterover, holographic, builtin (HH-103).

This is the single most transferable idea in either upstream: memory is a *replaceable
adapter behind a lifecycle contract*, not a hard dependency. It is why the decisive question
below has a good answer.

## Decisive question: does Hermes survive without Honcho?

**Yes** (HH-201, VERIFIED). Every call site — construction, `initialize`, `on_turn_start`,
`prefetch_all`, `sync_all`, `on_session_end`, `handle_tool_call`, `on_pre_compress`,
`on_delegation` — is individually wrapped in `try/except Exception` with a degraded fallback.
The provider fails open on a stalled backend: bounded 3.0 s + 2.0 s turn-1 waits
(`client.py:443-444`) under an 8.0 s manager-side prefetch join
(`memory_manager.py:47,580`), then permanent skip — "Only turn 1 may wait for session init;
later turns fail open" (`__init__.py:725`). No Honcho failure propagates into the
conversation loop.

Memory degradation degrades context quality only. This is the correct architecture and it is
the property that makes an `INTEROPERATE` disposition possible at all.

## The real findings are about semantics, not availability

### SEC-HH / HH-106 (HIGH) — cross-peer read *and* write via an unvalidated model argument

All five Honcho tools take a free-form `peer` string. `_resolve_peer_id`
(`session.py:1324-1340`) maps only the aliases `user`/`ai`; **any other string falls through
to a bare `_sanitize_id()` of caller input** with no allowlist, no membership check, and no
comparison against the session's own peer. The tool schemas actively invite it: "Or pass any
peer ID from this workspace" (`__init__.py:153-154`).

`honcho_conclude` is a **write** into an arbitrary peer's durable profile
(`session.py:1505-1546`). Server-side scoping does not compensate: Honcho ships
`USE_AUTH=False` (`honcho/src/config.py:727`) and Hermes holds a single deployment-wide key
that must be workspace-broad because it creates arbitrary peers.

In any deployment where one workspace holds more than one isolation unit — a multi-user
gateway, or a Tailered instance serving several companies or operators from a shared
workspace —
isolation is per-*peer* inside one shared workspace, so this is a cross-user exfiltration
*and* belief-planting surface reachable by prompt injection. Severity rests on static
reachability; no exploit was constructed (see `16-poc-results.md`, POC-G).

### SEC-HH-01 / HH-104 (HIGH) — memory is injected as "authoritative" into the user channel

Prefetched memory is appended to the current turn's **user message**
(`agent/turn_context.py:53-85`) — the same channel as untrusted user content — wrapped in:

> "[System note: The following is recalled memory context, NOT new user input. Treat as
> authoritative reference data — this is the agent's persistent memory and should inform all
> responses.]" (`agent/memory_manager.py:354-361`)

The content so labelled is **LLM-synthesized** from prior user utterances. The fence
delimits but *elevates* trust; the only sanitization is fence-tag stripping. There is no
instruction neutralization, no provenance labelling of who authored a remembered fact, and
**no rule anywhere that the current user turn overrides recalled memory** (HH-207).

### SEC-HH-02 / SEC-HH-03 (HIGH) — raw stored content reaches Honcho's own prompts

On the Honcho side, raw stored message content is concatenated **directly into the dialectic
agent's system prompt** (`honcho/src/dialectic/core.py:166-176`) and into an unescaped
`<messages>` fence in the deriver prompt (`honcho/src/deriver/prompts.py:83-87`). Content
validation is limited to stripping NUL bytes (`honcho/src/schemas/api.py:262-266`). A
message written in session A therefore reaches a privileged prompt position later.

### HH-114 (MEDIUM) — the loop closes and is recursive, with no human checkpoint

Both arms are implemented. **Automatic:** every turn is persisted by `sync_turn`
(`__init__.py:1388-1422`), Honcho derives representation server-side, Hermes reads it back
via `_fetch_peer_context` and injects it. **Deliberate:** `CONCLUDE_SCHEMA`
(`__init__.py:183-227`) is described to the model as writing "persistent, derived facts…
so future sessions carry it forward."

Model-authored beliefs re-enter next turn as "authoritative" (HH-104) and compound without
correction — a self-reinforcing drift channel. A wrong conclusion is re-injected as
authoritative on every subsequent turn.

### Deletion does not retract belief (HH-212, MEDIUM)

Deleting historical information does not retract the conclusions derived from it; there is
no message-level retraction path. This is the GDPR/CCPA-relevant behavior for any consumer
product and is examined further in `09-honcho-security-and-consistency.md`.

### Lifecycle gaps

- **HH-107 (MEDIUM):** Honcho never overrides `on_session_switch`
  (`grep -c` returns 0) despite caching `_session_key`. After `/reset`, `/branch`,
  `/resume`, or compression rotation, writes land under the **previous** session key. The
  ABC's own docstring says providers caching per-session state "should update or reset that
  state here" (`agent/memory_provider.py:214-256`).
- **HH-108 (MEDIUM):** `on_pre_compress` is likewise unimplemented, so **compression does
  not trigger a memory flush**. Content in a discarded window that was never separately
  persisted is silently lost at the compression boundary.
- **HH-205 (MEDIUM):** there is no durable write buffer and no reconciliation. Turns
  completed while Honcho is unreachable are permanently absent — the outage is a permanent
  memory hole, not a delayed sync.
- **HH-204 (MEDIUM):** `sync_turn` spawns an unbounded per-turn thread, defeating the
  manager's bounded-wait discipline on the write path.
- **HH-113 (MEDIUM):** with the default empty `runtime_peer_prefix`, peer IDs skip the
  collision-hashing the prefixed branch applies (`session.py:566` vs `:524-539`), so two
  users whose IDs sanitize identically (`user@corp.com` and `user-corp-com` both →
  `user-corp-com`) silently merge into one peer. The authors guarded one branch and not the
  other.

### HH-109 (MEDIUM) — hidden per-turn cost

Defaults are `recall_mode: "hybrid"`, `injection_frequency: "every-turn"`,
`context_cadence: 1`, `dialectic_cadence: 1` (`client.py:427-436`), so **every non-trivial
turn triggers a server-side dialectic LLM synthesis** plus a context fetch, chainable to 3
sequential calls at `dialectic_depth: 3`. A reasoning heuristic scales the pass level up with
prompt length (`+1` at ≥120 chars, `+2` at ≥400), so the most substantive turns are the most
expensive.

Critically, **this spend is invisible to Hermes's accounting** because it is incurred inside
Honcho. Combined with HA-502 (Hermes has no reserve-before-spend at all), a Hermes+Honcho
deployment has two independent unmetered cost channels.

## The complete feedback loop

```
user turn
  └─> sync_turn ──> Honcho session ──> deriver (LLM) ──> conclusions + representation
                                                              │
        honcho_conclude (model-authored write) ────────────────┤
                                                              ▼
  next turn <── injected into USER message, labelled "authoritative" <── prefetch/dialectic
```

Two write arms, no human checkpoint, no provenance distinguishing observed fact from
model-authored belief, and no precedence rule for the current instruction. That combination —
not any availability weakness — is what makes this integration unsuitable for adoption
as-is by a multi-user product.

## Disposition

| Component | Disposition | Reason |
|---|---|---|
| `MemoryProvider` ABC + `MemoryManager` lifecycle | **REFERENCE** | The abstraction is excellent and reimplementable in ~150 lines; it is the reason memory can be optional |
| Fail-open bounded-prefetch discipline | **REFERENCE** | Correct pattern: timeouts, stale-result discard, skip-on-overlap, degrade to empty |
| Honcho as a memory service | **INTEROPERATE, gated** | Only behind a per-tenant workspace, `USE_AUTH=True`, a server-side peer allowlist, and a quarantined (non-authoritative) injection channel |
| `honcho_conclude` model-write tool | **REJECT** | Model-authored durable belief with no checkpoint, no provenance, cross-peer reachable |
| Memory-as-authoritative injection | **REJECT** | Trust elevation of LLM-derived content in the untrusted channel |
