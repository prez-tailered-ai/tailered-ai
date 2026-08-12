<!-- audit: {"audit_id":"AUD-RUFLO-20260811-221322","tailered_sha":"6172653e0aca0981d0abaf4ad8e9d587667737e9","ruflo_release":"v3.37.0","ruflo_sha":"6ce18b5a7fcd4939a2f72c2e3b8fdbdec660e5a9","generated":"2026-08-11T22:30:00Z","evidence_class":"MIXED","lane":"AUD-L2a","caused_by":["AUD-RUFLO-20260811-221322/01-audit-charter.md"]} -->

# 06 — Build, package, and CI audit

## Source-to-package parity

Lane AUD-L2a compared the v3.37.0 git checkout against both published tarballs. Every claim below
was observed directly in those three trees. No install or execution occurred, so no finding here
rises above PACKAGED. Full evidence: `evidence/source-package-parity.json`.

**Subsystems in source that reach neither tarball.** Of 23 named `@claude-flow/*` workspace
packages, 9 reach a `ruflo` consumer and 14 do not: `browser`, `claims`, `deployment`,
`integration`, `performance`, `plugins`, `providers`, `testing`, `plugin-iot-cognitum`, `hooks`,
`swarm`, plus the three named next. `hooks` and `swarm` are compiled by the publish scripts
(`scripts/prepare-root-publish.mjs:14`, `v3/@claude-flow/cli/scripts/prepare-publish.mjs:20`) and
then not shipped. Of 38 plugin directories (599 files), **1 is published and 37 are deleted** by an
explicit `rm` + recreate at `v3/@claude-flow/cli/scripts/prepare-publish.mjs:34-40`; only
`plugins/ruflo-metaharness` (50 files) survives.

**Three packages the shipped code imports are declared nowhere** (VERIFIED). `dist` dynamically
imports `@claude-flow/guidance` (7 sites, `dist/src/commands/guidance.js:40,110,111,187,280,343,433`),
`@claude-flow/embeddings` (6 sites) and `@claude-flow/aidefence` (5 sites, including
`dist/src/mcp-tools/security-tools.js:464` and `dist/src/commands/security.js:950`). None appears in
any dependency field of the published manifest (`v3/@claude-flow/cli/package.json:99-134`) and none
is bundled. npm is never instructed to install them. `aidefence` backs the security paths, making it
the highest-consequence instance. A raw substring scan finds 37 `@claude-flow/*` strings in `dist`,
but only 9 are real module specifiers — the rest are catalog data, several naming packages that do
not exist in source at all. Whether these call sites degrade or throw is UNKNOWN in this lane.

**Counts.** All recounted independently, never copied.

| Thing | Advertised | In tarball | Note |
| --- | --- | --- | --- |
| Agents | 164 | **90** | Manifest counts repo root; package ships a different tree |
| Tools | 397 | not checkable | Counted from `src/mcp-tools/*.ts`; `src/` is not shipped |
| Skills | 34 | 34 | The one package-accurate count |
| Plugins | 38 dirs | **1** | 549 files removed at publish |

The 164/90 conflict is structural: `generate-catalog-manifest.mjs:33` counts agents from
`REPO_ROOT` while `:52` counts skills from `PKG_ROOT`. The two agent trees are not subset/superset —
36 files are root-only, 17 are package-only, 72 are common.

**dist/src parity.** `dist` is a clean 1:1 emission at the file-set level: 365 `.ts` → 365 `.js` +
365 `.d.ts`, per-directory counts matching across all 24 subdirectories, no orphans. Byte-level
equivalence is **not** establishable: zero dist files are git-tracked (`.gitignore:104`), and this
lane does not compile. `src/` is not shipped, so **a registry user cannot audit what they run.** One
genuine checked-in divergence was found: `.claude/helpers/helpers.manifest.json` declares version
`3.34.0` with one Ed25519 signature in the tagged source and `3.37.0` with a different signature in
the tarball; `.helpers-version` reads `3.32.29` in source and `3.33.0` in the tarball. Three
inconsistent version strings, and the shipped signature is not reproducible from the tag.

**What prepublish does** (the mechanism by which artifact ≠ repo):

- `ruflo/scripts/prepare-publish.mjs:8` — its entire body overwrites `ruflo/README.md` with the root
  README. VERIFIED by checksum; the repo's own 30,004-byte `ruflo/README.md` is never published.
- `v3/@claude-flow/cli/scripts/prepare-publish.mjs` — compiles `dist` (`:20-29`, because dist is
  git-ignored), stages bundles (`:31`), overwrites the README (`:33`), deletes and rebuilds
  `plugins/` (`:34-40`), then regenerates the catalog manifest and re-signs helpers (`:42-54`).
- `scripts/stage-internal-runtime-bundles.mjs:132-135` — **deletes `dependencies`,
  `optionalDependencies`, `peerDependencies` and `peerDependenciesMeta`** from all three bundled
  internal packages, relocating them to a non-standard `rufloBundledRuntime` key no package manager
  reads. VERIFIED in the tarball: codex loses 7 deps, security 3 + 1 optional, federation 2 + 2 peers.

**Platform.** `@ruvector/router-linux-x64-gnu` is declared only at root `package.json:95`, in the
separately published `claude-flow` package; it appears nowhere in either audited tarball, so it is
not a factor for `npm i ruflo`. Neither published manifest declares `os`, `cpu` or `libc`. Divergence
on the audited path comes from `@metaharness/darwin` (`package.json:126`) and the native optionals
`better-sqlite3` and `@napi-rs/keyring`. The exact arm64-macOS vs linux-x64 delta is UNKNOWN without
resolution.

**Unexpected published content.** No secrets: no `.env`, key, certificate, database or test fixture
is in either tarball, and `agentdb.rvf` is correctly excluded. The issue is bulk and opacity. The
`ruflo` package is 526 files of which the entry point uses 3 — `bin/ruflo.js` imports only
`@claude-flow/cli` and never references `src/`, yet 523 `src/` files ship, 499 of them a vendored
SvelteKit sub-project with its own 10 CI workflows, git hooks, Helm chart, a 543 KB WASM binary, two
`package-lock.json` files and 1.3 MB of media. The CLI ships a 348-file `.claude/` tree whose
`settings.json` carries an `env` block and PreToolUse/PostToolUse/UserPromptSubmit hooks, plus
`proven-config.signed.rvf` asserting benchmark receipts against a corpus present in neither tarball.
**Neither package ships a LICENSE file** despite both declaring MIT and `ruflo/package.json:24`
listing `LICENSE` in its allowlist.
