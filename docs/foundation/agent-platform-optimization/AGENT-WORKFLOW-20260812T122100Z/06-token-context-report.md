# Token and context efficiency report (Scenario F + mode data)

## Exactness discipline

Per-lane token totals come from the harness and are exact (`token_source:
"harness_subagent_total"`, one combined figure per lane). Coordinator tokens are **UNKNOWN** —
the interactive harness does not expose them — and are represented by proxies only: tool calls,
command counts, and byte counts. No token number in this run is estimated from characters.

## Scenario F — one bounded question, three context strategies

Question: the four terminal-outcome values plus the exclusive cost cap. All three lanes
answered correctly; correctness did not separate them. Cost did:

| Strategy | Lane tokens (exact) | Tool uses | Wall | Notes |
|---|---:|---:|---:|---|
| Full repository, no guidance | 27,268 | 6 | 24.7s | 4 files read, 5 searches |
| Curated packet (325 B inline) | 17,771 | 0 | 2.7s | zero repository access |
| Generated packet (234 B grep, 62 ms to build) | 17,769 | 0 | 3.1s | generation cost negligible |

## Findings

1. **The subagent floor is ~17.7k tokens.** A lane that does nothing but read a 234-byte packet
   and answer still costs ≈17,769 tokens — the harness and agent overhead. A dispatch is
   worth it only when the work exceeds what that floor buys. Sub-floor tasks belong to the
   coordinator inline (M0 answered ten questions for zero additional agent tokens).
2. **Packets cut ~35% of tokens and ~88% of wall time** against unguided search on a bounded
   question, with zero recall loss. Curated and generated packets tied; generation cost 62 ms —
   automate packet generation, never hand-curate.
3. **Mode totals (exact lane tokens):** M1 = 77,743 across 3 lanes; M2 = 88,248 across 4 lanes
   + 24,656 verifier (see `03-benchmark-results.md`). M0 = 0 agent tokens; coordinator cost
   UNKNOWN but bounded by 3 tool calls and ~16 commands.
4. **Tight packets shrink lane work even when lanes still touch the repo:** M2's line-targeted
   lanes used 2/3/6/1 tool uses against M1's 5/8/6 for the same questions, at similar token
   cost but higher answer precision.
5. **Governing-context coverage:** every governing file needed by the questions stayed
   reachable in all strategies; no conclusion in this run rests on an evicted document. The
   packet strategy risks silent omission on OPEN-ENDED tasks — packets are for bounded
   questions; discovery tasks keep repository access.

## Rule extracted

Measure tokens per verified conclusion, not per response. In this run: M0 ≈ 0 agent-tokens /
10 verified answers (coordinator UNKNOWN); M1 ≈ 7,774 agent-tokens per verified answer; M2 ≈
11,290 including verification. Parallel lanes bought independence and freshness, not economy.
