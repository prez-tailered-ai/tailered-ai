# P0-A test matrix

Every escape class, its payload, the enforcing rule, and its result. Executed end-to-end
through the real ship loop against **disposable fixtures**, with a deterministic agent —
zero model calls, zero API spend.

`before` = baseline `main` @ `5eea7766`. `after` = branch `fix/p0-a-agent-write-containment`.

Protected surfaces checked by SHA-256 on every case: `decisions/ADR-000.md`,
`decisions/ADR-001.md`, `AGENTS.md`, `policies/gates.yaml`.

| # | Payload | Path | Rule | Expected | Before | After |
|---|---|---|---|---|---|---|
| 01 | legitimate control | `product/index.html` | — | allow | ships, INTACT — **PASS** | ships, INTACT — **PASS** |
| 01b | nested legitimate | `product/assets/deep/style.css` | — | allow | n/a | ships, file written — **PASS** |
| 02 | direct protected path | `decisions/ADR-000.md` | 3 | deny | halted, INTACT — PASS | halted, INTACT — **PASS** |
| 03 | in-repository traversal | `product/../decisions/ADR-000.md` | 3 | deny | **shipped, ADR-000 MUTATED — FAIL** | halted, INTACT — **PASS** |
| 04 | nested traversal | `product/a/../../decisions/ADR-000.md` | 3 | deny | **shipped, ADR-000 MUTATED — FAIL** | halted, INTACT — **PASS** |
| 05 | constitution traversal | `product/../AGENTS.md` | 3 | deny | **shipped, AGENTS.md MUTATED — FAIL** | halted, INTACT — **PASS** |
| 06 | root escape | `product/../../../tmp/tailered-pwned` | 3 | deny | halted, INTACT — PASS | halted, INTACT — **PASS** |
| 07 | absolute path | `/tmp/tailered-pwned` | 1 | deny | halted, INTACT — PASS | halted, INTACT — **PASS** |
| 08 | NUL byte | `product/evil\u0000.html` | 1 | deny | see caveat | denied — **PASS** |
| 09 | symlinked directory | `product/link/ADR-000.md` where `product/link -> ../decisions` | 5 | deny | **shipped, ADR-000 MUTATED — FAIL** | halted, INTACT — **PASS** |
| 10 | symlink to repo root | `product/root/AGENTS.md` where `product/root -> ..` | 5 | deny | **shipped, AGENTS.md MUTATED — FAIL** | halted, INTACT — **PASS** |
| 11 | existing symlink leaf | `product/pointer.html -> ../AGENTS.md` | 5 | deny | shipped, INTACT — incidental | halted, INTACT — **PASS** |
| 12 | capability root as file | `product` | 8 | deny | halted, INTACT — PASS | halted, INTACT — **PASS** |
| 13 | **founder gate edit** traversal | `product/../decisions/ADR-000.md` via `--verdict edit` | 7 | deny | **shipped, ADR-000 MUTATED — FAIL** | halted, INTACT — **PASS** |
| 14 | backslash separators | `product\..\decisions\ADR-000.md` | 3 | deny | halted, INTACT — PASS | halted, INTACT — **PASS** |
| 15 | terminal record preserved | denied escape | — | one eval | n/a | exactly 1 terminal `EvalRow` — **PASS** |

**Before: 6 escape classes succeeded, all reporting `outcome: "shipped"`.**
**After: 14/14 denied, both legitimate controls still ship.**

## Caveats recorded rather than hidden

**Case 08 in the shell harness did not truly exercise NUL.** Bash truncates a variable at a
NUL byte, so the payload degraded to `product/evil` — an in-`product/` write that is
correctly allowed. The class is genuinely covered by the TypeScript integration test
`containment: NUL-containing path is denied`, which passes a real escape sequence, and by
`resolveRepoPath`'s explicit NUL rejection. The shell row is retained for transparency about
what the harness could and could not do.

**Case 11 passed before the fix only incidentally.** `writeAtomic` ends in `rename()`, which
replaces the symlink itself rather than following it to its target. Safe by accident, not by
contract — the destination was unspecified behaviour. It is now explicitly denied by rule 5.

## SKIP

| Class | Reason | Compensating coverage |
|---|---|---|
| Windows path-separator semantics | macOS runner; `\` is a literal filename character under POSIX | The primitive uses platform-aware `relative()`/`sep`, so the same payload is a traversal on Windows and is rejected by rule 3. **Reasoned, not executed.** Windows CI recommended before any Windows deployment. |

## Rule reference

Rules are numbered per [containment-contract.md](containment-contract.md):
1 repository-relative only · 3 lexical containment · 5 no symlink components ·
7 one enforcement path for agent and gate · 8 the root is not a file.
