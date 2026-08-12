# P0-A completion report — agent write containment

**Status: COMPLETE. Awaiting PREZ merge gate.**

## 1. Baseline

| Item | Value |
|---|---|
| Repository | `prez-tailered-ai/tailered-ai` |
| Baseline branch / SHA | `main` @ `5eea7766bdc770c5a6e75ad2da5aded85b2356a3` |
| Working branch | `fix/p0-a-agent-write-containment` |
| Toolchain | Node v24.11.1, npm 10.9.4 |
| `npm ci` | 4 packages, **0 vulnerabilities** |
| `npm test` | **18/18 pass**, exit 0 |
| `npm run validate` | VERIFIED, exit 0 |
| `npm run demo` | `shipped`, **$0.068** |

Baseline was clean; no pre-existing failures. Protected-surface hashes recorded in
`evidence/baseline-protected-hashes.txt`.

## 2. Vulnerability reproduction

Reproduced on **disposable fixtures only**. The canonical repository was never a target.

An agent returning `product/../decisions/ADR-000.md` from `codegen`:

- passed the `startsWith("product/")` check, because the **string** begins with `product/`;
- passed `resolveRepoPath`, because the resolved path stays **inside the repository root**;
- **overwrote the charter** — an accepted, immutable decision;
- and the run reported `outcome: "shipped"`.

The last point is the severe part: the escape did not halt the run. It succeeded silently,
and `validate` only detected the damage afterwards, as a malformed ADR.

## 3. Root cause

Two guards existed and neither closed the gap:

| Guard | What it actually checked | Why it failed |
|---|---|---|
| `ship.ts:559` `startsWith("product/")` | a **string prefix** | satisfied by `product/../anything` |
| `files.ts:16-32` `resolveRepoPath` | escape from the **repository root** | an in-repository sideways hop never leaves the root |

Neither guard asked the only question that matters: *after resolution, is this still beneath
`product/`?* Additionally, neither considered symlinks, so a symlink placed inside `product/`
redirected writes anywhere.

## 4. Attack matrix — before and after

Fourteen classes, executed end-to-end through the real ship loop with a deterministic agent
(zero model calls, zero API spend). Full detail in [test-matrix.md](test-matrix.md);
raw output in `evidence/threat-matrix-after.txt`.

| # | Class | Before | After |
|---|---|---|---|
| 01 | legitimate `product/index.html` | PASS (ships) | **PASS (ships)** |
| 02 | direct `decisions/ADR-000.md` | PASS (denied) | **PASS** |
| 03 | in-repo traversal | **FAIL — ADR-000 mutated, shipped** | **PASS** |
| 04 | nested traversal | **FAIL — ADR-000 mutated, shipped** | **PASS** |
| 05 | constitution traversal | **FAIL — AGENTS.md mutated, shipped** | **PASS** |
| 06 | root escape | PASS (denied) | **PASS** |
| 07 | absolute path | PASS (denied) | **PASS** |
| 08 | NUL-containing path | PASS — but see caveat | **PASS** |
| 09 | symlinked directory escape | **FAIL — ADR-000 mutated, shipped** | **PASS** |
| 10 | symlink to repository root | **FAIL — AGENTS.md mutated, shipped** | **PASS** |
| 11 | existing symlink leaf target | PASS incidentally, unspecified | **PASS, explicitly denied** |
| 12 | capability root as a file | PASS (denied) | **PASS** |
| 13 | **founder gate edit** traversal | **FAIL — ADR-000 mutated, shipped** | **PASS** |
| 14 | backslash separators | PASS (denied) | **PASS** |

**Six escape classes succeeded before the fix. All fourteen are denied after it, and the
legitimate control still ships.**

Two honest caveats:

- **Case 08 in the shell harness did not truly test NUL.** Bash truncates a variable at a
  NUL byte, so the payload became a harmless in-`product/` path. The NUL class is genuinely
  covered by the unit-level integration test `containment: NUL-containing path is denied`,
  which passes a real `\u0000` from TypeScript.
- **Case 11 passed before the fix only incidentally** — `rename()` replaces the symlink
  itself rather than following it. That was safe by accident, not by contract. It is now
  explicitly rejected.

## 5. Security contract

Documented in [containment-contract.md](containment-contract.md): ten rules, an explicit
statement of what is *insufficient*, and a stated residual TOCTOU boundary.

## 6. Implementation

One new primitive, `resolveContainedWritePath(root, capabilityRoot, relativePath)` in
`src/files.ts`, which:

1. rejects absolute paths and NUL bytes (via `resolveRepoPath`);
2. requires **lexical** containment beneath the capability root using `relative()`, not a
   string prefix;
3. resolves the capability root to its **canonical** form;
4. walks every already-existing component and **rejects any symbolic link**, including the
   leaf, rather than resolving it;
5. re-checks canonical containment after the walk;
6. **fails closed** on a missing capability root or any filesystem error.

`applyProductFiles` in `src/ship.ts` now resolves **every** destination before writing
**any** of them, so a rejected batch cannot leave a partially applied artifact.

## 7. Files changed

| File | Change | Lines |
|---|---|---|
| `src/files.ts` | added `resolveContainedWritePath`; imported `lstat`, `realpath` | +90 |
| `src/ship.ts` | routed `applyProductFiles` through the primitive; added `PRODUCT_ROOT`; removed the prefix check | +24 / −6 |
| `test/containment.test.ts` | new — 15 tests, one per escape class | +new |
| `docs/foundation/p0-agent-safety/` | contract, report, test matrix, manifest, evidence | +new |

**Total production change: 114 insertions, 6 deletions across two files.**

## 8. Write-site classification (Step 8)

Every write site in `src/` was classified. **No `UNKNOWN` remains.**

| Site | Path source | Class |
|---|---|---|
| `ship.ts` `applyProductFiles` | agent codegen, critique repair, **founder gate edits** | **REQUIRES CONTAINMENT — now enforced** |
| `ledger.ts:30,51,61` | internally generated run/call ids and a validated 64-hex repo hash | NOT EXTERNALLY CONTROLLED |
| `company.ts:63-72` | literal constants at mint | NOT EXTERNALLY CONTROLLED |
| `company.ts:142` | internally generated ADR id; `wx` exclusive create | NOT EXTERNALLY CONTROLLED |
| `cli.ts:131,165` | operator `--output` flag | OPERATOR AUTHORITY — not an agent boundary |

`applyProductFiles` is the single chokepoint for all three externally-influenced paths, which
is why one primitive closes agent *and* gate writes together.

## 9. Tests added

15 tests in `test/containment.test.ts`, one per failure class so a regression names its exact
mechanism. Every test asserts **protected-surface hashes are byte-identical**, not merely
that an exception was thrown. Two legitimate controls prove the boundary did not become a
blanket denial, and one test asserts a denied escape **still writes exactly one terminal
`EvalRow`**.

## 10. TDD evidence

- **RED**: `evidence/tdd-red-run.txt` — 33 tests, **7 fail**, each with a genuine assertion
  failure (`Expected "actual" to be strictly unequal to…`), i.e. the escape shipped.
- **GREEN**: `evidence/final-npm-test.txt` — **33/33 pass**, exit 0.

The 18 pre-existing tests passed in both runs.

## 11. Full-suite results

| Command | Exit | Result |
|---|---|---|
| `npm run check` (tsc) | 0 | clean |
| `npm test` | 0 | **33/33** |
| `npm run validate` | 0 | VERIFIED |
| `npm run demo` | 0 | `shipped`, **$0.068** — unchanged from baseline |

Canonical repository protected surfaces: **byte-identical to baseline**
(`evidence/final-protected-hashes.txt` vs `evidence/baseline-protected-hashes.txt`).

Existing invariants confirmed intact: reserve/settle ordering, gate label capture, model
registry sourcing, terminal `EvalRow` on every started run, append-only ADRs.

## 12. SKIPs

**One.** Windows-specific path-separator semantics are not exercised on this macOS runner.
Case 14 covers backslash payloads under POSIX rules, where a backslash is a literal filename
character and the write is contained. On Windows, `\` is a separator and the same payload
would be a traversal — the primitive handles it correctly because `relative()` and `sep` are
platform-aware, but that is **reasoned, not executed here**. Recommend Windows CI coverage
before any Windows deployment.

## 13. Residual risks

1. **TOCTOU (documented, not closed).** A local process with write access to the company
   repository could swap a verified directory for a symlink between the check and the
   `rename()`. Closing it needs `openat`-style resolution Node does not expose. The existing
   requirement to run in an isolated, disposable worker remains the control. Stated fully in
   the contract.
2. **Capability root is a constant.** `PRODUCT_ROOT = "product"` matches the v1 contract. A
   future multi-root capability model must extend the primitive, not add a second check.
3. **Windows unexecuted** (see SKIPs).

No undisclosed HIGH or CRITICAL residual item.

## 14. Invariant now enforced

> An agent or human gate granted authority to write `product/` can mutate only the canonical
> filesystem subtree beneath `product/`. No lexical traversal, normalization behavior,
> symlink, canonical-path redirection, or malformed path may cause a write outside that
> capability root. Containment must be positively proven or the write is refused.

## 15. Handoff

[handoffs/P0-A-to-P0-B.md](../handoffs/P0-A-to-P0-B.md).
