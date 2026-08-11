# 12 — Dime AI opportunity matrix

Dime evidence is cited from the Dime repository, which was read but never written to.
Every candidate below is classified as **Prediction intelligence**, **Personalization
intelligence**, or **Operational intelligence**, and no improvement in predictive accuracy
is attributed to a memory or agent framework anywhere in this document.

## First: what Dime already has (do not recommend these as new)

Recommending an existing capability as an upstream gain is the most common failure mode of
an audit like this. Measured against the code:

| Capability | Status in Dime | Evidence |
|---|---|---|
| Durable conversation history | **Already built** — 6 tables (`dime_chat_threads`, `dime_chat_messages`, plus Trace v1: sessions/turns/generations/trace_events), soft-delete, retained indefinitely | DA-101 |
| Generation-level audit trail | **Already built and LIVE in production** (proven by a retention-purge log line) | DA-102 |
| Retrieval grounding | **Already built** — server-side pre-fetch injected as a synthetic turn pair | DA-105 |
| Response validation gates | **Already built** — verdict schema, betting-certainty, responsible-gambling, answer-completeness | DA-101 |
| Deterministic non-LLM answer path | **Already built** — math handler answers without a model call | DA-112 |
| In-process agent runtime | **Already built** (`piAgent.ts`) — but **zero product call sites** | DA-107 |
| Subprocess agent runtime | **Already built** (`dimeAgent.ts`, strict env allowlist, read-only default tools) — **zero product call sites** | DA-106 |
| Calibration / backtest / walk-forward stack | **Already built** — ECE, MCE, Brier, log loss, CLV, leakage verdict, engine-source hashing | DA-208 |

Two facts reframe the whole opportunity set:

- **Dime Chat has no model-driven tool use at all.** The live path calls
  `anthropic.messages.stream()` with no `tools` parameter (DA-105).
- **Dime Chat is owner-only in production.** `canAccessDimeModel` requires
  `role === "owner"`; paying subscribers are refused, and sampled production logs show only
  401s (DA-110).

So the personalization opportunity is real but currently serves one user. Sequencing matters
more than capability.

## Verified negatives that make this greenfield

- **No cross-session memory and no user model exists** (DA-103, DA-209).
  `getDimeChatContext()` takes no user id; nothing reads `dime_chat_messages` to build a
  prompt. Persisted history is a UI feature and an audit record, not an input. The shipped
  platform-knowledge block explicitly instructs the model *not* to infer a user's plan,
  role, tracked bets, or account state.
- **Zero paths exist by which LLM output can write prediction-authoritative state**
  (DA-202). Established by two mutually falsifying checks: the 17 LLM-importing files and
  the 22 prediction-writer files are strictly disjoint, and every DB write in the LLM lane
  targets a `dime_chat_*` table. The Python engines contain zero inference calls.

The boundary is therefore **clean today, and unguarded** — it holds by convention and
reviewer discipline, not by a mechanical barrier (DA-202 risk note).

## The hard boundary: memory must never become sports-model evidence

Four concrete mechanisms would carry contamination if a memory layer were added naively.
They are ranked by how likely a standard implementation is to trip them.

### 1. DA-205 (HIGH) — the numeric-grounding allowlist is seeded from user-role text

This is the single highest-risk vector and it is **pre-existing**.

`server/dime-chat.route.ts:344` takes history from the request body. Lines 823-826 derive
`userNumericValues` from messages where `role === 'user'`, and lines 862-864 union those
into `supportedNumericValues`. The enforcement side
(`server/_core/dimeAnswerRouting.ts:1188-1210`) builds its allowed-set from exactly that
field and flags `unsupported_numeric_claim` only for numbers outside it.
`sanitizeDimeChatHistory` (`server/_core/dimeChatModel.ts:509-528`) filters on role, length
and count — **it carries no provenance marker** distinguishing a genuinely typed user
message from injected content.

Consequence: if remembered facts are replayed as `role:"user"` turns — the standard
implementation pattern, and exactly what Hermes does (memory appended to the user message,
HH-104) — **every number they contain silently enters the grounded-evidence allowlist**. A
remembered stale projection, or a number the assistant itself once emitted, would then pass
the numeric gate indistinguishably from a fresh database value.

**Rule:** memory must never be injected in the `user` role, and `supportedNumericValues`
must be derived only from retrieval, never from message text.

### 2. DA-204 (MEDIUM) — the chat pool falls back to the read-write credential

`readDatabaseUrl()` (`server/_core/dimeChatContext.ts:149-154`) returns
`DIME_CHAT_DATABASE_URL || DATABASE_URL`, and the dedicated variable appears nowhere in the
repo outside that line and its test. A memory layer reusing `getPool()` — the natural
choice, since it is already the chat lane's handle — inherits **write capability over every
prediction table**.

**Rule:** point `DIME_CHAT_DATABASE_URL` at a MySQL user with SELECT-only grants on
`games`/`mlb_*`/`odds_history` and no privileges on the write path. This converts the
boundary from a review-time convention into an engine-enforced impossibility, and it is the
single strongest available hardening.

### 3. DA-210 (MEDIUM) — feed gating is not a universal chokepoint

`stripGameModelFields` is enforced only in `server/routers.ts`; `dimeChatContext.ts` imports
only `applyMlbMarketGatesToGame` and its SELECT explicitly lists the raw model columns.
Not a leak today (the route hard-rejects unauthenticated callers and requires entitlement),
but the feed's substring-`model` rule auto-covers new columns while the chat SELECT is a
hand-maintained list. **A memory layer that persists or summarizes chat context would
persist proprietary model fields into a store with different access rules.**

### 4. DA-206 (MEDIUM) — one authenticated surface turns a string into a published projection

`games.updateProjections` (`server/routers.ts:441-465`) is owner-gated and validated only by
string length. The gate is genuine (re-reads role from the DB rather than trusting the JWT).
The risk is forward-looking: any future agent or automation holding an owner session would
reach it.

**Rule:** no agent or memory component may ever hold an owner session.

## How non-contamination would be proven (DA-208)

Dime already owns the instrumentation. In descending strength:

1. **Structural** — assert `hashEngineSource()` and `mlb_calibration_constants` are
   byte-identical across the rollout. Proves no parameter moved, with no statistics needed.
2. **Distributional** — diff per-market ECE / Brier / log-loss from `mlbCalibrationAudit`
   over matched pre/post windows.
3. **Sequential** — run `mlbWalkForwardValidator` folds spanning the rollout boundary and
   confirm no fold-level accuracy/ROI/CLV discontinuity.
4. **Row-level** — assert `modelProb`/`edge` for overlapping games are unchanged.

Test 1 is the acceptance gate. It is cheap, binary, and unfalsifiable by narrative.

## The matrix

| # | Candidate | Class | Dime today | Upstream contribution | Disposition |
|---|---|---|---|---|---|
| 1 | Persistent user preferences (explanation style, teams, recurring interests) | **Personalization** | Absent (DA-109: four flags, three browser-local) | Honcho's peer representation is a genuine fit | **DEFER → pilot** behind the four rules above |
| 2 | Cross-session continuity ("don't restate durable context") | **Personalization** | Absent (DA-103) | Honcho session/peer model | **DEFER → pilot**, same gates |
| 3 | Personalized *explanation* of an unchanged number | **Personalization** | Absent | Concept only | **REFERENCE** — highest value/risk ratio: presentation changes, probabilities do not |
| 4 | Memory as an input to projections/probabilities/calibration | **Prediction** | Absent, and must stay absent | — | **REJECT — absolute** |
| 5 | `honcho_conclude`-style model-authored durable belief | **Personalization** (claimed) | Absent | Hermes exposes it | **REJECT** — model-written belief, no provenance, cross-peer reachable (HH-106, HH-114) |
| 6 | Research agents (games, injuries, line movement, source discrepancies) | **Operational** | Runtimes exist, unwired (DA-106/107) | Hermes tool surface as design reference | **DEFER** — wire Dime's *own* runtimes first; they are built and tested |
| 7 | Data-quality investigation agents | **Operational** | Runtimes exist, unwired | Design reference | **DEFER** — same |
| 8 | Model QA / drift / incident investigation | **Operational** | Calibration + drift stack exists (DA-207/208) | Nothing material | **KEEP DIME** |
| 9 | Support / onboarding intelligence | **Personalization** | N/A — owner-only today (DA-110) | Honcho | **DEFER** until the surface serves real users |
| 10 | User-feedback capture as structured knowledge | **Personalization** | Absent | Honcho conclusions (read-only shape) | **DEFER → pilot**, human-confirmed writes only |
| 11 | Reusable sports-domain skills in the product | **Operational** | Absent in the product (DA-108); large corpus in the dev harness | Format already shared | **REJECT (already present)** for the harness; **DEFER** for the product |
| 12 | Agent tool use in Dime Chat | **Operational** | None — no `tools` parameter (DA-105) | Hermes's narrow-waist discipline | **REFERENCE** — if tools are ever added, cost is paid on every call |

## Recommendation for Dime, ranked

1. **Do the two hardening items first, independent of any adoption decision.** DA-205
   (provenance on history; derive `supportedNumericValues` from retrieval only) and DA-204
   (SELECT-only credential). Both are small, both are pure risk reduction, and both are
   worth doing even if no memory layer is ever built — DA-205 is a live weakness today.
2. **Then a personalization pilot, owner-only, behind a quarantined channel.** Memory in a
   system-role block that is explicitly non-authoritative, never in the `user` role; no
   model-write tool; per-user workspace; structural non-contamination test (DA-208 #1) as
   the acceptance gate.
3. **Wire Dime's own agent runtimes before importing anyone else's.** `dimeAgent` and
   `piAgent` are implemented, tested, and have zero callers. That is the cheapest available
   operational capability and it carries no new upstream dependency.

The counsel this audit gives Dime is not "adopt Honcho." It is: **the boundary you need
exists today by accident, the numeric-grounding vector is already weak, and fixing that is
worth more than any upstream capability on offer.**
