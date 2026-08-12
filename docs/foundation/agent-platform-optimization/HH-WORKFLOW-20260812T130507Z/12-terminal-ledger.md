# 12 — Terminal ledger (committed portion)

Facts that can only exist after this commit — the branch head SHA, PR number, CI run
IDs, and the PREZ decision — bind to the pull request record and the session's terminal
report. A commit cannot carry its own SHA; this file records everything knowable at
commit time.

| Item | Value |
|---|---|
| Run ID | `HH-WORKFLOW-20260812T130507Z` |
| Repository | `prez-tailered-ai/tailered-ai` |
| Base main | `0d55aa9e6fb774903355d8aea2ad40162cde0104` (contains PR #6, #7, #8) |
| Branch | `audit/hermes-honcho-workflow-benchmark` |
| Audit / ADR-004 / erratum | CLOSED_VERIFIED · accepted, byte-identical · appended, untouched |
| P0-B / R-01 | MERGED (`81bdfd7a`) · CLOSED_VERIFIED (artifact 29) |
| Benchmark agents | 28, all read-only, cap ≤5 concurrent, 0 authority violations |
| Mode results | M0 30/30 · M1 30/30 · M2 30/30 with 0 refutations |
| Selected topology | **M0 default; M1 for latency; M2-style verify at decision gates; packets for repeated shapes** |
| Ten-dimension score | **91 / 100** (`04-benchmark-results.md`) |
| Scenario A/D/F/G | 4/4 flags · 6/6 cases · 6/6 fault classes ≤3 attempts · red control 171 failures, restored 142/142 |
| Invalid attempts | 2, both excluded from pass counts and retained (unapplied mutation; below-floor node run: none this run — the v22 case is historical) |
| Upstream runtime used | none — Hermes and Honcho untouched, reference-only |
| Runtime files changed | 0 (`src/`, `test/`, manifests, `tsconfig.json`, `.github/` untouched) |
| Dependencies changed | 0 |
| Deployment | none performed, none authorized |
| Coordinator tokens | UNKNOWN (instrumentation limit); subagent tokens exact, total ~2.69M |
| Evidence | 21 hashed items (`evidence-index.json`); failed/invalid attempts retained |
| Next owner | **PREZ** — merge or reject the benchmark PR; no other action pending |

Carried-forward boundaries: P0-B assurance limits (power loss, kernel panic, storage
loss, fsync, cross-host), the process-ledger id-reuse note, the disclosed overlap-register
path, and V-00 (machine-account merge authority) — all recorded in `11-risk-register.md`
and artifact 29, none altered here.
