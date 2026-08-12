# 05 — Subagent topology selection

## Selected default: **M0** (coordinator alone) for bounded verification work

Grounds: accuracy tied at 30/30 across all modes; M0 is 2.1× cheaper than M1 and 3.6×
cheaper than M2; a single authority eliminates synthesis and contradiction handling. The
tasking's own rule applies: parallelism must be reported honestly when it does not pay —
here it did not pay in accuracy, and it paid in latency only.

## When to escalate

| Situation | Topology | Why |
|---|---|---|
| Bounded committed-state verification (≤ ~10 independent facts) | **M0** | this benchmark's direct result |
| A human is waiting, or the scope exceeds one context window | **M1** (specialized read-only lanes + coordinator synthesis) | measured 1.76× latency win; lanes stay read-only; coordinator remains sole writer |
| Merge gates, irreversible actions, high-stakes single claims | **M2-style adversarial verify, scoped to the decision** | 0/30 refutations here shows it is waste as a blanket layer; program history (the PR #3 capability-root REQUEST CHANGES) shows it is decisive exactly at gates |
| Repeated same-shape packets | **H (curated packet)** | −42% tokens, −83% latency; requires a packet builder with live spot-checks against staleness |

## Single-writer tasks (never parallelize across actors)

Worktree mutation; ledger and manifest appends; commits; push; PR lifecycle; CI repair;
anything touching the authoritative branch. One coordinator held all of these for the
entire program (PRs #3-#8 and this run), and the one historical exception — two sessions
converging on P0-B — produced the quarantine incident that cost a re-foundation.

## Parallel-reader tasks (fan out freely, cap 5 concurrent)

Committed-state extraction, GitHub API reads, evidence digestion, adversarial
re-verification, historical reconstruction, scan/link checking. 28 read-only agents
touched the canonical clone today and left it byte-identical.

## Redundant-verification cases found

- Blanket M2 verification of low-risk extraction: 3 × ~84k tokens re-deriving answers
  that three independent trials already agreed on. Redundant at this risk tier.
- Duplicate lane coverage of q4/q9 across M1 and M2 splits was intentional for the
  benchmark but would be duplicate work in production dispatch.
- The right redundancy, kept: independent re-verification of anything that gates a
  merge, a status supersession, or a safety claim (the rule that caught TA-003/TA-004).
