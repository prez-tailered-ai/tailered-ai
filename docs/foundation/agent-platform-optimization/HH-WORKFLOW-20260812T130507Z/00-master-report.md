# 00 — Master report: Hermes-Honcho post-closure reconciliation and Tailered agentic workflow benchmark

Run `HH-WORKFLOW-20260812T130507Z` · repository `prez-tailered-ai/tailered-ai` · frozen main `0d55aa9e6fb774903355d8aea2ad40162cde0104`.

## Executive verdict

The Hermes-Honcho program is **fully reconciled and canonical on live main**, and the
repository's agent workflow is **measurably safe and efficient, with M0 (a single
coordinator) as the correct default topology**. Parallel lanes buy latency at ~2× token
cost; blanket adversarial verification bought nothing on routine extraction (0
refutations across 30 verified answers) and belongs only at decision gates. Score:
**91/100**. Nothing in this run authorizes implementation, adoption, or deployment.

## Live repository state (verified, not assumed)

- main `0d55aa9e` = PR #8 merge; ancestors include PR #6 (`482bc04`) and PR #7 (`81bdfd7a`).
- Branch protection: required check `verify`, strict, PR required, conversation
  resolution, admins enforced, force-push/deletion blocked.
- ADR-004: `accepted`, `caused_by: [ADR-003]`, byte-identical to its merged form.
- Audit: CLOSED_VERIFIED; erratum 27 and receipts 28/29 intact; **R-01 CLOSED_VERIFIED**.
- P0-B: R1-R8 8/8, A1-A7 7/7 (machine-readable source at `f2dfed89`); crash matrix 7
  kills + 2 controls all PASS; recovery idempotent, observe-only validation.
- Main health, re-run this session on Node v24.11.1: all gates exit 0, 142/142 tests,
  validate VERIFIED (5 decisions), demo shipped $0.068, 0 vulnerabilities.
- The tasking's `EXPECTED_MAIN_HINT` (`81bdfd7a`) was stale; live evidence governed.
- PR #9 (another session's Ruflo benchmark) is OPEN with **zero path overlap**; not touched.

## Historical baseline

Eight PRs from audit publication to reconciliation in ~19 hours (`09-github-lifecycle-report.md`),
six human merge gates, zero force-pushes, zero history rewrites. Nine supported
incidents are on the record, including: stale status files (twice), a quarantined branch
that moved three times, a below-engine-floor Node run that passed silently, a reporter
false zero, quoted-link false positives, path leakage with post-redaction rehash, and
two of this session's own scanner false alarms — refuted before shipping.

## Method and limits

Deterministic 10-question packet over committed state, frozen answer key, three trials
per mode, exact per-agent tokens/durations from the harness usage report; coordinator
tokens UNKNOWN by instrumentation limit and never invented. Scenario harnesses ran only
in disposable clones under a scratch fake origin. Full method: `01-scope-and-method.md`.

## Mode results (exact)

| Mode | Accuracy | Tokens/trial | Wall/trial | Verdict |
|---|---|---|---|---|
| M0 solo | 30/30 | 85,675 | 134.2 s | **most efficient — selected default** |
| M1 3-lane | 30/30 | 182,968 | 76.4 s | **fastest** — for latency-sensitive or oversized scopes |
| M2 4-lane + verifier | 30/30, 0 refutations | 310,114 | 219.3 s | most expensive and slowest; verify belongs at gates only |
| H curated packet | 10/10 + 2/2 spot-checks | 49,936 | 22.7 s | biggest lever for repeated shapes (single qualitative trial) |

Fastest mode: M1. Most accurate: tie (all). Most token-efficient: H, then M0.
Selected: **M0 default · M1 for latency · gate-scoped adversarial verify · packets for
repeated shapes** (`05-subagent-topology.md`).

## Safety and validity results

- **Concurrent sessions (D): 6/6** — disjoint merge, pre-merge conflict detection, stale
  ownership flag, docs/runtime classification (repaired), abandonment preserved,
  base-advance by merge. Zero stash/reset/rebase/force-push. Live PR #9 handled hands-off.
- **Repair loops (F): 6/6 classes ≤3 attempts**, all failures retained. Root causes
  found: BSD `grep -q -v` false negative; stale compiled test in `dist/`.
- **Test validity (G)**: healthy 142/142 → mutation at `src/sequence.ts:78` → **171
  failures** → restored 142/142. The first "broken" control was INVALID (anchor absent)
  and is excluded from every count — proof the exclusion rule earns its keep.
- **Orientation (A): 4/4** synthetic hazards flagged (stale hint, dirty tree, unrelated
  worktree, advanced origin).
- **Authority**: 28/28 agents wrote nothing; canonical clone 0 dirty, 0 stashes after.

## Single-writer vs parallel-reader

Single-writer, always: worktree mutation, ledgers, manifests, commits, push, PR
lifecycle, CI repair. Parallel-reader, freely (≤5 concurrent): committed-state
extraction, API reads, evidence digestion, adversarial re-checks, history, scans.
Redundant verification identified: blanket M2 on low-risk extraction; duplicate lane
coverage of the same facts outside benchmarking.

## Token and context

Exact subagent spend ~2.69M tokens for the full three-topology measurement. Fixed
per-agent floor ~49k tokens means lanes need ≥ ~3 facts each to pay for themselves.
Curated packets: −42% tokens, −83% latency, with mandatory live spot-checks as the
staleness control. Details: `07-token-context-report.md`.

## Evidence integrity

21 hashed evidence items; JSON/JSONL all parse; event pairing complete; machine paths
redacted; failed and invalid attempts retained under their own paths; append-only
discipline held across the audit corpus (artifact 30 and one manifest row added; zero
original statements rewritten).

## Automation backlog (top of 14, full table in `10-automation-readiness.md`)

1. **AUT-01 repository preflight script** — kills the stale-state class that hit twice.
2. **AUT-02 Node engine-floor guard** — kills the silent-green-on-wrong-node class.
3. **AUT-03 context packet builder** — the largest measured efficiency lever.
Then: evidence collector, false-green detector, docs/runtime classifier (with seeded red
control), ownership registry, PR operator (merge stays human), ledger checker, token
budgeter, report/postmortem/DAG generators, seat contracts. None implemented here.

## Risks and assurance boundary

OPEN: PR #9 sequencing (no collision, PREZ decides order); coordinator tokens UNKNOWN;
benchmark generalizes to committed-state verification, not open-ended design. Carried
forward unchanged: P0-B power-loss/kernel/storage/fsync/cross-host limits; process-ledger
id reuse; disclosed overlap-register path; V-00 machine-account merge authority.
No score overrides any of these.

## Ten scores

10 · 9 · 9 · 9 · 9 · 9 · 10 · 8 · 9 · 9 = **91/100** (bases in `04-benchmark-results.md`).

## Exact PREZ action

Review and merge — or reject — the benchmark pull request for branch
`audit/hermes-honcho-workflow-benchmark`. Nothing else is pending. Later gated work, in
order: (1) decide PR #9 sequencing; (2) authorize AUT-01/02/03 implementation as a
separate scope; (3) any next platform scope (PROCESS-ISOLATION) through its own gate per
ADR-004. Deployment remains NOT AUTHORIZED.
