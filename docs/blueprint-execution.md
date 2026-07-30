# Blueprint execution map

This file records how the Full-System Blueprint affects the executable repository. Precedence remains:

1. `v1-contract.md` authorizes scope.
2. `platform-brief.md` controls intent.
3. `full-system-blueprint.md` controls trajectory.

The blueprint is not blanket authorization for later stages. A subsystem activates only when its stated data dependency and entry gate are verified.

## Active in v1

| Foundation | Executable form | Captured evidence |
| --- | --- | --- |
| Company substrate | Plain product, decision, loop, seat, policy, eval, label, and route files | Repository validator and append-only writes |
| Model registry | Tier aliases loaded from `tailered.config.json` for every run | Model alias on every route and call trace |
| Static router | Stateless task policy with third-attempt frontier escalation | `evals/routes.jsonl` joined to terminal evals by `run_id` |
| Context cache | One shared snapshot per repository state per run | Hash, snapshot reference, bytes, hit/miss, and assembly time per route |
| Factory | Spec → tests → bounded implementation → critique → gate → preview → ADR → eval | Stored spec, call traces, checks, label, receipt, ADR, terminal eval |
| Constitution | Charter-rendered prose checked before the deploy gate | Critique payload stored in the call trace and gate context |
| Critique-first gate | Human reviews artifact, critique, and accounting together | Labeled approve, reject, or edit verdict with full context |
| Reserve/settle | Hard reservation before execution; actual or conservative failure settlement after | Projection and settled usage in every call trace |
| Replay invariant | Exact executed-call inputs and outputs retained as plain files | Shared context snapshots plus append-only call traces |
| Read-only dashboard | Pure render of ADR and eval ledgers | No dashboard-owned state |

## Explicit V1 representations

The blueprint names four logical ledgers: evals, labels, routes, and outcomes. In v1, terminal outcome is a required field on the one-per-run `EvalRow`. Creating a second physical outcomes ledger would duplicate authoritative terminal state, so the contract keeps one terminal record. A later format version may split it only with consistency and migration rules.

Capability manifests are not fabricated for abstract aliases such as `best-available`. V1 records hard cost and token ceilings from the process agent on every call. Provider-specific context windows, tools, and prices enter the registry only when a concrete provider adapter supplies verified values.

Deploy is the only irreversible action implemented in v1, so it is the only live human gate. Money movement and external sends receive gates when those executable actions exist; declarative phantom gates would collect no labels and therefore fail the blueprint's own feed-data rule.

## Data-gated, not active

| Stage | Refused until |
| --- | --- |
| v2 durable runtime, curriculum, allocation, billing, calibration, amendments, format specification | At least ten companies, complete linked-ledger audit, and a green gating demo |
| v3 learned routing, preference learning, RLAIF, oversight, adversary, benchmark, rebalancer, partitioning, distillation, blame-walker, trust-region evolution | Corpus thresholds derived from v2 evidence and held-out calibration beating the static fallbacks |
| v4 world model, adapters, sovereignty, Hub, transparency reports | Learned components beat fallbacks in production, economics are positive, and the format is stable across two versions |

The executable policy is simple: capture the inputs required by later systems now; do not instantiate those systems before their data exists.
