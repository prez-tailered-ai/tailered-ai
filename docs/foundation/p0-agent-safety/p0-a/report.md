# P0-A report — agent write containment

> ## ⚠ CORRECTION NOTICE
>
> **P0-A implementation v1 merged incomplete at `60adb63`. The capability-root symlink
> class remained vulnerable. P0-A is not complete until the corrective follow-up PR
> merges.**
>
> PR #3 was merged on the strength of this report's first revision, which claimed
> completeness it had not earned. That claim is **superseded**, not deleted — see
> `execution-ledger.jsonl` event `P0A-COR-EV-016`. The exact chronology is in
> [`../corrective/SCOPE-2-handoff.md`](../corrective/SCOPE-2-handoff.md); how the class was
> missed is in section 16 of this report.

**Status: v2 submitted for the corrective merge gate. P0-A is OPEN until it merges.**
**P0-B is `NOT_STARTED` and may not use `60adb63` as its base.**

## 1. Baseline

| Item | Value |
|---|---|
| Repository | `prez-tailered-ai/tailered-ai` |
| Original P0-A baseline | `main` @ `5eea7766bdc770c5a6e75ad2da5aded85b2356a3` |
| v1 branch / head | `fix/p0-a-agent-write-containment` @ `2f8fb9a` |
| v1 merged into `main` at | **`60adb63ef6be09b93237d75758d3b2e817019f9c`** (PR #3) |
| v2 corrective branch | `fix/p0-a-capability-root-symlink`, based on `60adb63` |
| Toolchain | Node v24.11.1, npm 10.9.4 |
| `npm ci` | 4 packages, **0 vulnerabilities** |
| `npm test` at the original baseline | **18/18 pass**, exit 0 |
| `npm run validate` | VERIFIED, exit 0 |
| `npm run demo` | `shipped`, **$0.068** |

The original baseline was clean; no pre-existing failures. Protected-surface hashes are
recorded in `evidence/baseline-protected-hashes.txt` — **12** surfaces.

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

### 3.1 The v0 defect — no boundary was ever checked

Two guards existed and neither closed the gap:

| Guard | What it actually checked | Why it failed |
|---|---|---|
| `ship.ts:559` `startsWith("product/")` | a **string prefix** | satisfied by `product/../anything` |
| `files.ts:16-32` `resolveRepoPath` | escape from the **repository root** | an in-repository sideways hop never leaves the root |

Neither guard asked the only question that matters: *after resolution, is this still beneath
`product/`?* Additionally, neither considered symlinks, so a symlink placed inside `product/`
redirected writes anywhere.

### 3.2 The v1 defect — the boundary was trusted instead of proven

This is the class that merged.

```text
resolveContainedWritePath() called realpath(root/product)
before proving that the lexical product node was a real,
non-symlink directory.
```

With a symlinked capability root:

```text
product -> decisions
realpath(root/product) == root/decisions
```

the implementation then **trusted `decisions/` as the canonical capability root**. Every
subsequent check — lexical containment, the descendant symlink walk, the canonical
re-check — ran honestly and passed, because they were all measuring against a boundary
that had already moved. Therefore:

```text
product/ADR-000.md
```

overwrote:

```text
decisions/ADR-000.md
```

with no `..`, no absolute path, no malformed path, and no suspicious user-controlled text
anywhere in the payload.

Case 17 is the sharpest form:

```text
product -> outside-directory
agent path = product/index.html
```

The path is innocent. **The boundary moved.** That is the authority lesson of this
scope: a capability root is a *claim to verify*, never a value to resolve. Canonicalizing
an authority boundary hands its definition to whoever controls the link.

### 3.2.1 Exploitability bound — stated, because it is load-bearing

An agent **cannot create this condition itself**. `src/` contains no `symlink()` call at
all, and `FileWrite` is `{ path, content }` — there is no path through the ship loop that
creates a symbolic link, and `product/../x` was already blocked by v1. The symlinked
capability root must **pre-exist** on disk: carried by a clone (git stores symlinks), a
restore from backup, an operator action, or another local process.

That bounds the severity — it is not a one-step agent escape from a clean repository — and
it does **not** reduce the need for the fix. A company repository is checked out from
somewhere; "the boundary is whatever the checkout says it is" is not an authority model.
The condition is also *observable before the write*, which is exactly what puts it in scope
for the check that precedes the write, and exactly what distinguishes it from the TOCTOU
residual.

### 3.3 Why the two defects are the same mistake

v0 compared a path to a **string**. v1 compared a path to a **followed link**. Both
substituted something cheap and available for the thing that actually needed proving.
The corrected primitive proves eleven separate properties rather than deriving the
boundary from anything (see [containment-contract.md](containment-contract.md)).

## 4. Attack matrix — three states

Eighteen classes, executed end-to-end through the real ship loop with a deterministic
agent (zero model calls, zero API spend). Full detail in [test-matrix.md](test-matrix.md);
raw output in `evidence/threat-matrix-v1-caproot.txt` (18 cases against the **merged**
v1) and `evidence/threat-matrix-v2-caproot.txt` (18 cases against v2 — authoritative).
`evidence/threat-matrix-after.txt` is the historical 14-case v1 run, preserved and
**superseded**.

| State | Meaning | Escapes |
|---|---|---|
| **v0** | baseline `main` @ `5eea7766`, no primitive | **6** — traversal ×3, symlink ×2, founder gate ×1 |
| **v1** | first submitted fix `2f8fb9a`, rejected at the gate | **4** — capability root symlinked to a protected directory, to the repository root, out of the repository, and the same through the founder gate |
| **v2** | this submission | **0** across all 17 executable classes; both legitimate controls still ship |

Every escape in both v0 and v1 reported `outcome: "shipped"` — the signature this scope
exists to eliminate: the system reporting success while the guarantee failed.

The v1 escapes are worse in blast radius than the v0 ones. A traversal payload redirects a
write to another path *inside* the repository. A symlinked capability root moves the
boundary itself, so `product/index.html` — a payload with no traversal, no absolute path
and no suspicious character in it — lands wherever the link points, **including outside
the repository** (case 17, asserted by an empty-directory check on the link target).

Three honest caveats:

- **Case 08 in the shell harness does not test NUL at all.** Bash truncates a variable at
  a NUL byte, so the payload became a harmless in-`product/` path that the harness scored
  as a pass. It is now reported as `INVALID — NOT EXECUTED BY THIS HARNESS`. The class is
  genuinely covered by the unit-level integration test `containment: NUL-containing path is denied`,
  which passes a real `\u0000` from TypeScript. Stated precisely: all executable classes pass across the
  combined TypeScript and shell evidence; the shell matrix alone does not prove 18
  denials.
- **Case 11 passed before the fix only incidentally** — `rename()` replaces the symlink
  itself rather than following it. That was safe by accident, not by contract. It is now
  explicitly rejected.
- **Cases 15-18 were found by the merge gate, not by this scope.** See section 16.

## 5. Security contract

Documented in [containment-contract.md](containment-contract.md): **12 separately proven
rules** (one input precondition plus the eleven required obligations), an explicit
statement of what is *insufficient*, and a stated residual TOCTOU boundary.

## 6. Implementation

One new primitive, `resolveContainedWritePath(root, capabilityRoot, relativePath)` in
`src/files.ts`, which:

1. rejects absolute paths and NUL bytes (via `resolveRepoPath`);
2. requires **lexical** containment beneath the capability root using `relative()`, not a
   string prefix;
3. **verifies the capability root rather than canonicalizing it** — every component from
   the repository root down must exist, be a directory, and not be a symbolic link;
4. walks every already-existing component beneath the root and **rejects any symbolic
   link**, including the leaf, rather than resolving it;
5. re-checks canonical containment after the walk;
6. **fails closed** on a missing capability root or any filesystem error.

Step 3 is the second-submission change. The rejected version called
`realpath(root/product)`, which *followed* a symlinked capability root and adopted its
target as the boundary. Symlinks **above** the repository root are still resolved once —
they belong to the operator's filesystem layout (`/tmp` → `/private/tmp`) and are not
agent reachable.

`applyProductFiles` in `src/ship.ts` now resolves **every** destination before writing
**any** of them, so a rejected batch cannot leave a partially applied artifact.

## 7. Files changed

| File | Change | Lines |
|---|---|---|
| `src/files.ts` | added `resolveContainedWritePath`; imported `lstat`, `realpath`; **v2:** replaced the capability-root `realpath` with a verified component walk | +125 |
| `src/ship.ts` | routed `applyProductFiles` through the primitive; added `PRODUCT_ROOT`; removed the prefix check | +24 / −6 |
| `test/containment.test.ts` | new — 19 tests, one per escape class | +new |
| `docs/foundation/p0-agent-safety/` | contract, report, test matrix, manifest, evidence | +new |

**Total production change vs. baseline `main` @ `5eea7766`: 149 insertions, 6 deletions
across two files.** The v2 increment alone is **+36 / −3** in `src/files.ts` and
**+82** in `test/containment.test.ts`.

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

19 tests in `test/containment.test.ts`, one per failure class so a regression names its exact
mechanism. Every test asserts **protected-surface hashes are byte-identical**, not merely
that an exception was thrown. Two legitimate controls prove the boundary did not become a
blanket denial, one test asserts a denied escape **still writes exactly one terminal
`EvalRow`**, and the out-of-repository case asserts the link-target directory is **empty**
afterwards.

The four v2 tests are named for the mechanism, not the symptom:

- `containment: the capability root itself cannot be a symlink to a protected directory`
- `containment: the capability root itself cannot be a symlink to the repository root`
- `containment: the capability root itself cannot be a symlink out of the repository`
- `containment: the founder gate edit path is denied a symlinked capability root`

## 10. TDD evidence

Both rounds followed RED → GREEN, and both RED runs were **watched**.

| Round | RED | GREEN |
|---|---|---|
| v1 | `evidence/tdd-red-run.txt` — 33 tests, **7 fail**, each a genuine assertion failure | 33/33, exit 0 |
| v2 | `evidence/tdd-red-run-caproot.txt` — 37 tests, **4 fail**, every one `actual: 'shipped'` | **37/37**, exit 0 |

The v2 failures are the correct failure: not an error, not a typo — the escape shipped
against the merged implementation. The 18 pre-existing tests and the 15 v1 tests passed in
every run.

## 11. Full-suite results

| Command | Exit | Result |
|---|---|---|
| `npm run check` (tsc) | 0 | clean |
| `npm test` | 0 | **37/37**, 0 skipped |
| `npm run validate` | 0 | VERIFIED (read directly, never through a pipe) |
| `npm run demo` | 0 | `shipped`, **$0.068** — unchanged from baseline |
| threat matrix | 0 | **17/17 executable classes PASS**; case 08 `INVALID` |

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
   **This is a different thing from the capability-root symlink class**, which was a
   *pre-existing, deterministically observable* on-disk condition and is now closed. The
   contract carries a table separating the two; conflating them is what allowed v1 to ship.
2. **Capability root is a constant.** `PRODUCT_ROOT = "product"` matches the v1 contract. A
   future multi-root capability model must extend the primitive, not add a second check.
3. **Windows unexecuted** (see SKIPs).

No undisclosed HIGH or CRITICAL residual item.

## 14. Invariant now enforced

> An agent or human gate granted authority to write `product/` can mutate only the canonical
> filesystem subtree beneath `product/`. **The capability root must itself be proven a real,
> non-symlink directory**; no lexical traversal, normalization behavior, symlink,
> canonical-path redirection, or malformed path may cause a write outside that capability
> root. Containment must be positively proven or the write is refused.

## 15. Handoff

[handoffs/P0-A-to-P0-B.md](../handoffs/P0-A-to-P0-B.md). **P0-B may not use `60adb63` as
its base.**

## 16. Process failure — how v1 shipped incomplete

The four capability-root classes were not found by this scope's threat modelling. They
were found by the merge gate, reading the primitive's control flow. Three failures
compounded:

1. **The threat model enumerated payloads, not boundaries.** All fourteen v1 classes vary
   the *path the agent supplies*. Not one varied the *capability root itself*. Cases 15-18
   need no unusual payload at all — case 17 uses `product/index.html`, the same string as
   the legitimate control. A threat model organised around attacker input cannot see an
   attack that changes the defender's reference point.
2. **`realpath` was treated as a safety measure.** It reads like hardening — resolving a
   path to its true location — so it was never asked what it would do with a hostile root.
   Canonicalisation resolves; it does not verify. The v1 code applied
   *symlink-rejection* to every descendant and *symlink-resolution* to the root, and the
   inconsistency went unnoticed because both lines look defensive.
3. **A near-miss was mis-filed.** v1 already tested case 12, "capability root as a file" —
   the same family: *the root is not what it should be*. Having tested one member of that
   family, the scope treated the family as covered instead of enumerating it. The symlink
   member was one line away and was never written.

There was also a disclosure error. The v1 contract mentioned symlinks and TOCTOU together
in a way that implied any remaining symlink exposure was the stated residual race. It was
not: a pre-existing symlinked root is observable before the write, which is precisely what
distinguishes it from TOCTOU. Filing a closable defect under an accepted residual is how a
known-unknown becomes invisible.

**What changes as a result.** The contract now enumerates the boundary's own properties as
numbered obligations (existence, type, non-symlink, per component) rather than describing
the check as one step, and it carries an explicit table separating pre-existing conditions
from race conditions. The threat matrix now varies both axes — payload *and* capability
root — and the harness scores an untransmittable payload as `INVALID` rather than `PASS`.

## 17. Chronology

| # | Event | Evidence |
|---|---|---|
| 1 | P0-A v1 developed on branch `fix/p0-a-agent-write-containment` | PR #3 |
| 2 | v1 head `2f8fb9a`, CI green, 33/33 tests | PR #3 checks |
| 3 | Merge gate returned **REQUEST CHANGES** on the capability-root class | gate instruction |
| 4 | PR #3 nevertheless merged into `main` at `60adb63` | `gh pr view 3` |
| 5 | v1 blocked lexical traversal and symlinks **below** the capability root | `evidence/threat-matrix-after.txt` |
| 6 | v1 canonicalised `root/product` before proving `product` was not a symlink | `src/files.ts` @ `2f8fb9a` |
| 7 | Cases 15-18 executed against the **merged** implementation | `evidence/threat-matrix-v1-caproot.txt` |
| 8 | All four returned `outcome: "shipped"`; ADR-000/AGENTS.md mutated; one wrote outside the repository | same |
| 9 | Defect therefore discovered **after** merge | this report |
| 10 | Repository is not deployed — **no production release occurred** | no deploy pipeline in this repository |
| 11 | Corrective branch `fix/p0-a-capability-root-symlink` closes the class | this PR |
| 12 | **P0-B has not begun** | [`../corrective/SCOPE-1-handoff.md`](../corrective/SCOPE-1-handoff.md) |
