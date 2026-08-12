# S3-16 — adversarial self-review of the corrective PR

Every claim in the PR read as an adversary trying to break it. Findings are recorded
whether or not they changed the outcome.

## Claims attacked

| # | Claim | Attack attempted | Result |
|---|---|---|---|
| 1 | The capability root cannot be a symlink | Multi-segment capability root (`a/b`) where only `a` is a link | **Holds.** The walk iterates `capabilitySegments`, checking every component, not just the last. |
| 2 | The capability root cannot be a symlink | Root missing entirely | **Holds, fail-closed.** `lstat` `ENOENT` throws rather than `break`ing — deliberately unlike the descendant walk, where a not-yet-created destination is normal. |
| 3 | The capability root cannot be a symlink | `product` is a file, socket or FIFO | **Holds.** `isDirectory()` rejects all non-directories. |
| 4 | Symlink check ordering | `lstat` a symlink-to-directory and rely on `isDirectory()` | **Holds.** `lstat` reports the link, not its target, and `isSymbolicLink()` is checked *first*, so ordering cannot be exploited. |
| 5 | Outside writes are impossible | `product -> /elsewhere` | **Holds.** Case 17, asserted by an empty-directory check on the link target. |
| 6 | Founder edits share enforcement | Gate edit through a symlinked root | **Holds.** Case 18 and a dedicated test; `applyProductFiles` is still the only caller. |
| 7 | No over-blocking | Repository reached through an aliased parent | **Holds.** Positive control ships and the write lands in the real repository. |
| 8 | No over-blocking | The repository root *itself* is a symlink | **Holds** — and this is exactly what the positive control exercises, since `root = parent/alias`. **Wording corrected:** the contract and code comment said symlinks "above" the repository root; the accurate statement is "at or above". |
| 9 | Batch is all-or-nothing | Second write in a batch fails on I/O after the first succeeded | **Claim is narrower than it sounds, and is stated narrowly.** Rule 11 says every destination is *resolved* before any byte is written, so a **rejected** batch leaves no partial artifact. It does not claim transactional writes across I/O failure. No wording change needed; verified the docs never overstate it. |
| 10 | Protected surfaces unchanged | — | **Holds.** 12/12 byte-identical, verified three times (S1-08, S3-08, post-commit). |
| 11 | No P0-B scope | — | **Holds.** Six P0-B production files unmodified; only `src/files.ts` changed. |
| 12 | Counts are literal | — | **Holds.** 18 enumerated / 17 executable / 17 PASS / 1 INVALID, stated in that form everywhere, with an explicit "do not read this as 18/18". |

## Findings that changed the submission

1. **"above" → "at or above" the repository root** (`src/files.ts` comment, contract rule 2,
   requirement map). The root itself being an alias is legitimate and is what the positive
   control actually tests; the old wording did not cover its own test.
2. **Stale rule cross-references** in the contract after renumbering: "v1 failed because
   two of them (R4-R6)" → three (rules 4, 5, 6); "CLOSED by rule 2" → rule 6.
3. **Exploitability bound added** (report §3.2.1). `src/` contains no `symlink()` call and
   `FileWrite` is `{ path, content }`, so **an agent cannot create this condition itself** —
   the symlinked root must pre-exist via a clone, a restore, an operator action, or another
   local process. This bounds severity honestly. It does not reduce the need for the fix,
   and it reinforces why the class is *not* TOCTOU: a pre-existing condition is observable
   before the write.

## Findings deliberately not acted on

- **Markdown table-style lint warnings** (MD060) throughout the P0-A docs. Pre-existing
  house style, no CI gate, cosmetic. Changing them would enlarge the diff for no gain.
- **`PRODUCT_ROOT` remains a constant.** Generalising to multiple capability roots is a
  design change, not a defect fix, and is recorded as residual risk 2.
- **TOCTOU remains open.** Closing it needs `openat`-style resolution Node does not expose.
  Recorded as residual risk 1 and kept distinct from the class fixed here.

## Verification after these changes

`npm run check` exit 0 · `npm test` **38/38** exit 0 · `npm run validate` exit 0 VERIFIED ·
`npm run demo` exit 0 `shipped` **$0.068** · 12/12 protected surfaces byte-identical. See
`S3-16-post-review-verification.txt`.
