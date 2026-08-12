# 09 — Honcho: security, tenancy, deletion, and queue consistency

Repository `plastic-labs/honcho` @ `a92fb1e0789fd29e9674aec133328513ed0dcda3`.
Static analysis; no instance was run and no exploit was constructed. Severities rest on
code reachability.

## Auth posture

AuthN is a single symmetric HS256 JWT (`src/security.py:105-145`) carrying optional
`w`/`p`/`s`/`ad` claims. AuthZ is per-route `require_auth(...)` (`:148-281`).

**SEC-O-03 (HIGH) — auth is OFF by default and fails open to full admin.**
`AuthSettings.USE_AUTH: bool = False` (`src/config.py:727`), and when off, `auth()` returns a
**synthetic admin token for every request** (`src/security.py:211-212`). **No startup warning
is emitted.** A self-hoster who deploys the default configuration has an unauthenticated
admin API.

This is the default that makes HH-106 (Hermes's unvalidated model-controlled `peer`
argument) reachable in practice, and it is why the reference architecture requires
`USE_AUTH=True` explicitly rather than assuming it.

## Boundaries that hold (verified negatives — SEC-O-17)

With auth on, the **workspace** boundary is genuinely enforced. Every scoped route declares
`workspace_name="workspace_id"` and `auth()` rejects a token whose `w` differs
(`src/security.py:236-237`); peer and session tokens must carry their parent workspace
(`:137-142`). Vector namespaces are SHA-256 hashed per workspace/peer-pair
(`src/vector_store/__init__.py:98-107`), cache keys are namespaced, and resource names are
restricted to `[A-Za-z0-9_-]`, so no key-collision or namespace-escape path exists. Filters
**AND**-combine with server-injected scope (`src/utils/filter.py:265-281`), so no OR/NOT
filter can widen scope.

Retrieval tenancy is enforced **at the query level**, not post-hoc: conclusion search filters
in SQL `WHERE workspace/observer/observed` on pgvector (HO-303). That was the specific thing
this audit set out to check, and Honcho passes it — with one exception below.

## Boundaries that do not hold

**SEC-O-01 (CRITICAL) — a peer-scoped key can join itself to any session in the workspace.**
`POST /v3/workspaces/{ws}/sessions` (`src/routers/sessions.py:274-321`) is one of three
self-authorizing routes that decode the token and check it themselves. It compares only
`jwt.w` and `jwt.s`, so a **peer**-scoped key reaches it; `get_or_create_session` then
overwrites an arbitrary session's metadata and upserts arbitrary peers into it with
`left_at=NULL` (`src/crud/session.py:242-274, 981-1072`). Self-joining converts directly into
**member-read of that session's messages, summaries, and context**.

**SEC-O-02 (HIGH) — the session-context route leaks any peer-pair representation.**
`GET .../sessions/{id}/context` accepts arbitrary `peer_perspective` / `peer_target` with
**no `jwt.p` check** (`src/routers/sessions.py:745-780`), returning any peer-pair
representation and peer card to any session member.

**HO-102 (HIGH)** — `clone_session` copies messages and peer memberships with **no workspace
predicate**: a cross-workspace path.

**SEC-O-07 / HO-303 (MEDIUM)** — `get_reasoning_chain` resolves conclusions by **workspace
only**, crossing the observer/observed boundary that every other retrieval path respects.

**SEC-O-11 (LOW)** — message authorship is unauthenticated: a session-scoped key can
attribute messages to any peer name.

Taken together: the **workspace** root is defended, and the **peer/session** sub-boundaries
inside a workspace are not. That is precisely why the reference architecture in `18`
requires one workspace per user rather than per-peer separation inside a shared workspace —
it aligns the product's isolation requirement with the boundary Honcho actually enforces.

## Deletion and the right to erasure

This is the section that matters most for any consumer product.

**SEC-O-04 (HIGH) — inferred-memory deletion does not cascade.** Deleting source data does
**not** remove:

- derived conclusions,
- **higher-order conclusions** derived from those conclusions (linked only by unvalidated
  `source_ids`, HO-204),
- **peer cards** — the unversioned LLM overwrite that is inlined into prompts (HO-213).

The structural cause is `HO-101`: the physical schema has **zero `ON DELETE` actions**;
the one CASCADE in the model was never migrated, and all cascade behavior is hand-ordered
Python.

**SEC-O-05 (MEDIUM)** — conclusion deletion is a **soft delete finalized only by the
deriver process**. An API-only deployment (no deriver running) never finalizes it.

**HO-113 (LOW, but decisive)** — **there is no endpoint to delete an individual message.**
Messages are erasable only by deleting the entire session.

**HO-108 (MEDIUM)** — session deletion leaves behind the global (`session_name IS NULL`)
conclusions derived from that session's messages.

**SEC-O-14 (LOW)** — errored queue rows retain raw message content for 30 days by default.

### Answering the audit's question directly

> *If an underlying message is deleted, does the embedding disappear? the derived
> conclusion? higher-order conclusions? cached retrieval? provider-side data?*

Individual message deletion **is not possible**. Deleting the session removes messages and
their embeddings, but derived conclusions (including session-less global ones), higher-order
conclusions, and peer cards **persist**. Provider-side data persists — **SEC-O-13**: all
message content, conclusions, and peer cards go to **OpenAI by default** (the README
documents a different default).

A product with erasure obligations cannot meet them with this system as-is. That is a
design constraint on any Tailered memory pilot, and it is why the memory gate in
[19-implementation-roadmap.md](19-implementation-roadmap.md) requires either
deletion-cascading proven by test, or non-derived memory only.

## Other security findings

- **SEC-O-06 (MEDIUM)** — webhook SSRF: only IP **literals** are blocked; hostnames
  resolving to internal addresses are explicitly permitted.
- **SEC-O-09 (MEDIUM)** — no token revocation, no key identifiers, and non-expiring admin
  tokens under a single shared HMAC secret. **SEC-O-16 (LOW):** JWT expiry is stored as a
  non-numeric string in the reserved `exp` claim.
- **SEC-O-10 (LOW)** — no rate limiting, no request-size ceiling, and attacker-chosen
  content-type drives PDF parsing.
- **SEC-O-08 (MEDIUM)** — `/metrics` is unauthenticated and its counters are labelled with
  `workspace_name`, leaking tenant identifiers when metrics are enabled.
- **SEC-O-15 (HARDENING)** — the "read-only" database session is `AUTOCOMMIT`, not a
  read-only role. The general lesson for Tailered: a "read-only" handle that is only
  read-only by convention is not a boundary — the fix is always a real least-privilege grant
  at the engine.
- **SEC-O-12 (INFORMATIONAL, positive)** — **nothing is phoned home by default.** Telemetry,
  Sentry, Langfuse and Prometheus are all default-off, verified.

## Queue and consistency

Honcho's queue is a **Postgres table**, not a broker. Producers INSERT into `queue`; a
separate `deriver` process claims a work unit by INSERTing into `active_queue_sessions` with
`ON CONFLICT DO NOTHING` against a UNIQUE `work_unit_key`
(`src/deriver/queue_manager.py:449-473`).

**HO-402 (positive):** the claim itself is **race-free** — `ON CONFLICT DO NOTHING` against a
unique constraint, which is a correct primitive (and notably *not* `SKIP LOCKED`, contrary to
what the audit brief anticipated).

### Delivery semantics — the answer is "not uniform, and undocumented"

| Leg | Semantics | Evidence |
|---|---|---|
| Consume | **at-least-once** — work executes, then is marked processed; a crash between re-derives | `deriver.py:149,:217`; `queue_manager.py:672-675, 1059-1078` |
| Produce | **at-most-once, lossy** — the queue row is written by a FastAPI BackgroundTask **after** the HTTP response, in its own transaction, and `enqueue()` **swallows every exception** | `routers/messages.py:161,:246`; `deriver/enqueue.py:73-78` |
| Error | **at-most-once, lossy** | see HO-404 |

**HO-404 (CRITICAL) — any processing error permanently drops one queue item.** Any exception
reaching `_handle_processing_error` marks the item `processed=True` with an error string and
it is **never retried**. There is no retry counter, no dead letter, no requeue — repo-wide,
`processed` is only ever set to `True` (`queue_manager.py:576-611, 1091-1109`).

**HO-406 (HIGH)** — the producer durability gap: a 201 is returned to the client **before**
the derivation work is durably enqueued, and enqueue failures are swallowed. The client is
told the message was accepted; the memory may never exist.

**HO-405 (HIGH) — there is no idempotency key.** Re-processing re-calls the LLM and writes
whatever comes back. The only dedup is content-based: a normalized exact-content match bumps
`times_derived` (`src/crud/document.py:520-610`). Because deriver output is non-deterministic
prose, **a textually different re-derivation creates new duplicate conclusions.**

**HO-403 (HIGH)** — stale-claim reclamation can hand a live work unit to a second worker:
there is no heartbeat during the LLM call.

**HO-407 (HIGH)** — errors raised outside the inner handlers spin the work-unit loop **with
no sleep** and never release the claim.

**HO-413 (MEDIUM)** — dream re-execution after a crash **replays committed tool writes**; the
unit of work is not atomic. Combined with the dreamer's `delete_observations` tool, a replay
repeats deletes *and* inserts.

**HO-409 (MEDIUM)** — graceful shutdown drains correctly, but the shipped `fly.toml` kills
the process before the drain completes.

**HO-414 (MEDIUM)** — the queue-status endpoint miscounts: errored items report as completed.
So the operational surface that would reveal HO-404 in production **hides it**.

### Consistency verdict

Delivery is **at-least-once on consume, at-most-once on produce and on error, with no
idempotency and no dead letter**. In plain terms: **memory can be silently lost at three
separate points** (enqueue failure, processing error, batch parse failure per HO-214), and
duplicate conclusions can be silently created. Neither loss nor duplication surfaces in the
status endpoint.

For a personalization layer this is tolerable — a missing preference degrades an
explanation. For anything load-bearing it is not, and it independently confirms the
epistemic verdict in `08`: Honcho is a contextual-memory and personalization layer, and must
never be a store of record.
