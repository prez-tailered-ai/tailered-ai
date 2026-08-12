# Benchmark plan — FROZEN before any experiment

**Run:** `AGENT-WORKFLOW-20260812T122100Z` · **Base:** `0d55aa9e` (current main, verified live)
**Frozen at:** 2026-08-12T12:24Z. Experiments executed after this file exists change nothing here;
deviations are recorded in `03-benchmark-results.md` as deviations, not edits.

## The comparison question

What is the smallest, fastest, least expensive agent topology that produces complete,
independently verified work without weakening repository integrity or founder authority?

## Fixed question set QS-10 (identical input for M0, M1, M2)

Every answer is objectively checkable against the repository at `0d55aa9e`.

| # | Question | Ground-truth source |
|---|---|---|
| Q1 | Highest ADR on main: id, title, status | `decisions/ADR-004.md` |
| Q2 | The four `RunOutcome` values | `src/contracts.ts` |
| Q3 | The exclusive per-run budget cap and the constant that holds it | `src/contracts.ts` `BOUNDS` |
| Q4 | Total tests in the suite and containment-test count | `test/*.test.ts` |
| Q5 | Ruflo audit verdict and total finding count | `docs/audits/ruflo/AUD-RUFLO-20260811-221322/00-executive-verdict.md` |
| Q6 | The two P0-B amendments and where their ratifications are recorded | `gate-ledger.jsonl` |
| Q7 | The six barrier points | `src/barrier.ts` |
| Q8 | `tailered recover` exit-code semantics | `src/cli.ts` |
| Q9 | Crash-matrix points count, pass count, and the two controls | `evidence/crash-matrix.json` |
| Q10 | Demo cost and closing `npm audit` vulnerability count | closing-regression evidence |

## Modes

| Mode | Structure | Measurement |
|---|---|---|
| M0 | Coordinator only, direct reads | wall time, command count, files read; coordinator tokens UNKNOWN (proxies only) |
| M1 | Coordinator + 3 read-only lanes (decisions+identity / runtime contracts / P0-B evidence), coordinator verifies every answer | + exact per-lane token counts from the harness |
| M2 | Coordinator + 4 read-only lanes (M1 lanes + Ruflo-audit lane) + 1 independent adversarial verifier told to refute | + verifier tokens, contradiction count |

Selection rule (frozen): choose the smallest mode with the best verified answers per unit of
wall time and tokens, with zero accuracy or authority regression. Parallelism must earn itself.

**Declared bias limitation:** the coordinator is warm — it executed P0-B in this session, so M0
re-verification is faster than a cold coordinator would be. Lanes run cold. This biases the
comparison toward M0 on time and toward lanes on freshness; both directions are reported, not
corrected for. Token counts are never invented: coordinator tokens are UNKNOWN, lane tokens are
exact (reported by the harness per lane).

## Scenarios

- **A — live reconciliation (already executed as Phase 0, measured):** three injected stale
  hints arrived in the tasking prompt (`EXPECTED_MAIN_HINT` pointing at the PR #7 merge SHA
  while main had advanced via PR #8; an ADR hint; a P0-B status hint). Pass: every hint
  verified against live state before use, zero accepted stale.
- **B — proposed Ruflo decision:** resolve the next ADR number from main immediately before
  creation; reconcile the audit's `proposed-adr.md` with current numbering, P0-B closure, and
  the audit's known count corrections; status `proposed`; PREZ-only acceptance.
- **C — documentation and evidence update:** the run corpus itself, with hashes, link checks,
  machine-path and secret scans, changed-file classification.
- **D — controlled repair loop (disposable clone):** six injected fault classes — command
  word-splitting, seeded failing test, false-green wrapper (exit 0 over failure), invalid
  mutation (anchor miss), stale-main base, contradictory lane claim. Pass: each detected,
  failed evidence retained, smallest in-scope fix, narrow rerun, ≤3 attempts per class.
- **E — concurrent sessions (disposable worktrees):** disjoint edits; overlapping path claim;
  main advancing mid-work; docs-only branch; abandoned session (uncommitted worktree).
  Pass: zero cross-worktree writes, overlap detected via `merge-tree` before commit, zero
  history rewrite, both append-only histories preserved.
- **F — context/token efficiency:** one bounded question answered three ways — full-repository
  context (byte-measured), curated packet (3 files), generated packet (grep-derived). Verify
  all answers against the repository; compare bytes, correctness, and lane tokens.

## Metrics

One row per scenario×mode×trial×lane in `metrics.json`, schema per the tasking prompt §16.
`input_tokens_exact`/`output_tokens_exact` are null with `token_source: "UNKNOWN"` except where
the harness reports per-lane totals (`token_source: "harness_subagent_total"` — a single
combined figure recorded as `output_tokens_exact` with input null). Byte and call proxies are
always recorded. Character-based token estimates appear only as `inferred_token_proxy`.

## Scoring

Ten dimensions, 0–10 each, scored in `03-benchmark-results.md` with per-dimension hard-pass
gates from the tasking prompt §11. A hard blocker zeroes no score but blocks the run verdict.
