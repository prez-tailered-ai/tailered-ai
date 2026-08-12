# Scope 1 handoff — preservation and recoverable baseline

**Status: PASS.** All corrective work is recoverable, ancestry is proven, no P0-B work
exists, and the canonical repository's protected surfaces are intact.

## Identity (S1-01, S1-02)

| Item | Value |
|---|---|
| Repository | `prez-tailered-ai/tailered-ai` |
| Remote `origin` | `https://github.com/prez-tailered-ai/tailered-ai.git` (fetch + push) |
| Local clone | `<home>/src/tailered-ai` |
| Branch | `fix/p0-a-capability-root-symlink` |
| HEAD | `60adb63ef6be09b93237d75758d3b2e817019f9c` |
| Ancestry | `60adb63` **is** an ancestor of HEAD (`merge-base --is-ancestor` exit 0) |
| Divergence | `git rev-list --left-right --count 60adb63...HEAD` → `0 0` |

HEAD is **exactly** the merge commit of PR #3, with the corrective work uncommitted. No
local commits sit between the baseline and the working tree.

Evidence: [`evidence/S1-03-status.txt`](evidence/S1-03-status.txt).

## Working-tree inventory (S1-03, S1-05)

Five modified tracked files. **Zero** staged, **zero** untracked, **zero** deleted,
**zero** renamed.

| File | Type | Purpose | Classification | In final PR? |
|---|---|---|---|---|
| `src/files.ts` | M | capability-root verification replaces `realpath` | **CORRECTIVE PRODUCTION CODE** | yes |
| `test/containment.test.ts` | M | four regression tests + `replaceProductWithSymlink` helper | **CORRECTIVE TEST** | yes |
| `docs/…/p0-a/containment-contract.md` | M | rule 2 rewritten; TOCTOU distinction added | **P0-A DOCUMENTATION** | yes |
| `docs/…/p0-a/report.md` | M | correction notice; three-state matrix (partial at Scope 1) | **P0-A DOCUMENTATION** | yes |
| `docs/…/p0-a/test-matrix.md` | M | cases 15-18; NUL row reclassified `INVALID` | **P0-A DOCUMENTATION** | yes |

No `UNRELATED`, `P0-B`, or `UNKNOWN` file is present.

## Recovery backup (S1-04)

A timestamped backup exists **outside** the Git repository, containing the binary
worktree patch, the (empty) index patch, the porcelain status, HEAD, branch name, the
untracked-file list, and **full copies of all five modified files** — because a Git patch
alone does not carry untracked content.

The absolute machine path is deliberately not recorded here. Its content hashes are:

| Backup artifact | SHA-256 |
|---|---|
| `files/src/files.ts` | `a3678a85c660e87fd5e86b99c3916825a8e8f53a7eb4726c0ba7e956401a570f` |
| `files/test/containment.test.ts` | `1cc5bcddbf8f724f50f87878c95e1483df10f3a536f52cea75e83b7ef5dd0cb8` |
| `files/docs/…/containment-contract.md` | `7e229918ce172160d9ab912c1fdc9a2f9489ab47fcef13ea32a1af6fad0e4707` |
| `files/docs/…/report.md` | `5ce8fcec657482ebca1f3085c51b4b6311d10853b3e61f54e928bdd6b7f7fd58` |
| `files/docs/…/test-matrix.md` | `02ec33b1817dcebe38bcb97b2f45af52a9e3e33cb141da14237c8b9aa613ee88` |
| `worktree.patch` | `f27af02ed7ea36ff552d24c714eec4368cfdeb78e3522980fddf15b607b2c312` |
| `index.patch` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (empty — nothing staged) |
| `untracked-list.txt` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (empty — no untracked files) |

Full listing: [`evidence/S1-04-backup-hashes.txt`](evidence/S1-04-backup-hashes.txt).

## P0-B absence (S1-06)

`src/ledger.ts`, `src/company.ts`, `src/validate.ts`, `src/ship.ts`, `src/contracts.ts`
and `src/cli.ts` are all **UNMODIFIED**. The only production file changed against
`60adb63` is `src/files.ts`.

A keyword scan of the diff for locking, identifier allocation, terminal finalization,
started-run markers, journals and concurrency returned hits **only in documentation
prose** — the TOCTOU comparison table and the correction notice. No P0-B implementation
is present.

**P0-B remains `NOT_STARTED`.**

Evidence: [`evidence/S1-06-p0b-check.txt`](evidence/S1-06-p0b-check.txt).

## Current state, not final results (S1-07)

Measured on the uncommitted working tree at HEAD `60adb63`, exit codes read directly:

| Command | Exit | Result |
|---|---|---|
| `npm run check` | 0 | clean |
| `npm test` | 0 | **37 tests, 37 pass, 0 fail, 0 skipped** |
| `npm run validate` | 0 | VERIFIED |
| `npm run demo` | 0 | `shipped`, **$0.068** |

These establish the current state. Scope 3 produces the authoritative results.

Evidence: [`evidence/S1-07-summary.txt`](evidence/S1-07-summary.txt).

## Protected surfaces (S1-08)

All **12** canonical protected surfaces are byte-identical to the P0-A baseline recorded
in `p0-a/evidence/baseline-protected-hashes.txt`: `AGENTS.md`, `tailered.config.json`,
`decisions/ADR-000…003.md`, `policies/gates.yaml`, `loops/ship.yaml`,
`seats/roster.yaml`, `evals/ledger.jsonl`, `evals/routes.jsonl`, `labels/ledger.jsonl`.

The accepted-ADR inventory is unchanged at ADR-000 … ADR-003. No new ADR was appended.

> **Count correction.** Earlier narration in this program said "13 protected surfaces".
> The baseline file contains **12** lines and always has. No committed document carried
> the wrong number; the error was verbal only. **12** is authoritative.

Evidence: [`evidence/S1-08-protected-now.txt`](evidence/S1-08-protected-now.txt).

## What Scope 2 must reconcile

1. `p0-a/report.md` — sections 9, 10, 11, 13 and a new process section are still stale
   at the end of Scope 1; the correction notice, section 4 and section 6 are done.
2. `p0-a/evidence-manifest.json` — no corrective entry yet; hashes of the five changed
   documents are now stale.
3. `execution-ledger.jsonl` — 13 events end at `P0A-EV-013`, whose completeness claim
   must be explicitly **SUPERSEDED**, not deleted.
4. `handoffs/P0-A-to-P0-B.md` — still names `60adb63` as an acceptable P0-B base and
   still claims 15 containment tests.
5. `README.md` — scope table still reads "P0-A COMPLETE — awaiting PREZ merge gate".
6. `p0-a/evidence/threat-matrix-after.txt` — the historical 14-case v1 run; must be
   preserved and marked superseded rather than overwritten.
