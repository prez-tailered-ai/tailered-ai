# PREZ merge gate packet — P0-A corrective closure

Everything the gate needs, in one place. Fill the PR/commit rows from the PR itself; every
other row is executed evidence committed alongside this file.

## Identity

| Item | Value |
|---|---|
| Repository | `prez-tailered-ai/tailered-ai` |
| Branch | `fix/p0-a-capability-root-symlink` |
| Base | `main` @ `60adb63ef6be09b93237d75758d3b2e817019f9c` (the PR #3 merge) |
| Relationship | **corrective follow-up to PR #3** — not an enhancement |
| P0-B status | **`NOT_STARTED`**, and `60adb63` is not a valid base for it |

## The four gate-critical cases (P-03)

Each executed individually through the real ship loop against a disposable minted company.
Full per-case record: [`evidence/S3-02-four-cases.txt`](evidence/S3-02-four-cases.txt).

| Case | Capability root | Write path | Actor | Merged v1 | v2 |
|---|---|---|---|---|---|
| 15 | `product -> decisions` | `product/ADR-000.md` | Agent | shipped; **ADR-000 overwritten** | `halted_attempts`; INTACT — **PASS** |
| 16 | `product -> .` | `product/AGENTS.md` | Agent | shipped; **AGENTS.md overwritten** | `halted_attempts`; INTACT — **PASS** |
| 17 | `product -> outside` | `product/index.html` | Agent | shipped; **wrote outside the repository** | `halted_attempts`; outside dir empty — **PASS** |
| 18 | `product -> decisions` | `product/ADR-000.md` | **Founder gate** | shipped; **ADR-000 overwritten** | `halted_attempts`; INTACT — **PASS** |

Every v2 run also wrote **exactly one** terminal `EvalRow`, so a denied escape still
produces a recoverable terminal record.

## Positive behaviour (P-04)

| Control | Result |
|---|---|
| `product/index.html` legitimate write | ships — **PASS** |
| `product/assets/deep/style.css` nested write | ships — **PASS** |
| repository reached via an operator-owned parent alias (`parent/alias -> real-company`) | ships, and the write lands in the **real** repository — **PASS** |
| `npm run demo` | `shipped`, **$0.068**, unchanged |

The third control is the one that matters for over-blocking: it distinguishes "reject a
symlink anywhere in the ancestry" — which would break every developer whose checkout sits
under an aliased path — from "reject a symlink at or below the repository root", which is
what shipped.

## Evidence honesty (P-05)

| Requirement | State |
|---|---|
| PR #3's incomplete merge disclosed | correction notice at the top of `p0-a/report.md` and `README.md` |
| Old ledger events preserved | `P0A-EV-001`…`P0A-EV-013` unmodified |
| Completeness claim superseded, not erased | `P0A-COR-EV-021`, status `SUPERSEDED`, `supersedes: ["P0A-EV-013"]` |
| Shell NUL row | **`INVALID — NOT EXECUTED BY THIS HARNESS`**, counted in no pass rate |
| Real NUL class | **PASS** in TypeScript |
| Counts literal | 18 enumerated · 17 executable · **17/17 PASS** · 1 INVALID |
| TOCTOU still disclosed separately | contract carries a table separating the pre-existing condition from the race |

## Verification (P-06)

| Check | Exit | Result |
|---|---|---|
| `npm run check` | 0 | clean |
| `npm test` | 0 | **38 tests, 38 pass, 0 fail, 0 skipped** |
| `npm run validate` | 0 | `VERIFIED` |
| `npm run demo` | 0 | `shipped`, `$0.068` |
| threat matrix (18 cases) | 0 | **17/17 executable PASS**, 1 INVALID, outside dir empty, no root-escape file |
| `npm ci` | 0 | 4 packages, 5 audited |
| `npm audit` | 0 | **0 vulnerabilities** |
| `package.json` / lockfile vs `60adb63` | — | **unchanged** |
| 12 canonical protected surfaces | — | **byte-identical** to the P0-A baseline |

Raw: [`evidence/S3-06-verification.txt`](evidence/S3-06-verification.txt),
[`evidence/S3-07-dependencies.txt`](evidence/S3-07-dependencies.txt),
[`evidence/S3-08-protected-final.txt`](evidence/S3-08-protected-final.txt),
[`../p0-a/evidence/threat-matrix-v2-caproot.txt`](../p0-a/evidence/threat-matrix-v2-caproot.txt).

## Changed-file categories (P-02)

| Category | Files |
|---|---|
| Corrective production code | `src/files.ts` (**+36 / −3**, the only production file) |
| Corrective tests | `test/containment.test.ts` |
| P0-A documentation | `p0-a/report.md`, `p0-a/containment-contract.md`, `p0-a/test-matrix.md`, `README.md` |
| P0-A evidence | `p0-a/evidence/*`, `corrective/evidence/*`, `execution-ledger.jsonl`, `p0-a/evidence-manifest.json` |
| P0-A handoff | `handoffs/P0-A-to-P0-B.md`, `corrective/SCOPE-1-handoff.md`, `corrective/SCOPE-2-handoff.md`, this file |

No other category is present. `src/ledger.ts`, `src/company.ts`, `src/validate.ts`,
`src/ship.ts`, `src/contracts.ts` and `src/cli.ts` are **unmodified** — verified in
[`evidence/S1-06-p0b-check.txt`](evidence/S1-06-p0b-check.txt).

## Residual risks

1. **TOCTOU — open, disclosed, unchanged.** A local process could swap a verified
   directory for a symlink between the check and the `rename()`. Node exposes no
   `openat`-style resolution to close it. Control remains the existing requirement to run
   in an isolated, disposable worker. **This is a different thing from the class fixed
   here**, which was observable before the write.
2. **Capability root is a constant.** `PRODUCT_ROOT = "product"`. A future multi-root
   model must extend the primitive, not add a second check.
3. **Windows separator semantics — SKIP.** Reasoned via platform-aware `relative()`/`sep`,
   not executed on this macOS runner. Windows CI recommended before any Windows
   deployment. This is the only SKIP in the scope.

## What a PASS authorizes

Merging closes P0-A. It does **not** start P0-B. P0-B begins only when you send, with the
new merge SHA filled in:

```text
P0-A CORRECTIVE FOLLOW-UP MERGED at <FULL MERGE SHA>.
P0-A is now CLOSED.
Proceed with P0-B from this exact main.
Do not use 60adb63 as the P0-B base.
```

## What a FAIL means

Send the named gate back. Work stays on `fix/p0-a-capability-root-symlink`, a new commit
is added to the same PR, published history is not rewritten, and P0-B does not begin.
