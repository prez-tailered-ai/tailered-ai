# 18 — Future-state reference architecture

A concrete architecture, not a set of principles. The five candidates from the brief are
compared against evidence, one is selected, and the source-of-truth hierarchy and conflict
rules are stated in enforceable terms.

## Source-of-truth hierarchy

### Tailered OS

```
AUTHORITATIVE  ── Git: product/, decisions/ (accepted ADRs), loops/, seats/, policies/,
                  and the four ledgers (evals, labels, routes, terminal outcomes)
                  · caused_by enforced by src/validate.ts
                  · artifacts immutable via wx exclusive create
                  · accepted ADRs never edited; supersession appends

PROCEDURAL     ── skills / loop definitions / process prompts
                  · may propose; may never assert a fact or a number

CONTEXTUAL     ── memory (if Gate 2 ever opens)
                  · personalization and recall only
                  · never a store of record, never an input to money or verdicts
```

### Dime AI

```
PREDICTION TRUTH ── sports providers → deterministic pipelines (MLBAIModel.py,
                    StrikeoutModel.py, nhl_model_engine.py) → the 8 prediction tables
                    → backtest / calibration / walk-forward validation
                    · zero LLM modules may write here (DA-201, DA-202)

OPERATIONAL      ── agent runtimes (dimeAgent, piAgent), CI, deploy gates

CONTEXTUAL       ── memory / personalization
                    · may alter presentation, ordering, and workflow selection
                    · may NEVER alter projections, probabilities, calibration,
                      model inputs, evaluation results, or sports facts
```

### Conflict-resolution rules (normative)

1. **Current verified evidence beats memory.** A fresh retrieval or a passing check
   supersedes any remembered value.
2. **A current explicit instruction beats a historical preference.** This must be
   *implemented*, not assumed: HH-207 found that no such rule exists upstream, and HH-104
   found memory is actively labelled "authoritative."
3. **Canonical state beats inferred memory.** Where a ledger row and a memory disagree, the
   ledger is correct by definition.
4. **Derived belief may never enter authoritative state.** In Dime this is enforced at the
   database engine, not by review (Gate D0.2).

Rule 4 is the one the audit can make mechanical rather than aspirational, which is why it is
the first roadmap item.

## Architecture comparison

| | Constitutional fit | Capability | Security | Maintainability | Latency | Cost | Vendor dependence | License | Migration | Rollback | Moat |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **A** — fully proprietary; upstreams as reference only | **Full** | Baseline + the 3 borrowed patterns | Best — no new surface | Best — 0 runtime deps preserved | Unchanged | Unchanged; reserve/settle intact | None | Clean | None | N/A | Strongest: the corpus stays the asset |
| **B** — control plane + selected MIT Hermes components + proprietary memory | Partial | Modest gain | New Python surface | **Blocked: HA-601 — no wheel/sdist exists** | — | Hermes has no pre-spend ceiling (HA-502) | High | MIT ok | Large | Hard | Neutral |
| **C** — control plane + Hermes-derived execution + Honcho isolated memory | Weak | Highest raw capability | Two new surfaces incl. AGPL service | Worst — 249 locked deps + Postgres/pgvector | +dialectic per turn | **Two unmetered channels** (HA-502 + HH-109) | Highest | AGPL boundary | Very large | Very hard | Weakened — rented capability |
| **D** — Hermes as process agent behind the existing vendor-neutral boundary + Honcho external | **Good in principle** | High | POC-A: mutation+accounting bounded, **execution not** | Pinned SHA + container, forever | Process spawn per call | Requires an external ceiling wrapper that does not exist | Medium | MIT + AGPL service | Medium | Good — delete the agent config | Neutral |
| **E** — **A + a memory-provider seam + ledger concurrency-safety** | **Full** | A, plus optional memory and real parallelism | Best available | Preserves 0 deps | Bounded, fail-open | Reserve/settle unchanged | None (optional service) | Clean unless Honcho used | Small, staged | Per gate | **Strongest** |

### Selected: Architecture E

**E is A plus the two things the evidence says are actually missing** — a memory seam that
keeps memory optional and non-authoritative, and a concurrency-safe ledger. It is selected
because:

- **B is not available.** Hermes cannot be depended upon: `setup.py` raises on `bdist_wheel`
  and `sdist`, and PyPI/Homebrew are explicitly unsupported (HA-601). This is a fact about
  the world, not a preference.
- **C loses on every axis that Tailered's constitution treats as load-bearing.** It imports
  two unmetered cost channels against `AGENTS.md:20-21`, an AGPL service boundary, and a
  249-package dependency tree, in exchange for capability the platform has no data
  dependency for yet (`docs/blueprint-execution.md:34-42` refuses exactly this).
- **D is coherent but premature.** POC-A proved the boundary bounds mutation and accounting
  but not execution, and Hermes has no mechanism to honour `agent-protocol.md:22`'s hard
  ceiling (HA-502). D stays on the roadmap as a deferred gate, not as the target state.
- **E preserves every property that POC-A verified** and fixes the one POC-C falsified.

## Architecture E in detail

```
┌─────────────────────────── Tailered AI (unchanged core) ───────────────────────────┐
│  charter → mint → ship loop → critique → HUMAN GATE → preview → ADR → EvalRow      │
│                                                                                     │
│  reserve/settle  ·  product/-only writes  ·  shell:false  ·  caused_by  ·  wx       │
│  executable definition of done            ·  zero runtime dependencies              │
│                                                                                     │
│   ┌── NEW: concurrency-safe ledger (Gate 0) ───────────────────────────────────┐   │
│   │  CAS-style id claim + TTL       ← pattern from Hermes Kanban (HA-404)       │   │
│   │  terminal EvalRow never skipped by an ADR collision (ship.ts:420 vs :466)   │   │
│   └────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│   ┌── NEW: procedure_id on RouteLog + EvalRow (Gate 1) ────────────────────────┐   │
│   │  closes the loop Hermes leaves open (HA-306/307) using ledgers that exist   │   │
│   └────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│   ┌── OPTIONAL: MemoryProvider seam (Gate 2) ──────────────────────────────────┐   │
│   │  contract shape borrowed from agent/memory_provider.py (HH-103)            │   │
│   │  · fails open, bounded wait, stale-result discard      (HH-105 pattern)    │   │
│   │  · session-switch + pre-compress IMPLEMENTED           (fixes HH-107/108)  │   │
│   │  · injected in a system-role NON-authoritative block   (fixes HH-104)      │   │
│   │  · no model-write tool                                 (fixes HH-114)      │   │
│   └───────────────────────────┬────────────────────────────────────────────────┘   │
└───────────────────────────────┼─────────────────────────────────────────────────────┘
                                │ optional, over HTTP, unmodified server
                    ┌───────────▼────────────┐
                    │  memory service        │   one workspace PER USER
                    │  (Honcho or other)     │   USE_AUTH=True
                    │  AGPL — service only,  │   no cross-peer tool surface
                    │  never linked source   │   metered on the Dime side
                    └────────────────────────┘
```

### Dime, same architecture, different truth root

```
 user ──> Dime Chat (owner-only today)
            │
            ├── retrieval: single auth-gated SELECT over `games`
            │     └─ SELECT-ONLY credential (Gate D0.2) ← engine-enforced, not convention
            │
            ├── supportedNumericValues derived ONLY from retrieval (Gate D0.1)
            │     └─ memory can never launder a number into grounded evidence
            │
            └── memory (optional, Gate D2): system-role, non-authoritative, per-user
                  workspace, no model-write tool, never a projection input

 projections ── deterministic pipelines ── unchanged, byte-verified across any rollout
                  (hashEngineSource() + mlb_calibration_constants, DA-208 test 1)
```

## What makes E defensible rather than merely conservative

Three properties, each backed by an executed test or an exhaustive code check:

1. **The invariants that matter are already proven to hold.** POC-A drove five adversarial
   agent behaviours through the real runtime: overspend halted with the spend still
   ledgered, out-of-tree writes halted with the target file's hash unchanged, traversal
   halted with the file absent from disk. E changes none of that.
2. **The one falsified invariant is fixed at its actual cause.** POC-C showed the terminal
   `EvalRow` can be lost under concurrency because `appendAdr` precedes `appendTerminalEval`
   in the same `finally`. That is a five-line reordering plus a claim primitive — not an
   architecture change, and emphatically not something an upstream runtime would fix.
3. **Memory is structurally incapable of becoming authority.** Not by policy but by
   construction: it is an optional adapter injected in a non-authoritative region, with no
   write tool, behind a credential that cannot write, feeding a system whose money and
   verdicts are computed by deterministic code (`AGENTS.md:33`).

## What E deliberately refuses

- No adoption of an unmeasured self-modifying skill writer (HA-307).
- No cost model that measures after the fact (HA-502).
- No memory that presents itself as authoritative (HH-104) or that the model can write to
  (HH-114, HO-212).
- No dependency on a project that cannot be packaged (HA-601).
- No vendored AGPL server source (LIC-O-04).
- No parallelism claim before the ledger can survive it (POC-C).

Each refusal is traceable to a specific finding rather than to caution, which is the standard
the brief set: *maximum durable leverage per unit of complexity added*.
