# 29 — Post-closure remediation receipt

**R-01 is CLOSED_VERIFIED.** The concurrency remediation the audit discovered, specified in
[`25`](25-concurrency-remediation-contract.md), and left OPEN at closure in
[`28`](28-closure-receipt.md) has been implemented, independently verified, and merged to
`main`. This receipt supersedes **only the current status of R-01**. It changes no finding,
no verdict, no disposition, and no original text. The reason R-01 was opened stands exactly
as written: at the audit baseline, the Tailered ledger was not concurrency-safe under
parallel runs, and a started run could produce no terminal `EvalRow`. That was true, it was
proved again by a red control, and it is what the remediation fixed.

## Identity

| Item | Value |
|---|---|
| Repository | `prez-tailered-ai/tailered-ai` |
| Audit closure | PR **#6**, merged `482bc04ac9222f40e86cf2d8fa5185914155648f`, 2026-08-12T10:22:14Z |
| ADR-004 | **accepted** on `main` (`decisions/ADR-004.md`, `caused_by` ADR-003) — unchanged by this receipt |
| P0-B remediation | PR **#7**, merged `81bdfd7a0d70e2b3bdd2c70dfadb1f581df2f3e4`, 2026-08-12T11:23:23Z, by `prez-tailered-ai` |
| P0-B head / implementation | head `c803bfad357384a5e6fbcbd3fe1a0263180ea38a`; implementation `f2dfed8943856a1f86fa88fe940a9a4bc231eb85` |
| P0-B evidence closure | `c803bfad` (`docs(p0-b): close the concurrency and recovery evidence corpus`) |
| Main at reconciliation | `81bdfd7a0d70e2b3bdd2c70dfadb1f581df2f3e4` |
| Date | 2026-08-12 (UTC) |
| Required CI check | `verify` — success on `c803bfad` (PR) and on `81bdfd7a` (main push) |
| Branch protection | active on `main`: `verify` required, strict up-to-date, PR required, conversation resolution required, admins enforced, force-push and deletion blocked |

## R-01 — status supersession

| | |
|---|---|
| Original entry | [`20-risk-register.md`](20-risk-register.md) R-01: *Tailered's ledger is not concurrency-safe* — **OPEN — prerequisite** |
| Status now | **CLOSED_VERIFIED** as of merge `81bdfd7a` |
| What closed it | The P0-B implementation at `f2dfed89`, verified by the evidence below, merged through the required gate |
| What is preserved | The original row, its reason, and every statement in artifacts 00–28. Only the *current status* is superseded, by this receipt. |

## Requirements and acceptance — 15/15

Machine-readable source: `docs/foundation/p0-agent-safety/p0-b/requirements-status.json`
(declares itself the single source for R1–R8 and A1–A7; evaluated at `f2dfed89`).

| Set | Result |
|---|---|
| **R1–R8** | **8/8 VERIFIED** — concurrency-safe identifiers; exactly one terminal `EvalRow`; idempotent writes; crash-safe finalization; atomic mutation with torn-line detection; deterministic contention tests; validate exit 0 at N∈{2,3,10} with zero duplicate ids; abandoned-worker recovery and quarantine |
| **A1–A7** | **7/7 VERIFIED** — exactly-N terminal rows; zero duplicate ids; validate exit 0 read directly; ADRs unique and unmodified (`modified_accepted_adrs: []` in all five runs); SIGKILL detect/attribute/recover; red on pre-fix baseline; behavior unchanged |

## Concurrency evidence — read from the raw JSON, not from a summary

Head-bound final set (`repo_head: f2dfed89` recorded inside each file),
`docs/foundation/p0-agent-safety/p0-b/evidence/`:

| Run | Shipped | Collision halts | Duplicate ids | Torn lines | Validate |
|---|---|---|---|---|---|
| `p0b17-final-n2.json` | 2/2 | 0 | 0 | 0 | exit 0 |
| `p0b17-final-n3.json` | 3/3 | 0 | 0 | 0 | exit 0 |
| `p0b17-final-n10-run1..3.json` | 10/10 ×3 | 0 | 0 | 0 | exit 0 |

Every run's `exactly_once` block shows launched = announced = terminal.

**The gate can fail, and did.** The pre-fix control (`A6-prefix-*.json`, run against baseline
`6172653e`): N=10 shipped 2/10 with 8 collision halts, `Duplicate route log id: ROUTE-000006`,
`Duplicate agent call id: CALL-000006`, validate exit 1, `all_clean: false`.

## Crash matrix — 7 kill points + 2 controls, all PASS

`evidence/crash-matrix.json` (`repo_head: f2dfed89`, `all_points_pass: true`; every kill
ESRCH-proven dead; every point: pre-recovery validate 1 → recovery exit 0 → post-recovery
validate 0; exactly 1 terminal row; `lock_present: false` after recovery):

- `allocate:after-read`, `agent:during-invocation`, `append:after-uniqueness`,
  `finalize:before-intent` → `halted_attempts`, conservative cost settlement (never
  understates)
- `adr:before-create`, `finalize:before-terminal-eval`, `finalize:before-marker` →
  `shipped` by legitimate intent replay, each terminal row referencing its own terminal ADR
- `control:no-kill` → PASS (clean run, validate 0)
- `control:broken-recovery` → PASS **by failing as designed**: broken recover exits 0, and
  post-recovery validation still catches it (exit 1). The matrix is falsifiable.

## Recovery and validation properties

- Recovery performs **no external side effect** — never invokes an agent or model; proved
  structurally from the module's import surface (`RECOVERY-RUNBOOK.md`, contract rule V5).
- Recovery is **idempotent** — a second `recover` reports `ALREADY_FINALIZED` and changes
  nothing, tree-hash proven by test.
- `validate` is **observe-only** and its `--dry-run` mutates zero bytes, tree-hash proven.
- Unresolved quarantines and unresolved incidents at closure: **0** — established by
  validator semantics (validate fails on any unresolved item, and every closing validate is
  green), not by a hand-recorded counter.

## Current main, re-verified by this session

Independent run in a disposable worktree at `81bdfd7a`, Node v24.11.1, exit codes read
directly — evidence in [`closure-evidence/`](closure-evidence/) (`RECON-*` files):

| Check | Result |
|---|---|
| `npm ci` / `check` / `test` / `validate` / `demo` / `audit` / `git diff --check` / tooling | all exit 0 |
| Tests | **142 / 142**, 0 skipped — the rise from 38 is the P0-B suite; the 20 containment tests are intact |
| `validate` | `VERIFIED`, `valid: true`, decisions 5 |
| `demo` | `shipped`, $0.068 |
| `npm audit` | 0 vulnerabilities |
| Dependencies | runtime 0, dev 2, npm footprint 4 packages — byte-identical manifests across PR #7 |
| P0-A evidence manifest | 47 entries, 0 mismatches |
| P0-B evidence index | 235 artifacts, 234 hashed 0 mismatches, 1 self-entry excluded by design |
| Ledger/JSON/JSONL/NUL/secret scans | clean (details in `RECON-scans.txt`) |

| Evidence file | SHA-256 |
|---|---|
| `closure-evidence/RECON-verification.txt` | `113dde60891244ebd16b8fa3b35243abec383f13876691a8f05310311563d5c9` |
| `closure-evidence/RECON-npm-test.txt` | `17cbefe1882882a21a5fdea94db93a8fd7d6b87db99e842863143c283b9337d5` |
| `closure-evidence/RECON-npm-validate.txt` | `318fc48dcd5270d8221bdb224911b12405f06a89da71cf11dabcdba7b95fbbdc` |
| `closure-evidence/RECON-scans.txt` | `8022452ea015daae45f60571a066f47fe4334cc6f8e6812a13f6c9a38152c22b` |

## Assurance boundary — carried forward unchanged

Stated identically in `report.md`, the contract §1.5, the runbook, and inside
`crash-matrix.json`:

- **VERIFIED**: process crash, SIGKILL recovery, tested contention (N ≤ 10, one host),
  idempotent recovery, validator detection.
- **NOT VERIFIED**: sudden power loss, kernel panic, storage-device loss, filesystem
  durability beyond the recorded fsync boundaries (`writeAtomic` does not fsync; no P0-B
  artifact describes any path as power-loss durable), untested distributed-host behavior
  (cross-host mutual exclusion is unsupported and quarantined on detection).

## Recorded precisely, not smoothed over

1. **Early evidence sets are not commit-bound.** `A1-fixed-*`, `A6-prefix-*`, and
   `compose-*` carry an empty `repo_head`. The head-binding claim rests on `p0b17-final-*`
   and `crash-matrix.json`, which are bound to `f2dfed89`. The unbound sets agree with the
   bound ones in every number.
2. **The P0-B process ledger reused event ids across retries.**
   `agent-platform-foundation/program-ledger.jsonl` has 132 valid rows but 114 unique ids:
   `FND-P0-B-P0B-04-A1-START/FINISH` ×6 and `…-A2-…` ×5, retained FAIL rows re-appended
   under the same id before the PASS. This is the *process* ledger, not the product ledger
   the remediation hardened — every product-ledger run above recorded 0 duplicate
   identifiers — so it does not refute A2. It is recorded here as a ledger-hygiene defect:
   retries must take new attempt-scoped ids.
3. **Threat-matrix case 08 (shell NUL) remains INVALID / NOT EXECUTED** and is never counted
   in any pass rate. The TypeScript NUL test passes.
4. **One committed machine-specific path** (`p0-b/concurrent-session-overlap.md`) — already
   disclosed by P0-B itself as residual risk 6, deliberate. Not repeated in this receipt's
   evidence, which is redacted.
5. **Stale-but-neutralized headers stand unedited**: `PREZ-DECISIONS.md` still says
   `NEEDS_PREZ` (superseded by the two APPROVED gate-ledger events), the contract §2 table
   keeps frozen-era `PENDING` rows (superseded by its own "status authority moved" note),
   and `CHECKPOINT.md` marks itself historical. Append-only history, working as designed.

## What remains unchanged

- The audit verdict and all 20 dispositions: 0 ADOPT · 0 REPLACE · 1 ADAPT ·
  1 INTEROPERATE (gated) · 7 REFERENCE · 4 DEFER · 7 REJECT.
- **Hermes: reference architecture only.** **Honcho: DEFERRED**, its eight gates unmet.
- ADR-004, byte-identical; it authorizes no implementation and **no deployment**.
- Roadmap gates 1–5: **UNAUTHORIZED**. Each future adaptation needs its own PREZ-approved
  gate (ADR-004). POCs B1–B6: BLOCKED. No roadmap item is authorized by this receipt.
- Residual risks carried forward from P0-B, unchanged (power-loss class; cross-host;
  conservative settlement; same-filesystem locality; intent/marker duplication tension;
  the disclosed overlap-register path).

## Next gated actions (owner: PREZ; none authorized here)

1. Authorize — or decline — the next scope (`PROCESS-ISOLATION`) through its own
   implementation gate, as ADR-004 requires.
2. Any Honcho reconsideration: only as an isolated external service, only after all eight
   gates pass.
3. Deployment of anything: a separate founder decision. Nothing in this corpus authorizes
   it; the repository has no deployment contract (no server entrypoint, no Dockerfile, no
   Railway/Procfile/nixpacks configuration, 0 GitHub deployments ever).
