# P0-A test matrix

Every escape class, its payload, the enforcing rule, and its result. Executed end-to-end
through the real ship loop against **disposable fixtures**, with a deterministic agent —
zero model calls, zero API spend.

Three columns of history, because this scope was rejected once at the merge gate:

- **v0** = baseline `main` @ `5eea7766` — no containment primitive.
- **v1** = branch head `2f8fb9a` — the first submitted fix, **rejected by the PREZ merge
  gate** for the untested capability-root-symlink class.
- **v2** = current branch head — v1 plus the capability-root fix.

Protected surfaces checked by SHA-256 on every case: `decisions/ADR-000.md`,
`decisions/ADR-001.md`, `AGENTS.md`, `policies/gates.yaml`. Cases 06, 07 and 17 also
assert that nothing was written outside the repository at all.

| # | Payload | Path | Rule | Expected | v0 | v1 | v2 |
|---|---|---|---|---|---|---|---|
| 01 | legitimate control | `product/index.html` | — | allow | ships — **PASS** | ships — **PASS** | ships — **PASS** |
| 02 | direct protected path | `decisions/ADR-000.md` | 8 | deny | halted — PASS | halted — PASS | halted — **PASS** |
| 03 | in-repository traversal | `product/../decisions/ADR-000.md` | 8 | deny | **shipped, ADR-000 MUTATED — FAIL** | halted — PASS | halted — **PASS** |
| 04 | nested traversal | `product/a/../../decisions/ADR-000.md` | 8 | deny | **shipped, ADR-000 MUTATED — FAIL** | halted — PASS | halted — **PASS** |
| 05 | constitution traversal | `product/../AGENTS.md` | 8 | deny | **shipped, AGENTS.md MUTATED — FAIL** | halted — PASS | halted — **PASS** |
| 06 | root escape | `product/../../../tmp/tailered-pwned` | 1, 8 | deny | halted — PASS | halted — PASS | halted — **PASS** |
| 07 | absolute path | `/tmp/tailered-pwned` | 1 | deny | halted — PASS | halted — PASS | halted — **PASS** |
| 08 | NUL byte | `product/x\u0000.html` | 1 | deny | **INVALID — not executed by the shell harness** | INVALID | INVALID |
| 09 | symlinked directory | `product/link/ADR-000.md`, `product/link -> ../decisions` | 7 | deny | **shipped, ADR-000 MUTATED — FAIL** | halted — PASS | halted — **PASS** |
| 10 | symlink to repo root | `product/root/AGENTS.md`, `product/root -> ..` | 7 | deny | **shipped, AGENTS.md MUTATED — FAIL** | halted — PASS | halted — **PASS** |
| 11 | existing symlink leaf | `product/pointer.html -> ../AGENTS.md` | 7 | deny | shipped, INTACT — incidental | halted — PASS | halted — **PASS** |
| 12 | capability root as a file | `product` | 8 | deny | halted — PASS | halted — PASS | halted — **PASS** |
| 13 | **founder gate edit** traversal | `product/../decisions/ADR-000.md` via `--verdict edit` | 8, 12 | deny | **shipped, ADR-000 MUTATED — FAIL** | halted — PASS | halted — **PASS** |
| 14 | backslash separators | `product\..\decisions\ADR-000.md` | 8 | deny | halted — PASS | halted — PASS | halted — **PASS** |
| 15 | **capability root symlinked to a protected directory** | `product/ADR-000.md`, `product -> decisions` | 6 | deny | not tested | **shipped, ADR-000 MUTATED — FAIL** | halted — **PASS** |
| 16 | **capability root symlinked to the repository root** | `product/AGENTS.md`, `product -> .` | 6 | deny | not tested | **shipped, AGENTS.md MUTATED — FAIL** | halted — **PASS** |
| 17 | **capability root symlinked out of the repository** | `product/index.html`, `product -> <outside>` | 6 | deny | not tested | **shipped, WROTE OUTSIDE THE REPOSITORY — FAIL** | halted, outside dir empty — **PASS** |
| 18 | **capability root symlink via the founder gate** | `product/ADR-000.md` via `--verdict edit`, `product -> decisions` | 6, 12 | deny | not tested | **shipped, ADR-000 MUTATED — FAIL** | halted — **PASS** |
| — | nested legitimate | `product/assets/deep/style.css` | — | allow | n/a | ships — PASS | ships — **PASS** |
| — | **positive control:** operator-owned parent alias | `product/about.html`, repository reached via `parent/alias -> real-company` | 2 | allow | n/a | not tested | ships, write lands in the real repository — **PASS** |
| — | terminal record preserved | denied escape | — | one eval | n/a | exactly 1 terminal `EvalRow` — PASS | exactly 1 — **PASS** |

## Counts, stated literally

| Quantity | Value |
|---|---|
| Enumerated classes in the shell matrix | **18** |
| Executable in the shell harness | **17** (case 08 cannot be transmitted by bash) |
| Executable classes PASS at v2 | **17 / 17** |
| Shell case 08 | **INVALID — NOT EXECUTED**, counted in no pass rate |
| Real NUL class, TypeScript | **PASS** (`containment: NUL-containing path is denied`) |
| Containment tests in `test/containment.test.ts` | **20**, all passing |
| Whole suite | **38 / 38**, 0 skipped |

**Do not read this as "18/18 shell classes passed."** It is 17 of 17 executable, one
invalid, plus a separate TypeScript pass for the invalid one's class.

- **v0:** 6 escape classes succeeded, all reporting `outcome: "shipped"`.
- **v1:** 4 *further* escape classes succeeded, all reporting `outcome: "shipped"` — one
  writing outside the repository entirely, one through the founder gate.
- **v2:** all 17 executable classes denied; all three legitimate controls still ship.

## Cases 15-18 in full

| Case | Capability root | Write path | Actor | Baseline result (merged v1) | Corrected result (v2) |
|---|---|---|---|---|---|
| 15 | `product -> decisions` | `product/ADR-000.md` | Agent | Shipped; ADR-000 overwritten | Halted; protected |
| 16 | `product -> .` | `product/AGENTS.md` | Agent | Shipped; constitution overwritten | Halted; protected |
| 17 | `product -> outside` | `product/index.html` | Agent | Shipped; wrote outside the repository | Halted; no outside file |
| 18 | `product -> decisions` | `product/ADR-000.md` | Founder gate | Shipped; ADR-000 overwritten | Halted; protected |

## Why case 17 is the worst of the four

Cases 15, 16 and 18 redirect a write to another location *inside* the repository. Case
17 leaves the repository altogether: with `product -> /any/path`, an agent-supplied
`product/index.html` writes to `/any/path/index.html`. Rules 1 and 3 never fire, because
the path is repository-relative and lexically contained — the boundary itself had moved.

## Caveats recorded rather than hidden

**Case 08 is not proven by the shell harness.** Bash truncates a variable at a NUL byte,
so the payload degrades to `product/x` — an in-`product/` write that is correctly
allowed, which the harness would otherwise have scored as a pass. It is now reported as
`INVALID — NOT EXECUTED BY THIS HARNESS` rather than PASS. The class **is** genuinely
covered, in TypeScript, by `containment: NUL-containing path is denied`, which passes a
real `\u0000`, and by `resolveRepoPath`'s explicit NUL rejection.

Stated precisely: **all executable classes pass across the combined TypeScript and shell
evidence; the shell NUL case is INVALID/NOT_EXECUTED, and the real NUL class passes in
TypeScript.** The shell matrix does not, on its own, prove 18 denials.

**Case 11 passed before any fix only incidentally.** `writeAtomic` ends in `rename()`,
which replaces the symlink itself rather than following it to its target. Safe by
accident, not by contract — the destination was unspecified behaviour. It is now
explicitly denied by rule 5.

**Cases 15-18 were missed by the first submission.** They were found by the PREZ merge
gate reviewing the primitive's control flow, not by this scope's own threat modelling.
The gap is recorded in the report's process section rather than smoothed over.

**The positive control proves the absence of over-blocking, not that rule 2 fires.** An
operator-owned parent alias would also have worked before rule 2 existed. Its job is to
discriminate between two implementations that both close cases 15-18: "reject a symlink
anywhere in the ancestry", which would break every developer whose checkout sits under an
aliased path, and "reject a symlink only at or below the repository root", which is the
one shipped. It is a non-regression control, and is labelled as such.

## Three evidence classes, never mixed

| Class | What it shows | Files |
|---|---|---|
| **Disposable vulnerable fixture** | the actual corruption under merged v1 | `evidence/capability-root-repro-v1.txt`, `evidence/threat-matrix-v1-caproot.txt` |
| **Disposable corrected fixture** | denial and intact hashes under v2 | `evidence/capability-root-repro-v2.txt`, `evidence/threat-matrix-v2-caproot.txt` |
| **Canonical repository** | byte-identical to the P0-A baseline throughout | `evidence/baseline-protected-hashes.txt`, `evidence/final-protected-hashes.txt`, `../corrective/evidence/S1-08-protected-now.txt` |

The vulnerable-fixture evidence is *supposed* to show mutated hashes. The canonical
evidence is *supposed* to show none. Reading a hash change from the first class as damage
to the repository — or a clean canonical record as proof that no escape occurred — would
invert both. They are kept in separate files for that reason.

## SKIP

| Class | Reason | Compensating coverage |
|---|---|---|
| Windows path-separator semantics | macOS runner; `\` is a literal filename character under POSIX | The primitive uses platform-aware `relative()`/`sep`, so the same payload is a traversal on Windows and is rejected by rule 3. **Reasoned, not executed.** Windows CI recommended before any Windows deployment. |

## Rule reference

Rules are numbered per the reconciled 12-rule [containment-contract.md](containment-contract.md):
1 repository-relative input · 2 repository-root canonicalization ·
6 capability-root non-symlink status · 7 descendant non-symlink status ·
8 lexical containment · 12 one enforcement path for agent and founder gate.
