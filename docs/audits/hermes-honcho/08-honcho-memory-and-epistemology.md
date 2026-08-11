# 08 — Honcho: memory model and epistemology

Repository `plastic-labs/honcho` @ `a92fb1e0789fd29e9674aec133328513ed0dcda3`, AGPL-3.0.
Static analysis only — no Honcho instance was ever run (see `01`), so every finding here is
a code finding.

This is the artifact the audit brief called a research problem: what epistemic status does
each stored artifact actually have in code, versus what the documentation claims?

## The pipeline, and the exact line where inference becomes durable state

```
POST message ──> `messages` row (content immutable; only metadata updatable,
                  src/routers/messages.py:363-394)
            ──> `queue` rows, one work unit per (session, observed peer)
                  src/deriver/enqueue.py:293-392
            ──> token-batched fetch (src/deriver/queue_manager.py:799-1057)
            ──> ONE structured-output LLM call over raw message text
                  src/deriver/deriver.py:149-168, prompt src/deriver/prompts.py:40-89
            ──> Representation ──> embed ──> INSERT into `documents` level='explicit'
```

**Model output becomes durable state at `await db.commit()` — `src/crud/document.py:685`**
(rows staged at `:680`). Two parallel durable-write sites: the peer card
(`src/crud/peer_card.py:90-95`, a whole-list overwrite into `peers.internal_metadata`) and
session summaries (`src/utils/summarizer.py:697-698`).

## HO-202 (HIGH) — the deriver cannot produce deductive conclusions, and the docs say it does

`PromptRepresentation` has a **single `explicit` field**
(`src/utils/representation.py:140-156`), and `from_prompt_representation` hardcodes
`deductive=[]` (`:705`).

Every document stating the deriver extracts deductive conclusions is **stale**:
`docs/v3/documentation/core-concepts/reasoning.mdx:57`, `README.md:253`, `CLAUDE.md:146`.

Deductive and inductive conclusions come exclusively from the Dreamer's two tool-using
specialists (`src/dreamer/specialists.py:516-776`). Those read the **whole** conclusion
space with no level filter (`src/utils/agent_tools.py:1827-1841, 2161-2168`) and write back
through the same commit — so **derived beliefs do recursively feed later derivation**, but
only in the dream lane, not the deriver lane (HO-211).

Claim-to-code verdict: `MISLEADING`. This is the reasoning-first premise of the product, and
the primary path does not implement it.

## The four epistemic levels, and what they are actually worth

`src/utils/types.py:257` labels four levels — `explicit | deductive | inductive |
contradiction` — plus two **unlabelled** LLM artifacts (peer card, summaries).

| Level | Produced by | Real status |
|---|---|---|
| `explicit` | deriver, one LLM call over raw text | The only level the main pipeline creates |
| `deductive` | Dreamer specialists only | Not from the deriver despite the docs |
| `inductive` | Dreamer specialists only | Carries the only confidence field |
| `contradiction` | **nothing** | **Unreachable — no wired agent has a tool that can emit one** (HO-207) |

A declared epistemic level that no code path can produce is not a distinction the system
maintains; it is a schema aspiration.

## Provenance is nominal, not enforced

Three separate failures, each independently sufficient to break traceability:

- **HO-203 (MEDIUM)** — explicit conclusions are stamped with **every observed-peer message
  id in the batch** (`src/deriver/deriver.py:187`), not the sentence they came from. You can
  narrow a conclusion to a batch, never to a statement.
- **HO-204 (HIGH)** — derived conclusions carry `source_ids` **copied verbatim from the
  model with no existence check** (`src/utils/agent_tools.py:996-999`). The repository's own
  test suite persists invented ids (`tests/utils/test_agent_tools.py:231-251`). Derived
  provenance is therefore **an assertion by the model, not a link**.
- **HO-205 (HIGH)** — stored message provenance sits in a different ID space from the tool
  that resolves it, and is never shown to the model.
- **HO-206 (MEDIUM)** — the public Conclusions API and the SDKs expose **no** provenance or
  epistemic metadata at all, so a consumer cannot even see which level a fact came from.

## Belief maintenance: there is none

- **HO-208 (HIGH)** — **no supersession mechanism.** Later evidence overrides earlier belief
  only by model discretion or a similarity collision. Nothing in the schema expresses
  "replaces."
- **HO-209 (MEDIUM)** — **no freshness model.** No decay, no TTL, no staleness marking, and
  reinforcement is monotonic: repetition strengthens, nothing weakens.
- **HO-210 (MEDIUM)** — confidence exists on inductive rows only, is **self-reported by the
  model**, and is **read by zero code paths**. It is stored and never used.
- **HO-212 (HIGH)** — **user corrections are additive and do not propagate.** A correction
  does not retract conclusions already derived from the corrected fact, and user-written
  conclusions are **indistinguishable from model-written ones** in storage.
- **HO-214 (HIGH)** — derivation is **silently lossy**: a failed batch permanently skips its
  messages, and unparseable model output becomes an empty representation. There is no
  dead-letter path and no retry that recovers the skipped content.

## HO-213 (HIGH) — the peer card is the sharpest instance of the whole problem

The peer card is an **unversioned, provenance-free LLM overwrite**
(`src/crud/peer_card.py:90-95`, whole-list replacement into `peers.internal_metadata`) that
is **inlined into the dialectic system prompt** and thereby presented in answers as fact.

So the artifact with the weakest epistemic guarantees in the system occupies the strongest
position in the prompt. Combined with HH-104 on the Hermes side — where memory arrives in
the user channel labelled "authoritative" — a fact's *trust presentation* is inversely
related to its *evidential support* at both ends of the integration.

## The memory-authority model, stated plainly

| Role | Is Honcho suitable? | Why |
|---|---|---|
| Canonical database | **No** | Content is immutable but beliefs are unversioned, unsuperseded, and lossily derived |
| Truth-maintenance / reasoning substrate | **No** | `contradiction` is unreachable, no supersession, confidence unread, provenance unvalidated |
| Behavioral model of a person | **Partially** | This is what the peer representation genuinely is |
| Personalization layer | **Yes** | Its actual, defensible role |
| Contextual memory / evidence cache for prompt assembly | **Yes** | Its actual, defensible role |

The lane's own verdict: *"Honcho is a contextual-memory / personalization layer and evidence
cache for prompt assembly. It is not a canonical database, not a truth-maintenance or
reasoning substrate."*

**This is the single most important sentence in the audit for Dime**, because it settles the
hard boundary on evidence rather than on caution. Memory must never become sports-model
evidence not merely because that would be risky, but because **Honcho does not maintain the
epistemic properties that evidence requires** — no supersession, no validated provenance, no
readable confidence, no freshness, and silent derivation loss.

## What Honcho would need to be an evidence store

The audit brief asked which additions would be required. Against the code, the minimum set:

`observed_at` · `valid_from` / `valid_until` · `last_confirmed` · `user_confirmed` (distinct
from model-authored) · `supersedes` / `superseded_by` · `revoked` · `contradiction_count` ·
**validated** `source_ids` with referential integrity · a readable confidence that some code
path actually consults · a dead-letter path so derivation loss is visible.

That list is long enough that building it inside Honcho would be a fork, not a
configuration. It is also, almost exactly, the property set Tailered's ledger already has —
`caused_by` enforced by the validator (`src/validate.ts:86-93`), immutable artifacts via
`wx` exclusive create (`src/files.ts:44-50`), and append-only supersession for ADRs where
"accepted decisions are never edited" (`docs/v1-contract.md:62-64`).

The contrast is the audit's clearest architectural lesson: **Tailered already treats derived
records with more epistemic discipline than a dedicated memory system does.** That is why
the reference architecture keeps canonical truth in the ledger and confines memory to
personalization.

## Cross-peer perspectives and dream artifacts

- **HO-215 (MEDIUM)** — cross-peer "perspectives" are **byte-identical copies of one
  omniscient extraction**, not independent viewpoints. The multi-peer "what one peer knows
  about another" capability is weaker than the README's "Models what one peer knows about
  another when configured" implies.
- **HO-216 (MEDIUM)** — dream output carries a **fabricated single session stamp**, and
  session deletion destroys cross-session conclusions.
- **HO-217 (MEDIUM)** — documented "custom models trained for formal logical reasoning" and
  abductive reasoning are **not present in the code**.
- **HO-219 (LOW)** — the dialectic prompt instructs the model to save deductions **with a
  tool it has not been given**.
