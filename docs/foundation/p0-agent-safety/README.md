# P0 foundation hardening

> ## ✅ P0-A IS CLOSED at `978fbcc31577f6378b8dca4564ceafa6473f1c5e`
>
> Corrective PR **#4** merged **2026-08-12T08:12:42Z**, PREZ merge gate **PASS**.
>
> **`978fbcc` is the minimum valid P0-B foundation.** Any later `main` containing it is
> also valid.
>
> ### Superseded, not deleted
>
> **P0-A implementation v1 merged incomplete at `60adb63`. The capability-root symlink
> class remained vulnerable, so P0-A was not complete at that merge.** That state is
> preserved as history: `60adb63` is **never** a valid P0-B base. See
> [`corrective/CLOSURE-RECEIPT.md`](corrective/CLOSURE-RECEIPT.md),
> [`corrective/SCOPE-1-handoff.md`](corrective/SCOPE-1-handoff.md),
> [`corrective/SCOPE-2-handoff.md`](corrective/SCOPE-2-handoff.md), and section 16 of
> [`p0-a/report.md`](p0-a/report.md).

Two scopes, one directional dependency. Both close defects found by **executing** Tailered
AI, not by reading it.

```text
P0-A  Agent Write Containment
        │ establishes safe mutation authority
        ▼
   PREZ MERGE GATE  (v1)  ──► 60adb63  MERGED INCOMPLETE, invalid base
        │
        ▼
P0-A  corrective closure
        │
        ▼
   PREZ MERGE GATE  (v2)  ──► 978fbcc  PASS — P0-A CLOSED
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
| **P0-A v1** | first implementation | **MERGED INCOMPLETE** at `60adb63` — capability-root symlink class open. Historical; never a valid P0-B base. |
| **P0-A v2** | An agent or gate authorized to write `product/` can mutate only the canonical `product/` subtree, and the capability root itself is verified rather than resolved | **CLOSED** — PR #4 merged at `978fbcc`, PREZ gate PASS |
| **P0-B** | Concurrent runs preserve unique identities, immutable decisions, valid JSONL, and exactly one recoverable terminal `EvalRow` per started run | **AUTHORIZED from `978fbcc`; NOT IMPLEMENTED by this branch** |

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
│   ├── report.md             the P0-A report, incl. §16 process failure and §17 chronology
│   ├── containment-contract.md   the enforced invariant — 12 separately proven rules
│   ├── test-matrix.md        every escape class across v0, v1 and v2
│   ├── evidence-manifest.json    evidence index with hashes
│   └── evidence/             raw command output, harnesses, hashes
├── corrective/               the post-merge correction program
│   ├── CLOSURE-RECEIPT.md    the PREZ merge-gate PASS record for P0-A
│   ├── SCOPE-1-handoff.md    preservation and recoverable baseline
│   ├── SCOPE-2-handoff.md    chronology, supersession, reconciliation
│   ├── PREZ-GATE-PACKET.md   what the merge gate needs, in one place
│   └── evidence/             Scope 1-3 raw command output
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
  the limitation is written down — and it is scored `INVALID`, never `PASS`.
- **Vary the boundary, not just the payload.** A threat model organised only around
  attacker input cannot see an attack that moves the defender's reference point. This
  convention exists because its absence cost this program a merge cycle.
- **History is superseded, never rewritten.** A disproven conclusion stays in the ledger
  with a `SUPERSEDED` successor pointing at it.
