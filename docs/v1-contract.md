# Tailered AI v1 contract

This document resolves the executable v1 scope. The Platform Brief controls intent. This contract controls scope and runtime assertions.

## Feature surface

v1 contains the charter interview, repository mint, one ship loop, and a read-only dashboard. Seat marketplace, billing, platform multi-user authentication, UI polish beyond legibility, the red-team seat, and TaileredBench remain outside v1.

## Platform and minted-product scope are different layers

`OUT_OF_SCOPE.multiuser_auth` governs the Tailered platform. It means v1 does not build Tailered organizations, invitations, roles, or multi-user platform sessions.

A spec passed to the factory governs a product minted by Tailered. That product may require authentication without adding authentication to the Tailered platform. “Todo app with auth” is therefore a valid non-gating benchmark, not a platform scope contradiction.

The gating demonstration is deliberately smaller: a single-user todo app without auth. Its purpose is to prove the company loop, not the complexity of the example application.

## Terminal records

Every started ship-loop run appends exactly one `EvalRow`, including runs that halt before a gate. The terminal outcome is one of:

- `shipped`
- `halted_attempts`
- `halted_budget`
- `rejected`

`preview_url` is optional because halted and rejected runs do not deploy. `gate_label_id` is optional because a `GateLabel` exists only when the human gate occurred. Each terminal run still creates an ADR so `adr_id` and the decision graph remain complete.

Halted and rejected rows are first-class evaluation data. They supply the failure half of tokens-per-outcome analysis and the rejection half of the preference corpus.

## Reserve and settle

Before an agent call, the runtime reserves that call's hard projected maximum cost and token count. It denies the reservation when:

```text
settled + reserved + projected >= $5.00
```

The call settles actual tokens and cost after it completes. A process failure settles at the reserved ceiling because v1 will not silently discard potentially incurred spend. An agent response above its declared ceiling is an accounting invariant failure and halts the run.

All valid completed run costs are strictly less than $5.00.

## Stateless routing

The routing signature is:

```ts
route(taskKind, signals = { attempts: 0 })
```

The caller supplies the stuck signal. The third code-generation call receives `attempts: 2` and escalates to the frontier tier. The router owns no run state. Each completed decision is appended to `evals/routes.jsonl` with its reason, tier, model alias, tokens, and cost.

Model aliases come from the minted company's `tailered.config.json`. The runtime has no second active registry. Changing a tier alias changes subsequent model requests without touching routing or ship-loop code.

## Replay and context capture

Every executed agent call writes one immutable trace containing its route, hard projection, exact response payload or failure, metered usage, and causal links. Every distinct repository context is stored once per run and referenced from call traces by its content hash.

Route logs record context bytes, cache hit, and assembly time. This makes the v1 context cache measurable and preserves the inputs required for later replay tooling without building the v3 replay engine.

`EvalRow.outcome` is the v1 terminal outcome ledger. A second physical outcomes ledger would duplicate terminal state and create a drift risk, so v1 does not add one. The v2 format specification may split that logical ledger only with migration and consistency rules.

## ADR supersession

On-disk ADR status is `proposed` or `accepted`. Supersession appends a new ADR with `supersedes: old_id`; it never touches the old file. The new ADR also carries the old ID in `caused_by`, making `supersedes` a typed causal edge. Renderers derive the old decision's `superseded` status.

## Gating definition of done

The executable gating run must satisfy every assertion:

- repository mint validates;
- the single-user todo app has a preview URL;
- all generated acceptance tests pass;
- the gate verdict is exactly `approve`;
- the label contains no human edit diff;
- at least two system-written ADRs exist after the charter;
- exactly one terminal eval exists for the run;
- actual cost is below the exclusive $5.00 cap;
- full demo wall time is below ten minutes.

An `edit` verdict is valid platform behavior. The runtime applies the exact product edits and re-runs the full suite before deployment. It still fails the gating DoD because that proof requires `approve` and zero human edits.
