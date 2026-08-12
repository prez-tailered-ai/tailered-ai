# 18 — Tailered-native reference architecture

A concrete architecture for `prez-tailered-ai/tailered-ai` as the repository in which agents
are built, evaluated, and deployed. Five candidates are compared against evidence, one is
selected, and every component carries an explicit provenance label.

Provenance labels: `TAILERED EXISTING` · `TAILERED NEW` · `HERMES-INSPIRED` ·
`HONCHO-INSPIRED` · `INTEROPERABILITY BOUNDARY` · `REJECTED UPSTREAM DESIGN`.

---

## 1. The knowledge hierarchy

```text
CANONICAL STATE            accepted ADRs · policies · specs · seats · loops ·
(authoritative)            the four ledgers · execution traces · agent versions
                           · caused_by enforced · artifacts immutable via wx
                           · accepted decisions never edited; supersession appends
        ▲
        │  may never be silently overwritten
        │
PROCEDURAL KNOWLEDGE       skills · playbooks · workflows · verification recipes
(how work is done)         · proposes; never asserts a fact or a number
        ▲
        │
CONTEXTUAL MEMORY          prior interactions · learned preferences · recurring
(useful, not authoritative) context · derived hypotheses
                           · injected in a non-authoritative region
                           · never an input to money, verdicts, or completion
```

### Conflict-resolution order (normative, and testable)

```text
canonical verified state  >  current explicit instruction  >  trusted procedural rule
                          >  contextual memory  >  inferred hypothesis
```

Each precedence step exists because the audit found a system that gets it wrong:

- Memory must lose to canonical state, because Honcho has **no supersession** and its
  `contradiction` level is **unreachable** (HO-207, HO-208).
- Memory must lose to the current instruction, because **no precedence rule exists upstream**
  (HH-207) and memory is actively labelled "authoritative" (HH-104).
- Derived hypotheses rank last, because their provenance is **unvalidated model-supplied
  strings** (HO-204).

**Testability requirement:** this hierarchy is not a doctrine statement. If memory is ever
built, a test must assert that a memory value contradicting a ledger value loses, and that a
current instruction contradicting a remembered preference wins.

## 2. Architecture comparison

| | Constitutional fit | Capability | Security | Maintainability | Cost control | Licensing | Migration | Rollback | Long-term moat |
|---|---|---|---|---|---|---|---|---|---|
| **A** — fully proprietary; upstreams as reference only | **Full** | Baseline + 3 borrowed patterns | Best — no new surface | Best — 0 deps preserved | Reserve/settle intact | Clean | None | N/A | Strong |
| **B** — control plane + selected Hermes components | Partial | Modest | New Python surface | **Blocked: HA-601, no installable artifact exists** | Hermes has no pre-spend ceiling | MIT ok | Large | Hard | Neutral |
| **C** — control plane + Hermes execution + Honcho memory | Weak | Highest raw | Two new surfaces incl. AGPL service | Worst — 249 locked deps + Postgres/pgvector | **Two unmetered channels** | AGPL boundary | Very large | Very hard | Weakened |
| **D** — Hermes as process agent behind the existing boundary | Good in principle | High | POC-A: mutation+accounting bounded, **execution not** | Pinned SHA + container, forever | Needs an external ceiling wrapper that does not exist | MIT + AGPL service | Medium | Good | Neutral |
| **E** — **A + memory seam + concurrency-safe ledger + procedure measurement** | **Full** | A, plus optional memory, real parallelism, and measurable procedures | Best available | Preserves 0 deps | Reserve/settle extended to every channel | Clean unless Honcho used | Small, staged | Per gate | **Strongest** |

### Selected: Architecture E

- **B is unavailable**, not merely unattractive: Hermes publishes no wheel and no sdist, and
  PyPI/Homebrew are explicitly unsupported (HA-601).
- **C** loses on every axis the constitution treats as load-bearing — two unmetered cost
  channels against the fourth operating law, an AGPL service boundary, and a 249-package
  dependency tree — in exchange for capability whose data dependency is unmet.
- **D is coherent but premature.** POC-A proved the boundary bounds mutation and accounting
  but not execution, and Hermes has no mechanism to honour the protocol's hard ceiling
  (HA-502). It stays on the roadmap as a deferred gate, not the target state.
- **E preserves every property POC-A verified**, fixes the one POC-C falsified, and adds the
  one capability no examined system has.

## 3. Architecture E, with provenance

```text
┌──────────────────────── TAILERED CONTROL PLANE ─────────────────────────────┐
│                     (sole deployment authority)                             │
│                                                                             │
│  Charter → Mint → Ship loop → Critique → HUMAN GATE → Preview → ADR → Eval  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ EVIDENCE LEDGER            [TAILERED EXISTING]                        │  │
│  │  evals · labels · routes · call traces · caused_by · wx-immutable     │  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │ COST ACCOUNTING            [TAILERED EXISTING]                        │  │
│  │  reserve → settle, hard pre-call ceiling, integer micro-dollars       │  │
│  │  EXTENDED to every new spend channel            [TAILERED NEW]        │  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │ POLICY / APPROVAL ENGINE   [TAILERED EXISTING]                        │  │
│  │  human gate on the irreversible; every verdict a labelled record      │  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │ MODEL ROUTER               [TAILERED EXISTING]  stateless, pure       │  │
│  │  provider profiles, if ever needed              [HERMES-INSPIRED]     │  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │ EVALUATION ENGINE          [TAILERED EXISTING]  executable DoD        │  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │ WORK GRAPH + TASK OWNERSHIP                     [TAILERED NEW]        │  │
│  │  CAS claim + TTL + liveness + heartbeat         [HERMES-INSPIRED]     │  │
│  │  concurrency-safe ids, crash-safe finalisation  → artifact 25         │  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │ PROCEDURE REGISTRY + SCORECARDS                 [TAILERED NEW]        │  │
│  │  SKILL.md-shaped format                         [HERMES-INSPIRED]     │  │
│  │  procedure_id → EvalRow join, promotion/rollback → artifact 26        │  │
│  │  autonomous unmeasured writer                   [REJECTED UPSTREAM]   │  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │ AGENT RUNTIME + REGISTRY                        [TAILERED EXISTING]   │  │
│  │  vendor-neutral stdin/stdout process boundary                         │  │
│  │  prompt-cache preservation, when multi-turn     [HERMES-INSPIRED]     │  │
│  │  narrow-waist tool discipline                   [HERMES-INSPIRED]     │  │
│  │  in-process unisolated subagents                [REJECTED UPSTREAM]   │  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │ SANDBOX / WORKER LAYER                          [TAILERED NEW]        │  │
│  │  disposable worker, no ambient creds, scoped egress                   │  │
│  │  worktree-per-task                              [HERMES-INSPIRED]     │  │
│  │  — required because BOTH systems state the OS is the only boundary    │  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │ MEMORY INTERFACE (optional)                     [TAILERED NEW]        │  │
│  │  provider contract, memory is optional          [HERMES-INSPIRED]     │  │
│  │  fail-open, bounded wait, stale-result discard  [HERMES-INSPIRED]     │  │
│  │  session-switch + pre-compress IMPLEMENTED      [TAILERED NEW]        │  │
│  │    (Honcho leaves both empty — HH-107, HH-108)                        │  │
│  │  memory-as-authoritative injection              [REJECTED UPSTREAM]   │  │
│  │  model-write belief tool                        [REJECTED UPSTREAM]   │  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │ OBSERVABILITY              [TAILERED EXISTING]                        │  │
│  │  tokens · cost · model identity · context hash/bytes/cache · lineage  │  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │ DEPLOYMENT CONTROLLER      [TAILERED EXISTING + NEW]                  │  │
│  │  git revert rollback · append-only ledgers · agent versioning         │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │  [INTEROPERABILITY BOUNDARY]
                                   │  optional · HTTP · unmodified server
                      ┌────────────▼─────────────┐
                      │  external memory service │  one workspace per isolation unit
                      │  (Honcho or other)       │  USE_AUTH=True
                      │  AGPL — service only,    │  no cross-peer tool surface
                      │  never linked source     │  spend metered by the control plane
                      └──────────────────────────┘
```

## 4. Component provenance summary

| Component | Provenance | Note |
|---|---|---|
| Evidence ledger, `caused_by`, immutability | `TAILERED EXISTING` | Stronger than either upstream |
| Reserve/settle cost ceiling | `TAILERED EXISTING` | The property both upstreams lack |
| Executable definition of done | `TAILERED EXISTING` | Hermes only *infers* completion |
| Human gate + preference labels | `TAILERED EXISTING` | Not a capability either upstream has |
| Stateless router | `TAILERED EXISTING` | Keep pure |
| Vendor-neutral process boundary | `TAILERED EXISTING` | Bounds mutation + accounting (POC-A) |
| Concurrency-safe ledger + task ownership | `TAILERED NEW` + `HERMES-INSPIRED` | Pattern from Kanban CAS; code written here |
| Procedure registry + scorecards | `TAILERED NEW` + `HERMES-INSPIRED` | Format borrowed; **measurement is original** |
| Sandbox/worker layer | `TAILERED NEW` + `HERMES-INSPIRED` | Both systems agree the OS is the boundary |
| Memory interface | `TAILERED NEW` + `HERMES-INSPIRED` | Contract borrowed; the two unimplemented hooks are filled in |
| External memory service | `INTEROPERABILITY BOUNDARY` | Optional, gated, never linked |
| Prompt-cache preservation | `HERMES-INSPIRED` | Applies once agents hold conversations |
| Autonomous unmeasured skill writer | `REJECTED UPSTREAM DESIGN` | HA-307/308/316 |
| In-process unisolated subagents | `REJECTED UPSTREAM DESIGN` | HA-401/402 |
| Memory-as-authoritative injection | `REJECTED UPSTREAM DESIGN` | HH-104 |
| Post-hoc, lossy cost accounting | `REJECTED UPSTREAM DESIGN` | HA-502/513 |
| Honcho epistemic model as store of record | `REJECTED UPSTREAM DESIGN` | HO-204/207/208 |

## 5. Why E is defensible rather than merely conservative

1. **The invariants that matter are already proven to hold.** POC-A drove five adversarial
   agent behaviours through the real runtime: overspend halted with the spend still ledgered,
   out-of-tree writes halted with the target file's hash unchanged, traversal halted with the
   file absent from disk. E changes none of that.
2. **The one falsified invariant is fixed at its actual cause.** POC-C showed the terminal
   `EvalRow` can be lost under concurrency. That is a finalisation-ordering fix plus a claim
   primitive — not an architecture change, and emphatically not something an upstream runtime
   would repair.
3. **Memory is structurally incapable of becoming authority** — not by policy but by
   construction: an optional adapter, injected in a non-authoritative region, with no write
   tool, feeding a system whose money and verdicts are computed by deterministic code.
4. **Every rejection is traceable to a specific finding**, not to caution.

## 6. Scaling from a few agents to a workforce

The architecture scales along three axes the audit found to be independent:

- **Correctness under contention** — the ledger claim primitive (artifact 25). Without it,
  nothing else scales.
- **Isolation per worker** — disposable workers plus worktree-per-task. Hermes's Kanban lane
  demonstrates this works; its `delegate_task` lane demonstrates what happens without it.
- **Bounded spend per unit of work** — reserve/settle extended to every channel. This is the
  axis both upstreams neglect, and the one that decides whether a large fleet is affordable
  or merely possible.

Capacity beyond a single host is a later question; nothing in E forecloses it, and the
process boundary is already the natural seam for remote workers.
