# 07 — Token and context efficiency (Scenario H)

## What is exact and what is UNKNOWN

- **Exact**: every subagent's total token count, tool-call count, and wall duration come
  from the harness usage report (`token_source: "harness usage report"`). All 28 agents.
- **UNKNOWN**: the coordinator's own token use per phase. The harness does not meter the
  coordinator separately. Recorded as null everywhere; never estimated, never invented.
- **Proxy (self-reported)**: per-agent file_reads and command counts come from the
  agents' own JSON and are labeled `token_proxy`. They are claims, not measurements.

## Context-mode comparison

| Mode | Context given | Tokens | Wall | Accuracy | Caveat |
|---|---|---|---|---|---|
| Full-context discovery (≡ M0 mean) | question list only; agent finds and reads everything | 85,675 | 134.2 s | 10/10 | none |
| Curated packet (H) | all 10 facts pre-extracted, 2 mandatory live spot-checks | 49,936 | 22.7 s | 10/10 + 2/2 spot-checks | curation labor and staleness risk move to the coordinator; generated-vs-manual packet variants were identical in this run (one builder), a stated limit |

Governance survived the packet: the two live spot-checks anchored the packet to reality
(main SHA, required check), so a stale packet would have been caught, not trusted.

## Repeated-read and fan-out overhead

- Lane specialization cut per-agent reads (repo lanes: 2-4 commands; the M0 solo agents:
  13-18 tool calls each). Fan-out's fixed cost is visible in the floor: even a 2-question
  lane costs ~49k tokens — harness + repo context dominates small packets.
- That floor is the practical argument against fine-grained lanes: **below ~3 questions
  per lane, the fixed cost per agent exceeds the work**. M2's 4-lane split paid this
  floor 4 times, then paid it again in the verifier.

## Cost accounting for this benchmark itself

Total exact subagent spend: **~2.69M tokens across 28 agents** (M0 257k · M1 549k ·
M2 930k · H 50k · plus the P0-B evidence digest agent 138k from the reconciliation, and
verifier/lane overhead as itemized in `metrics.json`). Coordinator spend: UNKNOWN.
This is the price of measuring three topologies honestly; production dispatch should use
the selection table in `05-subagent-topology.md`, not re-run all three.

## Rules adopted

1. Exact-or-UNKNOWN: no invented token numbers, ever (AUT-10 automates the discipline).
2. Packet-first for repeated same-shape tasks, always with live spot-checks inside the
   consumer.
3. Lane granularity ≥ ~3 facts per lane, or the fixed floor eats the benefit.
4. Blanket verification layers are spend without return below decision-gate risk.
