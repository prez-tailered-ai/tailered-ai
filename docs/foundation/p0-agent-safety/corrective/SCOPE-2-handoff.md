# Scope 2 handoff — historical truth and evidence reconciliation

**Status: PASS.** History is preserved rather than rewritten, the prior completeness claim
is explicitly superseded, every evidence status is literal, and all P0-A documents agree.

## Final chronology (S2-01)

| # | Fact | Support |
|---|---|---|
| 1 | P0-A v1 was developed on PR #3 | PR #3 |
| 2 | PR #3 head was `2f8fb9a` | `git rev-parse` |
| 3 | PR #3 merged into `main` at **`60adb63`** on 2026-08-12T06:54:21Z by `prez-tailered-ai` | `gh pr view 3 --json mergeCommit,mergedAt,mergedBy` |
| 4 | v1 blocked lexical traversal and symlinks **below** the capability root | `p0-a/evidence/threat-matrix-after.txt` |
| 5 | v1 canonicalized `root/product` **before** proving `product` was not a symlink | `src/files.ts` @ `2f8fb9a`, line 72 |
| 6 | Cases 15-18 were executed against the merged implementation | `p0-a/evidence/threat-matrix-v1-caproot.txt` |
| 7 | All four returned `outcome: "shipped"` | same |
| 8 | The defect was discovered **after** merge, at the gate | this program |
| 9 | The repository is not deployed, so **no production release occurred** | no deploy pipeline exists in this repository |
| 10 | The follow-up branch closes the missing class | `p0-a/evidence/threat-matrix-v2-caproot.txt` |
| 11 | **P0-B has not begun** | [`SCOPE-1-handoff.md`](SCOPE-1-handoff.md) §"P0-B absence" |

Sequencing note: the gate returned REQUEST CHANGES *before* the merge; the merge happened
while the corrective work was in progress. That ordering is recorded as fact, not as
blame — the merge is what makes the correction a follow-up PR rather than an amendment.

## Authoritative root cause (S2-04)

```text
resolveContainedWritePath() called realpath(root/product)
before proving that the lexical product node was a real,
non-symlink directory.
```

With `product -> decisions`, `realpath(root/product) == root/decisions`, and the
implementation then trusted `decisions/` as the canonical capability root. Every later
check passed honestly against a boundary that had already moved. `product/ADR-000.md`
therefore overwrote `decisions/ADR-000.md` with no `..`, no absolute path, no malformed
path, and no suspicious user-controlled text.

Case 17 is the sharpest form: `product -> outside-directory`, agent path
`product/index.html`. **The path is innocent. The boundary moved.**

Full statement: [`../p0-a/report.md`](../p0-a/report.md) §3.2.

## Corrected contract (S2-05)

`p0-a/containment-contract.md` now states **12 rules**, each a separately proven
obligation: 1 repository-relative input, then the eleven required properties —
repository-root canonicalization, capability-root lexical identity, existence, directory
type, non-symlink status, descendant non-symlink status, lexical containment, canonical
containment, fail-closed behaviour, batch prevalidation, and shared agent/founder-gate
enforcement. A mapping table binds each required obligation to its rule number.

The **capability-root symlink class is kept distinct from the TOCTOU residual**, in an
explicit table: the first is a pre-existing on-disk condition, detectable before the write,
now CLOSED; the second is a swap during the run, undetectable by definition, still OPEN.
Conflating them is what let v1 ship.

## Final matrix accounting (S2-06)

| Quantity | Value |
|---|---|
| Enumerated classes | 18 |
| Executable in the shell harness | 17 |
| Executable PASS at v2 | **17 / 17** |
| Shell case 08 (NUL) | **INVALID — NOT EXECUTED**, in no pass rate |
| Real NUL class (TypeScript) | **PASS** |
| Containment tests | **20**, all passing |
| Whole suite | **38 / 38**, 0 skipped |

Cases 15-18 have explicit rows carrying capability root, write path, actor, baseline
result and corrected result.

## RED evidence inventory (S2-07)

| File | Shows |
|---|---|
| `p0-a/evidence/tdd-red-run-caproot.txt` | 37 tests, 4 fail, every failure `actual: 'shipped'` |
| `p0-a/evidence/capability-root-repro-v1.txt` | ADR-000 `c9b0e7c4…` → `0a42ac40…`, title `# ADR-000: OVERWRITTEN VIA A SYMLINKED CAPABILITY ROOT`, `validate` exit 1 |
| `p0-a/evidence/threat-matrix-v1-caproot.txt` | 4 escapes end-to-end through the CLI, one writing outside the repository, one via the founder gate |
| `p0-a/evidence/capability-root-repro-v2.txt` | the same three link targets, all CONTAINED |
| `p0-a/evidence/threat-matrix-v2-caproot.txt` | authoritative 18-case run, 17/17 executable PASS |

Each identifies the tested base SHA, the command, the direct exit code, the date,
fixture-only execution, zero model calls, and no attack on the canonical repository.

## Three evidence classes, never mixed (S2-08)

Disposable **vulnerable** fixture (hashes *should* change) · disposable **corrected**
fixture (hashes should not) · **canonical repository** (byte-identical throughout, 12
surfaces). Kept in separate files; the mapping is in
[`../p0-a/test-matrix.md`](../p0-a/test-matrix.md) §"Three evidence classes".

## Consistency sweep (S2-11)

| Stale statement | Files found | Corrected? | Authoritative wording |
|---|---|---|---|
| "P0-A complete" unqualified | `p0-a/report.md`, `README.md` | yes | "v1 merged incomplete at `60adb63`; P0-A is OPEN until the corrective PR merges" |
| "14/14" / "all fourteen denied" | `p0-a/report.md`, `p0-a/test-matrix.md` | yes | "17/17 executable of 18 enumerated; case 08 INVALID" |
| shell NUL row scored `PASS` | `p0-a/evidence/threat-matrix.sh`, both matrix docs | yes | `INVALID — NOT EXECUTED BY THIS HARNESS` |
| "all symlink classes closed" | `p0-a/report.md` §4, `containment-contract.md` | yes | scoped to "below the capability root" for v1; the root itself is rule 6, closed only in v2 |
| "P0-B may begin from the P0-A merge" | `handoffs/P0-A-to-P0-B.md` | yes | "`60adb63` is **not** a valid P0-B base; corrective merge SHA `PENDING PREZ MERGE`" |
| root-symlink implied to be TOCTOU | `containment-contract.md` | yes | explicit table separating pre-existing condition from race |
| "15 containment tests" | `p0-a/report.md` §9, `handoffs/P0-A-to-P0-B.md` | yes | **20** containment tests, **38** total |
| "33/33" | `p0-a/report.md` §10, §11 | yes | **38/38** |
| "ten rules" | `p0-a/report.md` §5 | yes | **12** rules |
| "13 protected surfaces" | *verbal narration only — no document* | n/a | **12**, recorded in [`SCOPE-1-handoff.md`](SCOPE-1-handoff.md) |
| `threat-matrix-after.txt` cited as current | `p0-a/report.md` §4 | yes | cited as the historical 14-case v1 run, **superseded**; current is `threat-matrix-v2-caproot.txt` |

No unresolved stale statement remains. Verified by grep in
[`evidence/S3-09-integrity.txt`](evidence/S3-09-integrity.txt).

## Ledger state (S2-03)

Events `P0A-EV-001` … `P0A-EV-013` are **unmodified**. Corrective events
`P0A-COR-EV-014` onwards are appended. `P0A-COR-EV-021` carries status `SUPERSEDED` and
`supersedes: ["P0A-EV-013"]`, stating exactly which claim fell and on what evidence. The
14 classes P0A-EV-013 did test remain correctly reported; only its completeness claim is
superseded.

## What Scope 3 inherits

- Production diff reviewed line by line:
  [`evidence/S3-01-requirement-line-map.md`](evidence/S3-01-requirement-line-map.md).
- Cases 15-18 verified individually 4/4:
  [`evidence/S3-02-four-cases.txt`](evidence/S3-02-four-cases.txt).
- Positive control passing: an operator-owned parent alias still ships legitimate writes.
- Full verification green: [`evidence/S3-06-verification.txt`](evidence/S3-06-verification.txt).
- Dependencies unchanged: [`evidence/S3-07-dependencies.txt`](evidence/S3-07-dependencies.txt).
- Canonical surfaces intact: [`evidence/S3-08-protected-final.txt`](evidence/S3-08-protected-final.txt).
- **No P0-B work exists on this branch.**

Remaining for Scope 3: the evidence manifest (generated last, after every document is
final), the integrity audit, the commit, the push, the PR, and the gate packet.
