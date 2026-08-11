# 07 — Honcho architecture and data model

Repository `plastic-labs/honcho` @ `a92fb1e0789fd29e9674aec133328513ed0dcda3`, **AGPL-3.0**,
613 commits, 46 MB, 42.5K LOC across 127 `src/` files. FastAPI + PostgreSQL/pgvector.
Static analysis only; no instance was run.

## What it is

Memory infrastructure for stateful agents: store messages and events, reason over them in
the background, then query peer representations, session context, search results, or
natural-language insights. Deployable managed (`api.honcho.dev`) or self-hosted.

Architecturally it is a **server**, and it stays cleanly on its side of that line: the Honcho
repository contains **zero** Hermes code (HH-112). Hermes is a client over HTTP.

## The schema

11 tables (SQLAlchemy declarative, `src/models.py`, 579 lines) with a **single tenancy
root: `workspaces.name`**. Every other table carries `workspace_name` and joins to parents
through **composite foreign keys** `(name, workspace_name)`.

```
workspaces
  ├─ peers ─────────────┐
  ├─ sessions ──────────┼─ session_peers (association)
  │    └─ messages ─────┴─ message_embeddings
  └─ collections (observer, observed)  UNIQUE(observer, observed, workspace_name)
       └─ documents        ← "Conclusions" are a public rename of this table
  queue / active_queue_sessions        ← the work queue
  webhook_endpoints
```

**That composite-FK discipline is the real tenancy enforcement, and it is consistently
applied** (HO-115). Names are constrained to `^[a-zA-Z0-9_-]+$` (`src/schemas/api.py:38`),
which incidentally makes the colon-delimited `work_unit_key` grammar and the vector-namespace
derivation injection-proof.

## The advertised ontology maps unevenly onto storage

This matters for anyone reasoning about the product from its documentation:

| Advertised concept | Actual storage |
|---|---|
| Workspace, Peer, Session, Message, Collection, Document, QueueItem, WebhookEndpoint | Real tables |
| **Observer / Observed** | **Not entities** — two columns on `collections` |
| **Conclusion** | A public rename of `documents` (`src/routers/conclusions.py:24-53`) |
| **Representation** | **Never persisted** — computed at request time (`src/crud/representation.py:575`) |
| **Summary** | **Not a table** — a JSONB blob at `sessions.internal_metadata['summaries']` (HO-105) |
| **Peer Card** | **Not a table** — `peers.internal_metadata['<observed>_peer_card']` (HO-106) |
| **Dream** | **Not a table** — `collections.internal_metadata['dream']` + queue rows |
| **Provenance** | **Unconstrained JSONB** — `documents.internal_metadata.message_ids` and `documents.source_ids` carry **no foreign keys** (HO-107) |

The three artifacts with the weakest storage guarantees — peer card, summaries, provenance —
are exactly the three that most influence what the model is told (see `08`).

## HO-101 (HIGH) — the physical schema has no referential actions at all

`rg ondelete migrations/versions/*.py` returns **zero hits**. The single
`ondelete="CASCADE"` declared in the model (`src/models.py:286`) **was never migrated**.

All "cascade" behavior is hand-ordered Python (`src/crud/workspace.py:394-471`,
`src/crud/session.py:488-634`). Deletion is asynchronous through the queue (202 Accepted),
soft-delete for documents, hard-delete for everything else.

A memory system whose deletion semantics live in application code rather than in the
database is one refactor away from orphaned personal data. This is the structural root of
the deletion findings in `09`.

Compounding it, **HO-104 (MEDIUM)**: the test suite builds the schema **from the models, not
from the migrations**, so model/migration drift — exactly the drift that produced HO-101 —
is invisible to CI.

## API surface

46 routes under `/v3`, plus **unauthenticated** `/health` and `/metrics`. Auth is a single
symmetric HS256 JWT with hierarchical claims (`ad`/`w`/`p`/`s`) verified per route by
`require_auth`.

## Infrastructure requirements

PostgreSQL 15 with **pgvector and HNSW**. Redis is **optional and disabled by default**
(`CACHE.ENABLED=False`, `src/config.py:1256`) — it is a read cache only and plays no role in
queueing, locking, or correctness (HO-410, HO-531). It degrades silently to a per-process
in-memory cache on any setup or ping failure, which makes invalidation non-global in a
multi-process deployment (HO-114).

Deployment: Docker, Fly.io (`fly.toml`), or local. A Cloudflare-Worker MCP server and a CLI
ship alongside. **HO-532 (MEDIUM):** the self-hosted MCP worker **silently defaults to the
vendor's managed API** — a self-hosting footgun worth knowing before deployment.

## Structural gaps worth carrying into the decision

- **HO-102 (HIGH)** — `clone_session` copies messages and peer memberships **with no
  workspace predicate**, a cross-workspace data path.
- **HO-103 (HIGH)** — a peer-scoped key can create or mutate any session in the workspace
  and add itself as a member. Detailed in `09`; it is the sharpest tenancy break found.
- **HO-108 (MEDIUM)** — session deletion leaves the global (`session_name IS NULL`)
  conclusions derived from that session's messages behind.
- **HO-109 (MEDIUM)** — `POST /conclusions` can mint session-less explicit documents,
  violating the session-purity invariant the deriver maintains.
- **HO-110 (MEDIUM)** — message creation returns **201 while enqueueing derivation work is a
  fire-and-forget background task**; see HO-406 in `09` for why that loses data.
- **HO-113 (LOW)** — **no API path deletes an individual message.** Messages are erasable
  only by deleting the whole session. For a consumer product with deletion obligations this
  is a hard constraint, not a detail.

## Assessment for adoption

The tenancy *design* is sound — composite FKs, per-workspace unique constraints, hashed
vector namespaces, restricted name grammar. The tenancy *implementation* has holes (`09`),
and the durability layer beneath it is weaker than the design implies: no referential
actions, provenance without foreign keys, three key artifacts living in unversioned JSONB,
and CI that cannot see migration drift.

For Dime that combination argues for one thing specifically: if Honcho is ever used, it must
be **one workspace per user**, so that the boundary Dime relies on is the one Honcho enforces
best (the workspace root) rather than the one it enforces worst (peer/session separation
inside a shared workspace).
