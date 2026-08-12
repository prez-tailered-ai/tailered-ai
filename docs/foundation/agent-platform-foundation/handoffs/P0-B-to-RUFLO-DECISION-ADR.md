# Handoff: P0-B → RUFLO-DECISION-ADR (Scope 2)

**Status: BLOCKED until the P0-B pull request merges.** No scope may begin from an unmerged
branch. This handoff records what Scope 2 may assume once the merge lands, and nothing before.

## The ADR number is semantic here, numeric only after the merge

PR #6 (merged `482bc04a`) gave **`ADR-004` to the Hermes-Honcho decision.** The Ruflo decision
therefore does NOT use ADR-004. This program refers to it as **`RUFLO-DECISION-ADR`** and
records:

```text
next_adr_id: RESOLVE_FROM_MAIN_AFTER_P0B_MERGE
```

Expected next available number based on current `main` (highest committed decision: `ADR-004`)
and this branch (which mints run-scoped ADRs only in disposable fixtures, none committed):
**probably `ADR-005`** — but Scope 2 must resolve it from the merged repository's
`decisions/` directory (and the allocator, which now owns ADR numbering through
`LedgerTx.allocate({ ADR: 1 })`), never from this prediction.

## What Scope 2 may assume from merged P0-B

1. Canonical appends and ADR creation go through `CompanyLedger.transact` under the repository
   lock; identifiers come from the durable allocator; accepted ADRs stay `wx`-immutable.
2. Every started run leaves durable start records; finalization is intent-first (A-02); an
   interrupted run is detectable by `validate` and completable by `tailered recover`.
3. R1–R8 and A1–A7 are `VERIFIED` per `requirements-status.json` at the implementation head,
   within the stated assurance boundary (process-crash and `SIGKILL`; never power loss).
4. The Ruflo audit corpus (`docs/audits/ruflo/AUD-RUFLO-20260811-221322/`, merged `e6a3bbf`)
   remains the unmodified evidence base; its `NOT_QUALIFIED` verdict and `proposed-adr.md`
   draft are inputs to the decision, not the decision.

## What Scope 2 must not do

Install or integrate Ruflo; modify the audit corpus; reuse `ADR-004`; begin before the PREZ
merge gate passes; write the decision anywhere but `prez-tailered-ai/tailered-ai`.
