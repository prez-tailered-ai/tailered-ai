# Scope and method

**Run:** `AGENT-WORKFLOW-20260812T122100Z` · **Coordinator:** Fable 5 (single writer) ·
**Base:** current `main` `0d55aa9e`, verified live after the tasking hints proved stale.

## Objectives

**A.** Formally propose the Ruflo decision (`decisions/ADR-005.md`, status `proposed`,
PREZ-only acceptance) from the merged audit `AUD-RUFLO-20260811-221322`, reconciled with
current numbering (ADR-004 went to Hermes-Honcho) and the merged P0-B foundation.

**B.** Benchmark Tailered's agentic workflow across ten dimensions using the frozen plan in
`02-benchmark-plan.md`: topology modes M0/M1/M2 on a fixed question set, plus scenarios for
repair loops (D), concurrent sessions (E), and context strategies (F). Scenario A ran live —
the tasking prompt itself carried a stale main hint that the preflight caught.

## Method rules

- The plan froze before any experiment; deviations are reported as deviations.
- A reported success is only a claim; every material conclusion is re-grounded by the
  coordinator through direct reads (`03-benchmark-results.md`, reconciliation table).
- Token discipline: lane totals are exact from the harness; coordinator tokens are UNKNOWN and
  never estimated; proxies (tool calls, commands, bytes) carry the comparison where exactness
  is unavailable.
- All destructive experiments ran in disposable clones/worktrees in the session scratchpad;
  the authoritative worktree received only authorized-path writes by the single coordinator.
- Subagents were read-only Explore lanes with explicit objectives, sources, schemas, and stop
  conditions; none wrote, committed, or appended anything.

## Declared limitations

1. **Warm-coordinator bias:** the coordinator executed P0-B in this same session, so M0's
   re-verification speed does not model a cold coordinator. Lanes ran cold. Reported, not
   corrected for.
2. **One trial per mode** on the question set: variance is unmeasured; the token FLOOR
   finding (≈17.7k/lane) replicated across 8 lanes and is robust; wall-time deltas are
   single-sample.
3. Coordinator-side token totals are structurally unavailable in this harness (UNKNOWN).
4. Scenario E used a synthetic repository for speed; the two live composition events in this
   program serve as the real-repo confirmations.
