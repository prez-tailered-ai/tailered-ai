# P0 foundation hardening

Two scopes, one directional dependency. Both close defects found by **executing** Tailered
AI, not by reading it.

```text
P0-A  Agent Write Containment
        │ establishes safe mutation authority
        ▼
   PREZ MERGE GATE
        │
        ▼
P0-B  Ledger Concurrency + Exactly-Once Finalization
        │ establishes safe concurrent execution
        ▼
   PREZ MERGE GATE
```

P0-B inherits the validated code, testing conventions, evidence format, and merged SHA
created by P0-A. Neither scope may begin the next until PREZ merges.

## Scope status

| Scope | Objective | Status |
|---|---|---|
| **P0-A** | An agent or gate authorized to write `product/` can mutate only the canonical `product/` subtree | **COMPLETE — awaiting PREZ merge gate** |
| **P0-B** | Concurrent runs preserve unique identities, immutable decisions, valid JSONL, and exactly one recoverable terminal `EvalRow` per started run | **NOT STARTED — blocked on the P0-A merge** |

## Why these two, in this order

P0-A establishes *what an agent may change*. P0-B establishes *what happens when several
agents change things at once*. Concurrency work built on an unsound write boundary would
multiply the blast radius of every race, so containment lands first.

Both defects share a shape worth naming: **the system reported success while the underlying
guarantee failed.** A traversal write shipped with `outcome: "shipped"`. A concurrent run
lost its terminal record while the surviving runs looked healthy. Detection after the fact is
not containment.

## Layout

```text
docs/foundation/p0-agent-safety/
├── README.md                 this file
├── execution-ledger.jsonl    append-only record of every executed step
├── p0-a/
│   ├── report.md             completion report
│   ├── containment-contract.md   the enforced invariant, in full
│   ├── test-matrix.md        every escape class, before and after
│   ├── evidence-manifest.json    evidence index with hashes
│   └── evidence/             raw command output, harnesses, hashes
└── handoffs/
    └── P0-A-to-P0-B.md       the merged-state assumptions P0-B requires
```

## Conventions established by P0-A, inherited by P0-B

- **Disposable fixtures only.** Attacks and races run against temporary companies. The
  canonical repository is never a target, and its protected-surface hashes are compared
  before and after every scope.
- **Deterministic agents.** No model calls, no API spend, for any infrastructure proof.
- **Evidence before assertion.** Every claim cites a captured command result.
- **Exit codes read directly.** Never through a pipe — `cmd | tail` returns `tail`'s status
  and has already produced one false pass in this program.
- **One test per failure class.** A regression must name its exact mechanism.
- **Hash-based assertions.** Protected surfaces are compared byte-for-byte, not by the
  absence of an exception.
- **Caveats recorded, not hidden.** Where a harness could not test what it appeared to test,
  the limitation is written down.
