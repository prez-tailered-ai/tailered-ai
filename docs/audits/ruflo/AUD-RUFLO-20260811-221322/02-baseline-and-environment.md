<!-- audit: {"audit_id":"AUD-RUFLO-20260811-221322","tailered_sha":"6172653e0aca0981d0abaf4ad8e9d587667737e9","ruflo_release":"v3.37.0","ruflo_sha":"6ce18b5a7fcd4939a2f72c2e3b8fdbdec660e5a9","generated":"2026-08-11T22:20:00Z","evidence_class":"VERIFIED","lane":"AUD-L0","caused_by":["AUD-RUFLO-20260811-221322/01-audit-charter.md"]} -->

# 02 — Baseline and environment

## Repository preflight (VERIFIED)

The active checkout `~/src/tailered-ai` was clean at audit start and was never modified: no staged or
unstaged changes, no untracked files, no stashes, and exactly one worktree. `main` was identical to
`origin/main` after an explicit fetch, at `6172653e0aca0981d0abaf4ad8e9d587667737e9` — byte-identical
to the reference SHA recorded in the master audit specification, so no baseline reconciliation was
required. The repository contains three commits and 51 tracked paths.

All audit work happens in a separate worktree at `/tmp/aud-ruflo-20260811/tailered-ai-audit` on branch
`audit/ruflo-qualification-20260811`, created from the frozen SHA.

## Ruflo acquisition and pinning (VERIFIED)

| Item | Value |
| --- | --- |
| npm dist-tags at audit start | `latest`, `alpha`, `v3alpha` all = `3.37.0` |
| GitHub latest release | `v3.37.0` — "proxy install hardening, cloud routing disclosure, tier pinning", published 2026-08-11T17:07:54Z |
| Stable tag commit | `6ce18b5a7fcd4939a2f72c2e3b8fdbdec660e5a9` (2026-08-11T13:05:13-04:00), tree `85fe469e138da391a545e87fd7874dd09ef4db21` |
| `main` commit | **the same commit** `6ce18b5a…` — the main-versus-stable delta is empty |
| npm `ruflo@3.37.0` | sha512-oSEJHswwFMsMxhVDIfhR5Q/k/x5foO+cg7ZgYe5GUcK3u72RXppvFapAnMUuG+FtYcxvNTJ3JAdwtjuogbcHfQ==, shasum `4c03c15bf4538d6deacbee37139ca4ff1ab4b3c3` |
| npm `@claude-flow/cli@3.37.0` | sha512-AdpAehqNVodqrB1oy4ljvlu6FBZTe3T6+KorgP2dsnaqn1KfJdHUaZoYYU4WtRxbpHzVDL+m04hTe/m3Cs6TOQ==, shasum `559be6ba258c5bbc9c5e219bc6a50968aab82900` |
| Local tarball sha256 | `ruflo-3.37.0.tgz` = `f2a7d5ad6969a817c06a61daed68a770c7ad4a5068a1ed31cf6650dead74759c`; `claude-flow-cli-3.37.0.tgz` = `59a386240941dcf20332d742673c3a245574bc5c6926fc5f71ebbb000d90d70e` |
| GitHub source archive sha256 | `50c0187f5df72b7226eff46608558bf2b92f62fd1b76fdcfbcd63fc39efd1f4c` |
| License | MIT (GitHub metadata and repository `LICENSE`) |

Version 3.37.0 was published 2026-08-11T17:07:03Z — roughly five hours before this audit began, and
one day after 3.36.0 (2026-08-10T17:41Z) and 3.35.0 (2026-08-10T14:20Z). The release cadence is rapid.

## Tailered AI baseline (VERIFIED — green and reproducible)

`package.json` declares `engines.node >= 24` and the README requires npm 11+, while the audit host runs
Node v22.22.0 / npm 10.9.4. The canonical baseline therefore ran inside disposable `node:24` Docker
containers (Node v24.19.0, npm 11.17.0), matching `.github/workflows/ci.yml`, against a pristine
`git archive` export of the frozen SHA. Every command was captured with its exit code and wall time;
no error suppression (`|| true`, `continue-on-error`) was used anywhere.

| Command | Node 24 pass 1 | Node 24 pass 2 | Node 22 (local, supplementary) |
| --- | --- | --- | --- |
| `npm ci` | exit 0, 2 s | — | exit 0, 1 s (with `EBADENGINE` warning) |
| `npm run check` | exit 0, 1 s | exit 0, 1 s | exit 0, 1 s |
| `npm test` | exit 0, 2 s | exit 0, 2 s | exit 0, 1 s |
| `npm run validate` | exit 0, 1 s | exit 0, 1 s | exit 0, 1 s |
| `npm run demo` | exit 0, 2 s | exit 0, 1 s | exit 0, 0 s |

Postconditions were read from the output rather than inferred from exit codes. `npm run validate`
reported `"status": "VERIFIED", "valid": true, decisions: 4` with zero evals, labels, routes, calls,
and contexts — correct for a repository that has not yet run a ship loop. `npm run demo` minted a
company in a temporary directory and returned a terminal receipt: outcome `shipped`, cost **$0.068**,
4,527 mid-tier and 1,057 cheap-tier tokens, 278 ms wall time, one eval (`EVAL-000001`), one gate label
(`LABEL-000001`), and `ADR-002`, with a preview URL and a rendered dashboard. Both Node 24 passes
produced the same result, so the baseline is reproducible.

**No pre-existing Tailered baseline failures were found.** Any Tailered failure observed later in this
audit is therefore either caused by audit activity or is a genuinely new discovery, and must be
investigated rather than attributed to a pre-existing defect.

The only stderr output on Node 24 was an npm upgrade notice. On local Node 22 the install emitted
`npm warn EBADENGINE ... required: { node: '>=24' }, current: { node: 'v22.22.0' }` — expected, and the
reason Node 24 containers are treated as canonical.

## Environment (VERIFIED)

Host: macOS Darwin 25.5.0, arm64 (Apple Silicon), 8 GB RAM, ~34 GB free disk at start. Node v22.22.0,
npm 10.9.4, git 2.55.0, pnpm 10.33.0, bun 1.3.14, Python 3.14.6, Docker 29.6.1 (Docker Desktop).
Full detail in `evidence/environment.json`.

## Declared limitations

1. **Node 24 only via Docker.** No host Node 24 exists; container results are canonical and a local
   Node 22 pass is recorded separately.
2. **No GitHub push permission.** The authenticated account has `pull: true, push: false` on
   `prez-tailered-ai/tailered-ai`. The audit branch and commit are prepared locally and the exact push
   and draft-PR commands are reported instead. This is an environment limitation, not an audit failure.
3. **No Rust toolchain** (`cargo` absent), so Ruflo Rust-crate tests are `UNKNOWN` unless a container
   image supplies the toolchain.
4. **No model credentials, and paid model calls are forbidden.** Every model-dependent Ruflo behavior
   is therefore probed with local mocks or read from source and labeled `INFERRED` or `UNKNOWN`, never
   `VERIFIED`.
5. **8 GB RAM / limited disk** bounds the concurrency scenarios; where a bound truncates a test it is
   recorded with the result.

## Isolation model actually used

Every piece of Ruflo code executed during this audit ran inside a disposable `docker run --rm`
container. No container ever mounted the host `$HOME`, `~/.claude`, or any credential path; mounts were
restricted to directories under `/tmp/aud-ruflo-20260811/`. Ruflo therefore had **no write path** to
host global configuration at any point, which is what makes the host-mutation observations below
attributable with confidence.

## Host non-mutation proof (VERIFIED, with one attributed exception)

`~/.claude/settings.json` was byte-identical before and after (sha256
`73920b1d5e5c4f3ba427d40f78333684cce272258ce5f90fde5049ef71088adf`), and the `~/.claude/skills`
listing was unchanged.

`~/.claude.json` **did** change (`33885ce8…` → `bc5f9b28…`). This is **not** attributable to Ruflo.
The file contains no occurrence of the strings "ruflo" or "claude-flow" anywhere in its 74,475 bytes;
its keys are Claude Code session and cache state (`projects`, `cachedGrowthBookFeatures`,
`announcementImpressions`, and similar); and no container in this audit mounted the host home
directory, so no write path existed. The change is attributed to the interactive Claude Code session
that is conducting the audit. It is recorded here rather than silently omitted, and nothing was done
to "clean" it.
