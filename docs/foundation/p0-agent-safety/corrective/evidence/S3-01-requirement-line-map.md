# S3-01 — corrective production diff review

Production change against `60adb63`: **one file**, `src/files.ts`, **+36 / −3**.
No other production file is touched. Line numbers refer to `src/files.ts` after the change.

## Requirement → line mapping

| # | Requirement | Lines | How it is satisfied |
|---|---|---|---|
| 1 | canonicalizes the repository root once (symlinks at or above the root are the operator's, not the agent's) | **77-86** | `canonicalCapabilityRoot = await realpath(root)` inside a `try`, with a fail-closed `ValidationError` on any error. Called once per resolution. |
| 2 | does **not** trust `realpath(root/product)` as proof of capability identity | **79** (was `realpath(lexicalCapabilityRoot)`) | The `realpath` argument changed from the capability root to the repository root. The capability root is never passed to `realpath`. |
| 3 | walks the lexical capability-root components | **88-90, 91-113** | `relative(resolve(root), lexicalCapabilityRoot)` split on `sep`, empty segments filtered; the loop descends one component at a time from the canonical repository root. |
| 4 | requires the capability root to exist | **93-101** | `lstat(candidate)`; **any** error — including `ENOENT` — throws. Note the deliberate contrast with the descendant walk at **124-133**, where `ENOENT` legitimately `break`s because a not-yet-created destination is normal. |
| 5 | requires it to be a directory | **108-112** | `if (!entry.isDirectory()) throw` — rejects files, sockets, devices, FIFOs. |
| 6 | rejects it if it is a symlink | **103-107** | `if (entry.isSymbolicLink()) throw`. Checked **before** `isDirectory()`, because `lstat` on a symlink-to-directory reports a symlink, and testing type first would let the ordering matter. |
| 7 | rejects symlink descendants | **115-147** | Unchanged from v1: the descendant walk rejects any existing symlink component including the leaf. |
| 8 | fails closed on filesystem errors | **81-85, 97-101, 129-133** | Every `catch` throws `ValidationError`. No path returns a destination on an unproven boundary. |
| 9 | preserves batch prevalidation | `src/ship.ts` **unchanged** | `applyProductFiles` still resolves every destination before writing any. Unmodified by this diff — confirmed by `git status`. |
| 10 | preserves the shared write path for agent and founder edits | `src/ship.ts` **unchanged** | `applyProductFiles` remains the single caller; case 18 proves the gate path is bound by the new rule. |

## Every changed line accounted for

| Hunk | Lines | Purpose |
|---|---|---|
| comment | 70-76 | Records **why** the root is verified rather than canonicalized, and why symlinks above the repository root are legitimate. |
| changed argument | 79 | `realpath(lexicalCapabilityRoot)` → `realpath(root)`. **The defect fix.** |
| changed message | 81-85 | Error text now names the repository root, matching what actually failed. |
| new walk | 88-113 | Requirements 3-6. |

No unexplained production change remains.

## Deliberate non-changes

- **`resolveRepoPath` untouched.** Absolute-path and NUL rejection are unchanged and still
  carry rule 1.
- **The descendant walk untouched.** v1's handling below the capability root was correct;
  only the boundary above it was wrong.
- **`src/ship.ts` untouched.** The chokepoint did not move. A fix that also edited the
  caller would have made it harder to see that the defect was entirely inside the
  primitive.
- **No new dependency.** Still 4 packages, 0 vulnerabilities; `package.json` and
  `package-lock.json` are byte-identical to `60adb63`.
