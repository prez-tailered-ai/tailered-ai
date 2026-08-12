# Master report — Ruflo post-audit decision and Tailered agentic workflow benchmark

**Run:** `AGENT-WORKFLOW-20260812T122100Z` · **Coordinator and sole writer:** Fable 5
**Base:** current `main` `0d55aa9e6fb774903355d8aea2ad40162cde0104` (verified live; the tasking
hint `81bdfd7a` was stale — main had advanced through PR #8)
**Branch:** `audit/ruflo-post-p0b-workflow-readiness`

## Executive verdict

Both objectives completed to the PREZ gate. The Ruflo decision is formally **proposed** as
`decisions/ADR-005.md` (number resolved dynamically from current main; only PREZ may accept
it). The benchmark scored **90/100** across the ten dimensions with **zero hard blockers**: no
false PASS, no unauthorized write, no secret, no evidence overwrite, no force-push, no invented
token count, and no subagent claim accepted unverified. The single most valuable measurement:
the smallest topology wins by default, and the one component that earned a larger topology's
cost was the **independent adversarial verifier**, which caught a claim that went stale while
the run itself changed the repository. No Ruflo runtime was installed or executed. No
deployment occurred.

## Current repository state

`main` `0d55aa9e` (PR #8 was docs-only reconciliation); PR #7 merged P0-B at `81bdfd7a`;
branch protection requires the `verify` check, strict; `decisions/` held ADR-000..ADR-004 at
preflight; P0-B `requirements-status.json` on main reads R1–R8 `VERIFIED` 8/8, A1–A7 `VERIFIED`
7/7; zero open PRs at preflight; seven active worktrees enumerated and classified, none
overlapping this scope.

## The proposed Ruflo decision

`decisions/ADR-005.md`, status `proposed`, `caused_by: ["ADR-004"]`. It declines Ruflo v3.37.0
as an execution substrate (`NOT_QUALIFIED`; 212 findings — 33 CRITICAL, 72 HIGH, 66 MEDIUM, 20
LOW, 21 INFO; 42 of 90 claims refuted; zero DURABLE), authorizes no Ruflo component of any
kind, permits independent reimplementation of the four favorably assessed ideas without Ruflo
authority, keeps Ruflo an external read-only reference, and requires a new pinned audit for
any requalification. It reconciles the audit's unnumbered draft with current numbering
(ADR-004 belongs to Hermes-Honcho) and with merged P0-B. The audit corpus is untouched; the
append-only pointer `17-post-p0b-workflow-readiness.md` records the disposition.

## Benchmark method and limitations

Frozen plan (`02-benchmark-plan.md`) before any experiment; fixed ten-question set with
objective ground truth; three topologies; six scenarios; disposable clones and worktrees for
everything destructive; single writer throughout. Limitations, declared not corrected: warm
coordinator (this session built P0-B) biases M0 wall time; one trial per mode; coordinator
tokens structurally UNKNOWN in this harness — lane tokens are exact, harness-reported.

## Mode results

**M0 (coordinator only):** 0 agent tokens, 1 batched tool call, 0.23s of commands —
first-pass 7/10 clean. Its `grep -c '^test('` proxy undercounted loop-generated tests (113 vs
the runner's 142); one narrow repair round closed all gaps. Lesson: cheap first passes are
fine only welded to the repair discipline, and the instrument of record (the runner) outranks
any proxy.

**M1 (3 read-only lanes):** 77,743 exact lane tokens, ≈30s parallel wall, 19 lane tool-uses,
10/10 correct with *more* precision than M0's first pass (exclusive-cap field semantics,
exit-code precedence).

**M2 (4 tighter-packet lanes + adversarial verifier):** lanes 88,248 tokens ≈21s, 12 tool-uses
(tighter packets cut lane work at equal accuracy); verifier 52,506 tokens, 167s, 32 tool-uses.
**The verifier refuted C1 — correctly.** The lanes truthfully answered "highest ADR = ADR-004";
between their reads and verification this scope created ADR-005, so the claim was stale at use
time. Every topology without late independent verification would have shipped it. The verifier
also flagged the 6-barrier-vs-7-kill-point conflation trap, independently corroborated the
grep-vs-runner counting trap (static 114 vs runtime 142), and marked that the closing demo and
audit evidence are valid only on their retry attempts.

**Fastest mode:** M0 (0.23s + one repair round). **Most accurate first pass:** M1 and M2 lanes
(tie, 10/10). **Most token-efficient:** M0 (0 agent tokens). **Best under drift or integrity
weight:** M2's verifier component. **Best default:** **M0 with escalation rules ("M0+")** —
see `04-subagent-topology.md`.

## Task-class routing (validated)

Single-agent (single-writer always, and single-reader by default): bounded questions, ledger
writes, commits, PRs, ADR authorship, anything below the ~17.7k-token lane floor. Parallel
readers: broad disjoint research above the floor, with generated context packets (62 ms to
build; −35% lane tokens; −88% lane wall; tool-uses 19→12). Redundant verification (exactly one
adversarial lane): merge gates, security and data-integrity claims, ADR semantics, and any
claim that can drift between read and use.

## Scenario results

**A — live orientation:** the tasking prompt's stale main hint was caught in one fetch; 3s,
13 commands to a fully trusted state; zero stale facts accepted. **D — repair loops:** 6/6
injected classes detected, repaired ≤2 valid attempts each, every failed attempt retained —
plus two unplanned catches worth more than the injections: a red-for-the-wrong-reason
(`tsc: not found` in a bare clone) correctly classed INVALID rather than counted as detection,
and the narrow-rerun ghost (tsc never deletes outputs; the compiled seed survived source
removal; only the dependent full rerun caught it). **E — concurrency:** 6/6 synthetic cases
plus two live composition events; merge-tree as the pre-commit oracle; append-only ledgers
merged by union with zero loss; abandoned worktrees preserved untouched. **F — context:**
correctness tied across strategies; packets won on cost; the ~17.7k-token per-lane floor is
the decisive dispatch threshold.

## Logging and evidence

Two-event `execution-ledger.jsonl` (all phases paired), `metrics.json` (per
scenario×mode×lane, exact tokens where the harness reports them, `UNKNOWN` elsewhere),
`evidence-index.json` with SHA-256 per artifact, raw scenario transcripts under `evidence/`.
The run's own PR and CI identifiers postdate the committed corpus by construction and are
bound in the PR body and the terminal response.

## Automation backlog (top of `09-automation-readiness.md`)

Implement first: **(1) the repository preflight script** and **(2) the context-packet
builder** — both read-only, both independently verifiable, and together they attack the two
largest measured recurring costs (hand-rolled orientation; lane overhead). Then: the argv-array
entry point for the command collector (kills the twice-hit word-splitting class), the overlap
monitor, and the false-green harness lint. Fourteen candidates total, each with owner,
trigger, contracts, verifier, failure mode, rollback, and human gate; none is authorized by
being listed.

## Residual risks and assurance boundary

`10-risk-register.md`: measurement biases (warm coordinator, single trials, UNKNOWN
coordinator tokens), packet-omission risk on open-ended tasks (rule frozen: packets only for
bounded questions), possible ADR-number race before merge (PREZ re-checks at merge), and the
subagent floor's dependence on harness version. Process-crash recovery of the underlying
platform is P0-B-verified; power loss remains outside every assurance boundary in this
program. This benchmark measured THIS repository on THIS harness; its numbers are decision
inputs, not physical constants.

## Next PREZ decision

Review the draft pull request: **accept, amend, or reject `decisions/ADR-005.md`** (acceptance
is the founder's act and would be a later commit changing `status` to `accepted`), and note
the benchmark's standing routing rules. Later implementation gates, each separate: automation
candidates #1/#2, process-agent isolation (Scope 3), any production automation.
