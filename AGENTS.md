# Tailered AI constitution

## Purpose

Tailered AI mints AI-native companies as code: product, decisions, work loops, agent seats, governance gates, labels, evaluation, and economics live as plain files in a founder-owned Git repository.

## Accountable customer

The design target is one accountable founder operating a company with metered machine intelligence.

## Definition of winning

A founder completes a short prose charter and ships a tested preview in the same session. Every terminal outcome remains linked to its spec, decision, gate when one occurred, token usage, cost, and blocker.

## Operating law

- Humans own intent; machines own implementation.
- Every started run appends exactly one terminal `EvalRow`.
- `GateLabel` exists only when a human gate occurred.
- Reserve a hard projected ceiling before each model call and settle actual usage afterward.
- A projected total greater than or equal to $5.00 halts before spending. Valid run cost remains strictly below $5.00.
- Stop after three failed implementation attempts per check.
- Run the narrow failing check first and the full suite before deployment.
- Critique output against this file before the human gate.
- Deployment requires a human approve or edit verdict. Rejection halts.
- The gating demo requires an approve verdict and zero human edits.
- Accepted decisions are immutable. Supersession appends a new ADR with `supersedes`; renderers derive old status.
- Keep the router stateless. The caller supplies `{ attempts }`; every completed route is logged with actual tokens and cost.
- Deterministic code calculates money, tokens, tests, hashes, timing, and ledger aggregates.
- Emit whole files or exact diffs. Never emit placeholders, TODOs, or “rest unchanged.”
- Use plain, precise prose. Label completion claims `VERIFIED`, `INFERRED`, or `UNKNOWN`.
- Use system fonts and one accent. Do not use gradients, glass effects, decorative AI motifs, or template styling.

## Scope boundary

Platform multi-user authentication is outside v1. A company minted by the platform may specify authentication in its product; that product requirement does not expand the platform's own access-control scope. The gating demo excludes auth. “Todo app with auth” remains a non-gating benchmark.
