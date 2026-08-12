# 09 — GitHub and evidence lifecycle (historical baseline + Scenario E)

## Historical baseline — the eight-PR chain, reconstructed from live GitHub

Source: [`evidence/history-prs.json`](evidence/history-prs.json). All merged by
`prez-tailered-ai`, all with `verify` green, all merge commits, zero force-pushes to
published branches, zero squashes on evidence-bearing history.

| PR | Title (abbrev.) | Created → merged (UTC) | Files | +/− | Merge |
|---|---|---|---|---|---|
| #1 | Hermes-Honcho audit publication | 2026-08-12 01:10 | — | — | `5eea776` |
| #2 | Ruflo qualification audit | → 06:53 | — | — | `e6a3bbf` |
| #3 | P0-A containment v1 | 06:27 → 06:54 | 21 | +1,968/−6 | `60adb63` |
| #4 | P0-A capability-root symlink fix | 07:50 → 08:12 | 35 | +2,767/−188 | `978fbcc` |
| #5 | P0-A corrective closure receipt | 09:19 → 09:20 | 15 | +464/−37 | `38e08bf` |
| #6 | Audit closure + ADR-004 + erratum | 10:02 → 10:22 | 11 | +477/−1 | `482bc04` |
| #7 | P0-B ledger concurrency | 11:17 → 11:23 | 254 | +18,014/−183 | `81bdfd7` |
| #8 | Post-closure reconciliation (R-01) | 12:14 → 12:15 | 11 | +300/−16 | `0d55aa9` |

Audit publication to full reconciliation: **~19 hours**, six substantive human merge
gates, every one stopping exactly at PREZ.

## Supported incidents (each has retained first-party evidence; history not rewritten)

1. **Stale state**: `program-status.json` still claimed `PENDING_FINAL_MERGE_GATE` after
   PR #7 merged; de-staled by PR #8. This run found the tasking's own
   `EXPECTED_MAIN_HINT` stale the same way.
2. **Moving remediation branch**: quarantined `fix/p0-b-ledger-concurrency` tip moved
   three times while frozen (`df195c5` → `efb4417` → `94074af`).
3. **Session-ownership ambiguity**: resolved by the Session Isolation Override; one
   writer per branch since.
4. **Wrong Node, green tests**: v22 run passed 38/38 below the `>=24` engine floor;
   excluded from counts; authoritative rerun on v24.11.1.
5. **Reporter false zero**: TAP-shaped greps counted 0 tests against a spec-reporter
   run; fixed with reporter-agnostic extraction.
6. **Quoted-text link false positive**: `../../LICENSE` inside a verbatim Honcho
   quotation; deliberately not "fixed".
7. **Path leakage + post-redaction rehash**: worktree paths redacted, manifests
   rehashed; one disclosed leak remains in the P0-B overlap register (residual risk 6).
8. **Branch-protection activation**: main was unprotected (HTTP 404) early on
   2026-08-12; by this program's preflight it enforced `verify` + strict + admins.
9. **Independently refuted tool claims**: this session's own scanner produced two false
   mismatches (the evidence-index `"SELF"` entry; a manifest-relative path hashed from
   repo root) — both refuted by re-reads before any conclusion shipped.

## Scenario E — one-shot cycle, measured on this run itself

This run executed preflight → evidence → reports → validation → commit → push → draft PR
→ CI → ready → NEEDS_PREZ stop with zero mid-task human interventions. The PR body and CI
run IDs bind to the exact head SHA; the terminal ledger records them. Machine work
completed before the stop; the only human gate is PREZ's merge decision. (PR #8, executed
by the predecessor session under an explicit merge directive, demonstrates the same cycle
through merge and post-merge verification.)

## Evidence lifecycle (Scenario I) — checks applied to this run's own corpus

Event pairing (every step_started has one step_finished), unique event ids, JSON/JSONL
parse, SHA-256 for every evidence item, redaction of machine paths, append-only manifest
updates, and file classification of the final changed set. Results in
`12-terminal-ledger.md`; the metrics and evidence index are machine-readable
(`metrics.json`, `evidence-index.json`).
