# 14 — Performance and economics

**Evidence discipline for this artifact.** Only the Tailered numbers are *measured*. Neither
upstream was executed (see `01`), so every Hermes and Honcho quantity below is **derived
from code structure and labelled `INFERRED`**, with its assumptions stated. No upstream
benchmark number is repeated as fact; `15` and the benchmark findings explain why.

## Measured baseline — Tailered AI (VERIFIED)

Executed on Node v24.11.1 against `tailered-ai @ 6172653e`:

| Metric | Value | Source |
|---|---|---|
| Full ship run, deterministic agent | **$0.068**, 277 ms wall | `npm run demo` receipt |
| POC-A conforming run | **$0.004**, 922 ms, 4 calls / 2 context snapshots | POC-A |
| Calls per run | 4-6 (`testgen`, `codegen`×n, `critique`, `adr_draft`) | `src/ship.ts` |
| Test suite | 18/18 pass, 752 ms | `npm test` |
| Install footprint | **4 packages, 0 vulnerabilities** | `npm ci` |
| Hard cost ceiling | **$5.00 exclusive, enforced pre-call** | `src/budget.ts:48-54`, proven by POC-A |

Context economics are instrumented by design: every route log carries `bytes`, `cache_hit`,
and `assembly_ms` (`src/contracts.ts:169-175`), and a repository snapshot is stored **once
per repo hash per run** and referenced thereafter (`src/context.ts:47-66`). The demo run
produced 2 context snapshots across 4 calls — a 50% cache hit rate, measured rather than
assumed.

## Hermes — cost control (INFERRED from code)

**The decisive finding is structural, not numerical: there is no reserve-before-spend
anywhere** (HA-502). Cost is computed only *after* a response returns
(`conversation_loop.py:3690`), then enqueued to a background writer thread. Nothing on that
path can deny a call. Exhaustive negative checks found **zero** enforcement sites for
`spend_cap|budget_usd|max_cost|cost_limit|daily_budget|hard_cap|spending_limit`.

The only hard pre-call ceilings are iteration counts:

| Bound | Default | Citation |
|---|---|---|
| Parent iterations | 500 (config) / 90 (code default; docs say 500 — HA-103) | `cli-config.yaml.example:854`; HA-103 |
| Subagent iterations | 45-50 | `cli.py:532`, `cli-config.yaml.example:1334` |
| Concurrent in-process subagents | ~9 at defaults (per-call cap, not global) | HA-409 |
| Tool batch deadline | 420 s | `agent/tool_executor.py` |

**Subagents receive fresh budgets** (`tools/delegate_tool.py:1655`, "fresh budget per
subagent"), so total work is **not** bounded by the parent cap (HA-503). With depth 1 and ~9
children, worst-case iteration count is roughly `500 + 9 × 50 = 950` model calls for one
user turn — an upper bound on structure, not an observed figure.

Accounting is additionally **best-effort and documented-lossy** (HA-513): per-delta
exceptions are swallowed; the writer thread is given 10 s at shutdown and then logs
"%d queued delta(s) not persisted"; the call site catches everything and only `debug()`s it,
with the in-code comment *"silent loss here is the root cause of undercounted analytics."*
Telemetry carries **zero** LLM-call, token, or cost signals (HA-512).

**Where Hermes is genuinely strong economically:** prompt-cache preservation (HA-108). The
`api_content` sidecar replays each message's original wire bytes so a long conversation
reuses a cached prefix every turn, and tool schemas are resolved once per session (HA-117).
That is a real cost reduction, and it is the mechanism worth borrowing (decision #12 in `17`).

## Honcho — cost structure (INFERRED from code)

### Ingestion, per stored message

| Component | Cost | Citation |
|---|---|---|
| Deriver | **1 structured-output LLM call per representation batch** (~512 message-tokens) | HO-411 |
| Embedding | 1 per batch | HO-411 |
| Summaries | additional LLM calls at thresholds | `src/utils/summarizer.py` |
| Dream / consolidation | additional tool-using LLM calls per dream | `src/dreamer/` |

### Retrieval, per dialectic query

1 LLM call **per tool-loop iteration** (`tool_loop.py:471`), bounded by per-level
`MAX_TOOL_ITERATIONS` — `minimal=1, low=5, medium=2, high=4, max=10`
(`config.py:1018-1042`) — **plus** one synthesis call if the cap is hit (`:769`), **plus**
one extra call on the streaming early-exit path where a finished answer is discarded and
regenerated (`:514-555`). Each call retries up to 3× (`llm/api.py:63-64`). Embeddings: 1 for
prefetch plus 1 per search tool call.

Prefetch is **unconditional and uncapped in size** — every dialectic call pays for up to 50
observations regardless of relevance (HO-320), and there is **no relevance threshold
anywhere** on this path (HO-301).

### Combined with Hermes, at defaults

`recall_mode: "hybrid"`, `injection_frequency: "every-turn"`, `context_cadence: 1`,
`dialectic_cadence: 1` (`client.py:427-436`) means **every non-trivial turn** triggers a
server-side dialectic synthesis plus a context fetch (HH-109), chainable to 3 sequential
calls at `dialectic_depth: 3`. A reasoning heuristic scales the pass level with prompt length
(+1 at ≥120 chars, +2 at ≥400), so the most substantive turns are the most expensive.

**This spend is invisible to Hermes's accounting** because it is incurred inside Honcho.
Combined with HA-502, a Hermes+Honcho deployment has **two independent unmetered cost
channels** — one that measures after the fact and loses deltas, and one that is not measured
at all.

### Two cost-reporting defects

- **HO-319 (LOW):** the shipped dialectic cost calculator reports **$0.00 for every reasoning
  level** at default settings.
- **HO-508 (HIGH):** the "token efficiency" metric excludes **all** ingestion and dream LLM
  cost, and is corrupted by concurrency.

An operator reading Honcho's own instrumentation would conclude the system is far cheaper
than the code implies. That is the single most important economic caution in this artifact,
and it is why the roadmap requires Dime to meter any pilot itself rather than trusting
upstream reporting.

## Latency (INFERRED)

| Path | Bound | Citation |
|---|---|---|
| Hermes memory prefetch, steady state | ~0 — consumes a pre-warmed background result | HH-105 |
| Hermes memory prefetch, turn 1 | ≤ 3.0 s base + 2.0 s dialectic, under an 8.0 s outer join | `client.py:443-444`; `memory_manager.py:47` |
| Honcho outage | one bounded first-turn wait, then permanent skip (fails open) | HH-105, HH-201 |

The added-latency design is sound: bounded, skip-on-overlap, stale-result discard. This is
the pattern worth borrowing (decision #2 in `17`), independent of whether Honcho itself is
adopted.

## Scaling estimates — assumptions stated, figures deliberately bounded

The brief asked for economics at 100 / 1k / 10k / 100k users. Producing dollar figures would
require per-token prices for an unspecified model, an unmeasured message volume, and an
unmeasured dialectic hit rate. **Fabricating those numbers would violate this audit's
determinism rule** (`AGENTS.md:33`: deterministic code computes money; models narrate).

What the code *does* support is the **shape** of the curve, which is what actually drives the
decision:

- **Ingestion cost is linear in messages**, with a constant of roughly 1 LLM call + 1
  embedding per ~512 message-tokens, plus summary and dream calls.
- **Retrieval cost is linear in turns**, with a constant of 1-10 LLM calls per dialectic
  depending on reasoning level, **doubled** on the streaming path, **tripled** in the worst
  retry case.
- **Both constants are multiplied by users**, and neither is bounded by any ceiling in
  either system.

The actionable consequence: at defaults, Honcho's per-turn cost is **plausibly of the same
order as the primary model call itself**, and it is unbounded and unmetered. Any pilot must
(a) set `dialectic_cadence` above 1 or `recall_mode` away from `hybrid`, (b) meter spend on
the Dime side rather than trusting HO-319/HO-508, and (c) apply Tailered's reserve/settle
discipline — which is exactly the capability TA-111 identified as missing from Dime and
TA-112 noted already exists in the sibling repository.

## The economic conclusion

Tailered's reserve-before-spend is the strongest cost property found in any of the three
systems, it is proven by execution (POC-A), and it is the property both upstreams lack.
Adopting either upstream's economic model would be a regression; porting **Tailered's** model
into Dime (TA-111 / TA-112) is the highest-value economic move the audit identifies.
