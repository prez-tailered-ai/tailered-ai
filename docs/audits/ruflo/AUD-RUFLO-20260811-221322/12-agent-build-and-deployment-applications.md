<!-- audit: {"audit_id":"AUD-RUFLO-20260811-221322","tailered_sha":"6172653e0aca0981d0abaf4ad8e9d587667737e9","ruflo_release":"v3.37.0","ruflo_sha":"6ce18b5a7fcd4939a2f72c2e3b8fdbdec660e5a9","generated":"2026-08-12T02:00:00Z","evidence_class":"MIXED","lane":"AUD-L6c","caused_by":["AUD-RUFLO-20260811-221322/01-audit-charter.md","AUD-RUFLO-20260811-221322/11-tailered-compatibility.md"]} -->

# 12 — Ruflo as a component for building and deploying agents from this repository

## 1. Scope

This lane answers one question: for the repository at `/tmp/aud-ruflo-20260811/tailered-ai-audit`,
would Ruflo v3.37.0 be a useful component for **building, evaluating, packaging, deploying,
observing, and operating agents** — and for each candidate use case, what would it add that this
repository does not already have?

**What I read.** The frozen Tailered AI source: `AGENTS.md`, `README.md`, `docs/platform-brief.md`,
`docs/v1-contract.md`, `docs/agent-protocol.md`, `docs/blueprint-execution.md`,
`docs/full-system-blueprint.md`, `loops/ship.yaml`, `policies/gates.yaml`, `seats/roster.yaml`,
`tailered.config.json`, `.github/workflows/ci.yml`, `package.json`, `benchmarks/todo-auth.json`,
all four accepted ADRs, all 16 files of `src/` and all 5 of `test/`. From this audit I read the
charter (`01`), the capability inventory (`03`), the claims matrix (`04`), the architecture and
runtime map (`05`), the build/package/CI audit (`06`), security and supply chain (`07`),
concurrency and isolation (`09`), performance and cost (`10`), the compatibility lane (`11`), both
spike reports (`13`), the scorecard (`15`), and the recommendation and verdict (`16`, `00`).

**What I did not read, deliberately.** No repository other than this audit worktree and the pinned
Ruflo evidence roots. I did not open the superseded application analysis written under an earlier
revision of the specification, because its subject was a different first-party repository and this
lane's scope is `prez-tailered-ai/tailered-ai` only. That document has since been deleted.
Where a line of reasoning would have needed another first-party repository, the answer is
`OUT_OF_SCOPE_REPOSITORY`.

**Evidence roots.**

- `TA =` `/tmp/aud-ruflo-20260811/tailered-ai-audit/` — this repository.
- `T =` `/tmp/aud-ruflo-20260811/work/extract/cli/package/` — published `@claude-flow/cli@3.37.0`.
- `R =` `/tmp/aud-ruflo-20260811/work/extract/ruflo/package/` — published `ruflo@3.37.0`.
- `C =` `/tmp/aud-ruflo-20260811/upstream/ruflo-v3.37.0/` — the pinned clone.

**Baseline integrity.** `VERIFIED:` the worktree HEAD is `44f141ed`, whose only diff against the
frozen `6172653e` is 118 added files, all under `docs/audits/` (`git diff --name-only
6172653e..HEAD` returns nothing outside that tree). Every `src/`, `docs/`, `decisions/`, and
`test/` citation below is therefore at the frozen SHA.

**Execution ceiling.** I executed no Ruflo command. Every Ruflo behavioural statement is carried
from a lane that did execute, and is cited to that lane. Anything that depends on a runtime this
lane could not reach is `INFERRED` or `UNKNOWN`, never `VERIFIED`.

## 2. What the platform already provides

This is the baseline any Ruflo capability must beat. It is small, it has zero runtime dependencies
(`TA package.json:26-29`), and most of it is exactly the machinery an "agent platform" component
would claim to supply.

| Platform capability | Where it lives | What it already guarantees |
| --- | --- | --- |
| Agent seat contract | `TA src/agent.ts:11-14` | Two methods: `project(request) → {maxCostUsd,maxTokens}` and `invoke(request) → AgentResponse`. Any implementation compiles in. |
| Vendor-neutral process boundary | `TA src/agent.ts:16-53,56-103`; `TA docs/agent-protocol.md:3` | One JSON request on stdin, one JSON response on stdout, stderr diagnostic only, no shell, 5 MB output cap, response schema validated (`:133-156`). |
| Reserve-and-settle spend authority | `TA src/budget.ts:24-145`; `TA docs/v1-contract.md:30-41` | Integer micro-dollars, hard ceiling reserved before the call, denial at `settled + reserved + projected >= cap`, `AccountingInvariantError` on over-settlement, `assertSettled()` at run end. |
| Stateless model router | `TA src/router.ts:12-48` | Pure function of `(taskKind, signals, registry)`. Third codegen attempt escalates to frontier. No persisted state, by constitutional requirement (`TA AGENTS.md:28`). |
| Single model registry | `TA tailered.config.json:3-7`; `TA src/config.ts:27-61` | Tier aliases loaded per run; a string swap changes every runtime model request, proven by `TA test/ship.test.ts:142-171`. |
| Append-only ledgers with causality | `TA src/ledger.ts:16-128`; `TA src/contracts.ts:151-200` | One `RouteLog` + one `AgentCallTrace` per executed call, one `GateLabel` per gate, exactly one `EvalRow` per run, uniqueness enforced on write, `caused_by` on every record. |
| Context capture and cache | `TA src/context.ts:10-79`; `TA src/files.ts:130-179` | One snapshot per repo state per run, content-hashed, stored once, with bytes / cache-hit / assembly-ms telemetry on every route (`TA src/contracts.ts:169-175`). |
| Bounded repair loop | `TA src/ship.ts:251-295` | Three attempts per check (`TA src/contracts.ts:18`), narrow failing check before the full suite (`:305-313`), halt-and-name-the-blocker. |
| Acceptance tests as data | `TA src/contracts.ts:77-83`; `TA docs/agent-protocol.md:60-74`; executed at `TA src/ship.ts:531-555` | `{command, args, cwd}` executed with `shell: false`. Test *generation* is already a first-class task kind (`testgen`). |
| Constitutional critique | `TA src/ship.ts:315-342`; `TA AGENTS.md:24` | `critique` returns `{violations, flags}`; violations trigger one repair pass, then unresolved violations are re-flagged into the gate context. |
| Human gate on the one irreversible action | `TA policies/gates.yaml:2-9`; `TA src/ship.ts:351-393` | Approve / reject / edit, every verdict captured as a structured label with artifact hash, reason prose, and full context snapshot. |
| Terminal outcome discipline | `TA src/ship.ts:414-467` | The `finally` block writes the ADR and exactly one `EvalRow` on every path, including halts. |
| Format validator | `TA src/validate.ts:17-30,49-158,231-297` | 12 required paths, ledger uniqueness, causal edges, and route↔trace↔snapshot cross-consistency, including canonical-path checks. |
| Executable definition of done | `TA src/ship.ts:486-524` | Nine assertions including the exclusive $5.00 cap and the ten-minute ceiling. |
| Product-write confinement | `TA src/ship.ts:557-569`; `TA src/files.ts:16-32,34-42` | The single apply path: `product/` prefix, 5 MB per file, repository-relative resolution, atomic write. (Defective — see §4.6.) |
| Immutable decisions | `TA src/company.ts:138-151` via `TA src/files.ts:44-50` | `flag: "wx"` — an accepted ADR cannot be rewritten, only superseded. |
| Pure-render dashboard | `TA src/dashboard.ts:5` | No dashboard-owned state; the repo is the only state (`TA decisions/ADR-000.md:19`). |
| Product qualification in CI | `TA .github/workflows/ci.yml:20-24` | `npm ci` → `check` → `test` (18 tests) → `validate` → `demo`, on every push and PR, in ten minutes. |
| Non-gating benchmark slot | `TA benchmarks/todo-auth.json` | A harder spec with declared accepted outcomes, run through the same ship loop (`TA src/cli.ts:99`). |

Two absences in the baseline matter for everything below, and neither is Ruflo's doing:

- `VERIFIED:` **nothing in the runtime binds a run to a git commit.** `.git` appears in `TA
  src/files.ts:14` only as a hash exclusion. The deployable identity today is a content hash of the
  working tree (`TA src/files.ts:93-112`), not a commit.
- `VERIFIED:` **`.tailered/` is a reserved exclusion with no writer.** It is excluded from the
  context snapshot at `TA src/context.ts:48` and written by nothing in `src/`. It is the only
  repository location where derived, non-ledger data can live without entering the model's context
  or the validator's required set.

## 3. Scored use-case table

**How to read this.** Every row scores **Ruflo v3.37.0 as an installed component of this
repository**, not the idea behind it. Where a row's value survives only as a pattern to
reimplement, §4 says so explicitly and the shortlist in §6 scores the reimplementation instead.

Scale 1–5. For `VAL FIT EVI TIME COST QUAL`, **5 is best**. For `INT SEC DAT DEP OPS CPL EXIT`,
**5 is worst**.

- `VAL` agent-platform value · `FIT` technical fit with the frozen architecture · `EVI` evidence
  strength behind the score · `TIME` engineering time saved · `COST` model/infra cost saved ·
  `QUAL` quality improvement
- `INT` required integration work · `SEC` security risk · `DAT` data-integrity risk · `DEP`
  deployment risk · `OPS` operational risk · `CPL` repository coupling created · `EXIT` removal and
  exit cost

| # | Use case | VAL | FIT | EVI | TIME | COST | QUAL | INT | SEC | DAT | DEP | OPS | CPL | EXIT |
| ---: | --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| U01 | Reusable agent definitions and role contracts | 4 | 4 | 4 | 3 | 1 | 3 | 2 | 2 | 1 | 1 | 1 | 1 | 1 |
| U02 | Vendor-neutral process-agent adapters | 1 | 1 | 5 | 1 | 1 | 1 | 5 | 5 | 4 | 3 | 4 | 4 | 3 |
| U03 | Bounded multi-agent orchestration | 1 | 1 | 5 | 1 | 1 | 1 | 5 | 4 | 5 | 3 | 5 | 5 | 4 |
| U04 | Isolated worktree and branch execution | 2 | 2 | 4 | 2 | 1 | 2 | 4 | 3 | 3 | 2 | 3 | 3 | 3 |
| U05 | Agent evaluation harnesses | 3 | 2 | 2 | 2 | 1 | 3 | 4 | 3 | 2 | 2 | 3 | 3 | 2 |
| U06 | Acceptance-test generation | 1 | 2 | 5 | 1 | 1 | 1 | 3 | 3 | 2 | 1 | 2 | 2 | 2 |
| U07 | Constitutional critique | 1 | 1 | 5 | 1 | 1 | 1 | 4 | 3 | 5 | 2 | 3 | 5 | 3 |
| U08 | Model and provider routing verification | 3 | 2 | 4 | 2 | 1 | 3 | 4 | 3 | 4 | 2 | 3 | 4 | 3 |
| U09 | Token and cost accounting | 2 | 1 | 5 | 1 | 1 | 1 | 4 | 3 | 5 | 2 | 4 | 4 | 3 |
| U10 | Agent-session observability | 3 | 2 | 3 | 2 | 1 | 3 | 4 | 3 | 4 | 2 | 3 | 3 | 2 |
| U11 | Deployment packaging | 1 | 1 | 2 | 1 | 1 | 1 | 5 | 5 | 4 | 5 | 4 | 4 | 3 |
| U12 | Deployment manifests and environment contracts | 1 | 1 | 5 | 1 | 1 | 1 | 4 | 4 | 3 | 4 | 3 | 3 | 2 |
| U13 | Staged agent rollout | 1 | 1 | 4 | 1 | 1 | 1 | 5 | 3 | 3 | 4 | 4 | 4 | 3 |
| U14 | Canary and rollback controls | 1 | 1 | 5 | 1 | 1 | 1 | 4 | 3 | 4 | 4 | 4 | 5 | 5 |
| U15 | Agent health checks | 2 | 2 | 4 | 1 | 1 | 2 | 4 | 3 | 3 | 3 | 4 | 3 | 3 |
| U16 | Runtime cancellation and lease expiration | 3 | 2 | 5 | 2 | 2 | 3 | 4 | 4 | 3 | 3 | 4 | 4 | 4 |
| U17 | Append-only execution traces | 1 | 1 | 5 | 1 | 1 | 1 | 5 | 3 | 5 | 2 | 3 | 5 | 4 |
| U18 | Removable subordinate memory | 1 | 1 | 5 | 1 | 1 | 1 | 4 | 5 | 5 | 3 | 5 | 5 | 5 |
| U19 | Reusable engineering-pattern storage | 2 | 1 | 2 | 1 | 1 | 2 | 4 | 4 | 5 | 3 | 4 | 5 | 5 |
| U20 | Security review and prompt-injection resistance | 1 | 1 | 4 | 1 | 1 | 1 | 4 | 5 | 3 | 3 | 3 | 4 | 3 |
| U21 | CI qualification for agent releases | 2 | 2 | 4 | 1 | 1 | 2 | 3 | 3 | 2 | 3 | 3 | 2 | 2 |
| U22 | Release provenance and artifact verification | 3 | 3 | 5 | 2 | 1 | 3 | 3 | 4 | 3 | 3 | 3 | 2 | 2 |
| U23 | Long-running bounded repair loops | 3 | 2 | 3 | 2 | 1 | 3 | 4 | 4 | 4 | 3 | 5 | 4 | 4 |
| U24 | Agent fleet governance from repository state | 1 | 1 | 5 | 1 | 1 | 1 | 5 | 4 | 5 | 4 | 4 | 5 | 4 |

Nineteen of twenty-four rows score `VAL ≤ 2`. Every one of those nineteen fails the differential
test below rather than a quality test: the capability either already exists in `TA src/`, or Ruflo's
version of it was measured to report success without establishing its postcondition.

### 3.1 Row reasoning

**U01 — Reusable agent definitions and role contracts.** `VERIFIED:` 90 agent definition files (81
unique names) ship in the package `npm i ruflo` installs, plus 167 slash-command Markdown files and
33 loadable skills, all copied by `ruflo init` (`03` §3.1, §3.3, §3.5, §4). This repository's entire
role-contract surface is nine lines — two seats, `founder` and `builder`, naming accountabilities
and a model registry pointer (`TA seats/roster.yaml:2-9`). **Differential: real.** Tailered has no
prompt assets at all; the roster says who is accountable, never what an agent is told. The value is
in the text, and the text needs no runtime: these are Markdown files with YAML frontmatter, readable
from the extraction path. Two caveats bound the score. `VERIFIED:` **neither published tarball ships
a LICENSE file** despite both declaring MIT and `R package.json:24` listing `LICENSE` in its
allowlist (`06`), and the `ruflo` wrapper declares MIT while 94.87% of its files are an Apache-2.0
huggingface/chat-ui fork (`16` §5, RUF-301/302). The agent definitions live in `@claude-flow/cli`,
outside that fork, so the MIT declaration plausibly covers them — `INFERRED`, and the artifact
carries no licence text to prove it. Second, Ruflo's own counts for this asset disagree four ways
(60+, 98, 100+, 164 — against 90 packaged), so any inventory must be recounted, not quoted.

**U02 — Vendor-neutral process-agent adapters.** This repository *is* the vendor-neutral adapter:
`docs/agent-protocol.md` plus `ProcessAgent`. **Differential: negative.** `VERIFIED:` pointing
`ProcessAgentConfig.command` at `ruflo` with `args: []` starts an MCP stdio server, because
`R bin/ruflo.js:55` computes `isMCPMode = !process.stdin.isTTY && (argv.length === 2 || …)` and
`TA src/agent.ts:65` always pipes stdin, so the TTY term can never be false (`13` Spike A,
MCP-TRAP-1/2). The server answers with `{"jsonrpc":"2.0","error":{…}}`, which parses as JSON and is
rejected one field short of acceptance — and `TA src/ship.ts:204-219` settles the full projection
ceiling on that failure, so a one-line configuration mistake produces a fully-billed halted run. The
only adapter shape that satisfies Tailered's invariants was built in Spike A and works
(`CONTAIN-1`: repo hash identical, 313 entries confined to a disposable sandbox) — but that adapter
is Tailered-side engineering, not something Ruflo supplies.

**U03 — Bounded multi-agent orchestration.** `VERIFIED:` `swarm start` prints an eight-agent
deployment plan, exits 0, and persists a record whose `agents` and `tasks` arrays are both empty
(RUF-701); `ruflo swarm --help` rewrites `.claude/helpers/statusline.cjs` inside the repository and
creates four files before any subcommand is chosen (RUF-702); six concurrent `issues claim` calls
all return `[OK] Claimed` while two or three are silently dropped, reproduced 3 of 3 trials
(RUF-440). Ruflo's own output says why the executor is missing: *"This CLI coordinates agent state.
Execution happens via: Claude Code Agent tool / `claude -p` / `hive-mind spawn --claude`"* (`13-bcde`
Spike B). **Differential: none.** Work partitioning is already in this repository's own trajectory
as a v3 subsystem with a stated data dependency (`TA docs/full-system-blueprint.md:60-61`), and
`TA docs/blueprint-execution.md:36-42` refuses it until that dependency exists.

**U04 — Isolated worktree and branch execution.** `VERIFIED:` the implementation is real and works
when invoked by path — `claude-flow-codex worktree prepare` creates genuine worktrees, per-agent
branches `ruflo/<run>/<agent>`, and correctly detached read-only agents (`09` §7.2). `VERIFIED:` it
is **not reachable from the `ruflo` binary**: no `worktree` command exists, the main CLI's `dist`
mentions worktrees in 16 files and never calls `git worktree add`, and `claude-flow-codex` is not
linked into the top-level `node_modules/.bin` (`09` §7.1). Four defects follow it: worktrees are
created *outside* the repository at `../.ruflo-worktrees/<repo>/`, `prepare` poisons its own
dirty-tree precondition, `cleanup` never deletes the per-agent branches, and `integrate()` merges
with no conflict handling. **Differential: weak.** Tailered's agent must not mutate the repository at
all (`TA docs/agent-protocol.md:3`), so what it needs is a disposable scratch directory, not a
worktree — and Spike A already built that. The genuinely good part is `git-workspace-identity.ts:70-101`,
which separates worktree identity from repository identity as
`repositoryId = sha256("git:" + realpath(commonGitDir))` and canonicalises symlinked prefixes
(`09` §10 row 4, credited as "genuinely good"). That is worth reading; it is not worth installing.

**U05 — Agent evaluation harnesses.** Ruflo ships a 26-module GAIA benchmark harness and 16
MetaHarness tools with 13 skills (`03` §4). `UNKNOWN:` neither was executed — `metaharness score`
was never run, so neither its determinism across two identical runs nor its documented degraded path
was observed (`04` CLAIM-048). This repository evaluates *runs* (`TA evals/ledger.jsonl`, one
terminal row per run, plus `TA benchmarks/todo-auth.json` as a harder non-gating spec). **Differential:
one idea, unproven.** Grading a *harness* before shipping it is a category this repository does not
have — Tailered grades outcomes, never the apparatus that produced them. The idea survives; the
implementation has no evidence behind it and requires the full install to test.

**U06 — Acceptance-test generation.** `VERIFIED:` there are **zero reachable test-generation tools**.
The live 333-tool roster contains no `testgen` prefix at all; `testgen_tdd_repair` is exported from
`T dist/src/mcp-tools/index.js:31` and is one of exactly five packaged-but-never-registered tools;
and the `ruflo-testgen` plugin is among the 37 plugin directories deleted at publish, so it is in
neither tarball (`04` CLAIM-046/047, `06`). **Differential: none, and the baseline is better.**
Tailered already treats `testgen` as a routed, metered, traced task kind returning structured
`{command,args,cwd}` executed without a shell (`TA docs/agent-protocol.md:60-74`, `TA
src/ship.ts:531-555`) — a narrower and safer contract than "generate test files".

**U07 — Constitutional critique.** **Differential: negative, and this is the sharpest single result
for this lane.** `VERIFIED:` a pristine Tailered context snapshot admits 23 files including
`AGENTS.md`, all four ADRs, and `v1-contract.md`; after `ruflo init` the same snapshot admits 96
files, 93 of them under `.claude/`, and **zero Tailered governing files**, because `listFiles` walks
in sorted order (`TA src/files.ts:187`) and `.agents`, `.claude`, `.swarm` precede `AGENTS.md`,
`decisions/`, and `docs/`, exhausting the 512,000-byte budget at `TA src/files.ts:141,156-161`
(RUF-203, `05` §; `14` §). `validate` still reports `VERIFIED` in that state, because
`validateCompany` checks presence and consistency, never context composition (`TA
src/validate.ts:49-158`). The constitutional critique step would run without the constitution and
report no violations. A component that silently removes the input to the platform's only quality
gate is worse than no component.

**U08 — Model and provider routing verification.** This repository has a real gap: `AgentResponse`
carries no model or provider field (`TA src/contracts.ts:218-221`), so `AgentCallTrace.model` records
the alias Tailered *asked for* (`TA src/ship.ts:157`), not what answered — RUF-712. Ruflo shows both
halves of the problem. `VERIFIED:` its API path returns the server-reported model
(`T …/agent-execute-core.js:150`) and records the retry winner (`:454`); its `claude --print` path
parses result, tokens, cost, and duration and **no model identifier** (`T
…/headless-worker-executor.js:362-372`); provider is never a returned field on either path. And
`VERIFIED:` `determineAgentModel` honours an explicit model only when it matches one of five
hardcoded literals and otherwise routes silently by its own bandit (`T
…/agent-tools.js:127-131`), while `agent_execute` has no `model` input at all (`:369-379`).
**Differential: the field, not the component.** Spike A's adapter already returns
`provenance.model_actual` and `provider_actual` and demonstrated the honest answer for a non-model
invocation (`UNKNOWN(requested=mid-available)`). Installing Ruflo would make the guarantee at `TA
AGENTS.md:29` false; adding the field makes it checkable.

**U09 — Token and cost accounting.** **Differential: none, and it would be a regression.**
`VERIFIED:` Ruflo has no reservation step anywhere; `estimatedCost` is one of five hardcoded branch
constants that do not depend on prompt, context, or model (RUF-734); prices come from a
hand-maintained table with an explicit no-auto-sync note and a `$1/Mtok` fallback for unknown ids
that is 1/75th of the opus output price in the same table (RUF-735); cost is floating-point USD end
to end against Tailered's integer micros (RUF-733); and `policy budget` never meters — `usage` stays
`[]` in every reachable mode, with enforce returning `default-deny` for $1 and $1000 alike and
legacy allowing everything (RUF-730). Against that, `TA src/budget.ts:42-64` denies before spending
and `TA src/money.ts` keeps arithmetic in integers. The genuine Tailered gap here is different and
Ruflo does not fill it: `usage` is agent-asserted and cross-checked by nothing (RUF-714), so a lying
agent controls the ledger.

**U10 — Agent-session observability.** The strongest genuine differential, and the audit's own
designated first thing to test (`00` §"first capability"). `VERIFIED:` a metrics database and real
telemetry exist (`15` row 16, ADAPT — "best genuine candidate"). `VERIFIED:` it cannot be the
ledger: of the 20 fields across `RouteLog`, `AgentCallTrace`, and `ContextTelemetry`, two map
cleanly, six need Tailered-side normalisation, two exist only on a credentialed call, and **ten have
no Ruflo source at all** — including `run_id`, `call_id`, every `ContextTelemetry` field,
`projection`, and `caused_by` (`13-bcde` Spike C). `VERIFIED:` `swarm status <nonexistent>` returns
exit 0 with `status: running`, a hardcoded `progress: 5`, an objective borrowed from a different
swarm, and a task count wrong by five (RUF-720). **Differential: per-session aggregation.** Tailered
records per-call rows and renders them (`TA src/dashboard.ts:5`); it has no session-level view and no
place to put one — which `.tailered/` (`TA src/context.ts:48`) exists to hold.

**U11 — Deployment packaging.** Ruflo's packaging surfaces are the RVFA appliance (7 modules with
`rvfa-signing.js`) and a transfer/IPFS export path (21 modules, 11 `transfer_*` tools) targeting
Pinata, web3.storage, and GCS (`03` §4). `@claude-flow/deployment` reaches neither tarball (`06`).
`UNKNOWN:` none of it was executed. **Differential: negative.** `VERIFIED:` the content-addressed
distribution model this rests on fails open — with all five IPFS gateways sinkholed,
`ruflo plugins list` printed `Registry discovered: 21 plugins available`, 20 rows all marked
`Trust: Official`, and a "Registry CID" minted by `crypto.randomBytes(16)`, exit 0, while stderr
logged five gateway failures (RUF-300); the catalog's checksums are placeholder strings like
`sha256:abc123neural` (RUF-319). Pushing a company's deployable artifact into third-party pinning
services also contradicts the accepted consequence that plain repository files are the sole company
state (`TA decisions/ADR-000.md:19`).

**U12 — Deployment manifests and environment contracts.** **Differential: negative.** `VERIFIED:`
`catalog-manifest.json` ships inside a tarball whose contents it does not describe (164 agents
claimed, 90 packaged) because its generator counts from the repository root and the manifest is
published into the package (`03` §3.1); `.claude/helpers/helpers.manifest.json` carries three
inconsistent version strings and a signature not reproducible from the tag (`06`); the generated
`.mcp.json` registers `npx -y ruflo@latest` — a mutable tag — and survives `cleanup` (RUF-212);
`@claude-flow/cli` declares no `engines` field and neither manifest declares `os`, `cpu`, or `libc`
(RUF-L1a-06, `06`); and `stage-internal-runtime-bundles.mjs:132-135` deletes `dependencies`,
`optionalDependencies`, and `peerDependencies` from the bundled packages, relocating them to a
`rufloBundledRuntime` key no package manager reads. The real Tailered gap — `ProcessAgentConfig`
(`TA src/contracts.ts:244-255`) declares command, args, timeout, and projections but **no
environment allowlist**, so the child inherits every secret in the parent (RUF-713) — is untouched by
any of this.

**U13 — Staged agent rollout.** Ruflo has no rollout staging. The nearest surface is `autopilot`,
and `VERIFIED:` it executes nothing — it is a stop-hook gate that re-engages the agent and keeps no
effect ledger, and it fails open: a malformed task source produced `ALLOW STOP: No tasks discovered
from any source` with exit 0 and `autopilot status` reporting `Tasks: 0/0 (100%)`, byte-identical to
genuine completion (`04` CLAIM-015). **Differential: none.** Earned autonomy is already this
repository's own v2 subsystem with a stated entry gate (`TA docs/full-system-blueprint.md:74-75`,
`TA docs/blueprint-execution.md:38`).

**U14 — Canary and rollback controls.** **Differential: negative, and it degrades an existing
guarantee.** Rollback in this platform is `git revert` over plain files
(`TA docs/full-system-blueprint.md:30`; `TA README.md:89`). `VERIFIED:` Ruflo's own uninstaller
reverts 56 of 258 changes (21.7%), leaving 204 files, 57 directories, a 1,589,248-byte `ruvector.db`
in the repository root, `CLAUDE.md`, the `.gitignore` edit, and a block in `~/.claude/CLAUDE.md`
(RUF-205); `VERIFIED:` even the documented **dry run** creates four files, modifies two, and starts a
background daemon it never stops (RUF-202). A component whose own removal is 21.7% complete cannot
be part of a rollback story.

**U15 — Agent health checks.** `VERIFIED:` Ruflo's daemon layer carries real liveness and expiry —
`process.kill(pid,0)` paired with a 15-minute workspace lease, a 3-minute supervisor stale window, a
30-minute budget window, and a 12-hour daemon TTL (`09` §10 row 6) — and daemon single-instance
locking is correctly implemented with an `O_EXCL` lock held across the whole spawn lifecycle plus
stale reclamation, empirically effective at five concurrent starts yielding one survivor (RUF-454,
recorded as a positive). `VERIFIED:` it fails across PID namespaces — two live daemons on one shared
repository, pidfile matching neither (RUF-444) — and `ruflo status --format json` aborts (RUF-725)
with a p95 of 18.5 s. **Differential: a pattern, not a component.** Tailered has no health concept
because a run is one process; the lease-plus-liveness shape becomes relevant only when the v2 durable
loop runtime exists.

**U16 — Runtime cancellation and lease expiration.** This is where the frozen baseline is genuinely
broken and Ruflo genuinely knows better. `VERIFIED:` `TA src/agent.ts:63-67` spawns without
`detached`, so no process group exists, and `TA src/agent.ts:76-79` kills only the direct child with
`SIGTERM` and never escalates. Spike A measured both consequences: a detached worker emitted 11
heartbeats after the abort, the last 4,803 ms after rejection, reparented to init (`ORPHAN-1`); and
worse, a child that exited cleanly while a grandchild held fd 1 made `invoke()` return **`ok: true`
after 45,338 ms under a 4,000 ms timeout**, because Node removes the abort listener on `exit` and
`ProcessAgent` resolves only on `close` (`ORPHAN-2`, mechanism isolated in
`S/results/abort-mechanism.json`). Ruflo's code states the problem and fixes it: `claude --print`
is spawned `detached` *precisely* so the whole tree can be signalled, with the comment explaining
that grandchildren otherwise get reparented to init, and the kill is
`process.kill(-child.pid, sig)` (`T …/headless-worker-executor.js:1035-1041,1065-1077`). Spike A
proved the fix in Tailered's own seam: through `spawnSandboxed`, cancellation landed at 2,601 ms with
zero heartbeats after the deadline and `reaped process group 50 with SIGKILL` surfaced verbatim
(`ORPHAN-3`). `VERIFIED:` Ruflo's *claim* expiry is dead code — `expireStale()` has zero callers and
`expiresAt` is never assigned (RUF-442), so the lease half of this row is real only for daemons.
**Differential: high as a pattern, negative as an installed component** — installing Ruflo is what
makes the descendant-tree problem acute in the first place.

**U17 — Append-only execution traces.** **Differential: none, and the polarity is inverted.**
Tailered writes one immutable trace per executed call with enforced uniqueness and causal edges
(`TA src/ledger.ts:59-66,82-103`; `TA src/validate.ts:129-144,231-297`). `VERIFIED:` Ruflo has no
run concept, no per-call record type, and no causal-link field anywhere (`13-bcde` Spike C,
RUF-722); its memory is mutable SQLite with `UPDATE`/`DELETE`/purge, and `memory delete` reports
`[OK] Deleted` while a direct SQLite read shows the row, its content, its embedding, and its
provenance all still present with `status: "deleted"` (RUF-744).

**U18 — Removable subordinate memory.** **Differential: none. Do not pilot this first.** `VERIFIED:`
on the audited platform five of twelve identical `memory retrieve` calls aborted with SIGABRT in
`better-sqlite3`'s `Statement` destructor, and the same abort was observed in `store` (losing the
write silently), `delete`, `search`, `list`, and `export` (RUF-741); the sql.js fallback accepts a
write, prints `[OK] Data stored successfully`, exits 0, and leaves the database byte-identical with
the value absent, while `verifyMemoryInit` reports `6/6 tests passed` in exactly that state
(RUF-401/402). `VERIFIED:` of the nine metadata fields a Tailered-controlled cache entry would need,
only `created_at` and `expires_at` have a native home; `owner_id` is declared, indexed, and never
written; `provenance_type` is always `'unknown'` (RUF-446); and `memory retrieve` drops
`provenanceType`, `expires_at`, and `status` from the read path, so a `user_claim` and a
`system_observation` are byte-identical on retrieval (RUF-740/742). The MemPoison gate is opt-in and
its 16-substring denylist misses `ignore all previous instructions` (RUF-743).

**U19 — Reusable engineering-pattern storage.** `VERIFIED:` the schema is there and empty — the
database ships 47 tables including `provenance_sources`, `recall_certificates`, and
`justification_paths`, and a direct read shows every one of them empty (`13-bcde` Spike E).
`UNKNOWN:` whether `memory distill`/`consolidate` preserve provenance when mining entries into
patterns — the audit names this its highest-risk unknown, because distillation is where a
`user_claim` could be laundered into a pattern carrying no provenance at all. **Differential: a
vocabulary.** The pattern-corpus idea is already this repository's own v3–v4 subsystem, explicitly
gated on corpus thresholds (`TA docs/full-system-blueprint.md:151-152`,
`TA docs/blueprint-execution.md:39-40`).

**U20 — Security review and prompt-injection resistance.** `VERIFIED:` the advertised defence is
unreachable — `@claude-flow/aidefence` is dynamically imported by shipped code at five sites
including `T dist/src/mcp-tools/security-tools.js:464`, is declared in no dependency field, and is
not bundled (`06`, `07` §). The lane's conclusion is quoted exactly: *"No claim about
prompt-injection defence in Ruflo-as-shipped can be supported."* A controlled test of the secret
scanner found 0 findings on a blatant injection fixture. Credited: real input validation, a
loader-hijack denylist, `SafeExecutor` allowlists, and command injection via agent/task names
verified **not** exploitable (RUF-322). **Differential: none, and the surface cost is large** — 785
packages, 42 hand-maintained overrides, 41 advisories including one critical RCE, and a
`postinstall` that walks up to twelve parent directories mutating every reachable `agentdb`
(RUF-L1a-07, `16` §5).

**U21 — CI qualification for agent releases.** This repository's CI qualifies the whole product in
five steps with no runtime dependencies (`TA .github/workflows/ci.yml:20-24`). **Differential:
negative as a model.** `VERIFIED:` Ruflo's `CHANGELOG.md` has no entry for 3.35.0, 3.36.0, or
3.37.0 — including the release titled "proxy install hardening" (RUF-317); `SECURITY.md`'s
supported-versions table names `3.5.x` and does not cover the shipping release (`04` CLAIM-064);
`dist` is git-ignored and `src/` is not shipped, so **a registry user cannot audit what they run**
(`06`); and publish deletes 549 of 599 plugin files. The one transferable idea is pre-ship grading
of the harness itself (U05), which has no execution evidence.

**U22 — Release provenance and artifact verification.** `VERIFIED:` `ruflo verify` prints
`pass: 0, drift: 53, missing: 2` and then `[OK] All fixes verified`, exiting 0, because `allOk` at
`verify.js:201` excludes drift and missing by construction; its Ed25519 seed is
`sha256(gitCommit + ':ruflo-witness/v1')`, both inputs public, so the signing key is derivable by
anyone; and the manifest is fetched at runtime from the mutable branch `fix/issues-may-1-3`
(RUF-011/012, RUF-L1a-02). **But the same product contains the correct pattern:**
`VERIFIED:` `dist/src/proxy/{release,verify,install}.js` pins an Ed25519 **public** key in the dist
and verifies the downloaded artifact's signature against it, and the audit records that this one
holds (`07` §). **Differential: a contrast worth keeping.** This repository has no artifact
verification at all — `ProcessAgentConfig.command` is a filesystem path with no integrity check
(`TA src/contracts.ts:245`), which is the natural place for the pinned-public-key, fail-closed shape
and the natural place to refuse the `verify` shape.

**U23 — Long-running bounded repair loops.** Tailered's repair loop is bounded and complete but
**not resumable**: `taileredShip` holds attempts, passed checks, and budget in process memory
(`TA src/ship.ts:105-114`) and a crash between the gate and the terminal write leaves no resumption
point. `VERIFIED:` autopilot's *checkpoint layer* is durable and is credited — across three separate
processes the iteration counter advanced 1 → 2 → 3 with `writeFileAtomic`, and terminal states
(`Max iterations (4) reached`, `Autopilot disabled`) are reachable (`04` CLAIM-015). `VERIFIED:` the
loop around it executes nothing and fails open (U13). **Differential: the checkpoint, not the loop.**
Durable loop runtime is a v2 subsystem here (`TA docs/full-system-blueprint.md:57-58`), and capture
before exploitation is the stated policy (`TA docs/blueprint-execution.md:42`).

**U24 — Agent fleet governance from repository state.** **Differential: strictly negative.** This
platform's thesis is that current state is a pure render of repository state and never a parallel
database (`TA docs/platform-brief.md:46`; `TA decisions/ADR-000.md:19`). `VERIFIED:` Ruflo satisfies
one of the six identity requirements a fleet needs — worktree identity — with four partial and
ownership broken (`09` §10); it writes 32 repository-local state paths plus 14 SQLite tables; and its
policy-trust anchor lives in `$HOME` keyed by a SHA-256 of the project's **absolute path**, so a
second checkout mounted at the same path fails permanently with
`policy-state-authentication-failed`, with no self-repair and no recovery command (RUF-731). A
governance layer whose verification key is not in the repository cannot be repository-state
governance.

## 4. Differential analysis — where Ruflo genuinely adds something

Six items survive the differential test. Two are patterns to copy, three are contracts or data
shapes to define, and one is content. **None of the six requires installing Ruflo**, and the audit's
recommended integration boundary at this version is none (`00` §"Recommended Ruflo integration
boundary").

### 4.1 Process-group cancellation with an independent deadline (highest value)

Ruflo spawns `detached` and kills with `process.kill(-child.pid, sig)` *because* its own comment
records that `claude --print` spawns grandchildren that survive a parent-PID signal
(`T …/headless-worker-executor.js:1035-1041,1065-1077`). `TA src/agent.ts:63-67,76-79` has neither
mechanism, and `ORPHAN-2` measured the exact failure the mechanism prevents: 45,338 ms under a
4,000 ms timeout, returning success. This is the only row in the document where the frozen baseline
is *worse* than Ruflo at something load-bearing, and the fix is a spawn option plus a caller-owned
timer — no dependency, no new file, one new test.

### 4.2 Provenance on the response, projection on the request

Two field-level contract changes, both already prototyped in Spike A's adapter and both closing
findings that exist today: `AgentResponse` gains `model_actual` / `provider_actual` (RUF-712, making
`TA AGENTS.md:29` checkable at the boundary rather than assumed), and `AgentRequest` gains the
`projection` (RUF-711, so the agent is told the ceiling it will be measured against instead of
having overspend detected afterwards). Ruflo's contribution here is negative evidence used
constructively: it is the concrete example of an agent that silently substitutes a model, so the
field is not hypothetical.

### 4.3 Per-session observability as an enrichment stream that is never the ledger

The audit's designated first capability to test. The differential against this repository is
specifically **session-level aggregation**: Tailered's per-call rows are complete but there is no
view above them, and the dashboard renders ledgers rather than sessions. The hard constraint from
Spike C is that ten of twenty ledger fields have no Ruflo source and one status surface fabricates
state, so this can only ever be an enrichment file — and `.tailered/` is the one location that is
both outside the validator's required set and already excluded from the context snapshot
(`TA src/context.ts:48`).

### 4.4 The agent, command, and skill definitions as prompt content

90 agent definitions, 167 slash commands, and 33 loadable skills as plain Markdown against a
nine-line roster. This is the only row that scores 4 on both value and fit, because it needs no
runtime, creates no coupling, and can be read from the extraction path without installing anything.
The licence question in §3.1 must be answered before any of it is copied into this repository.

### 4.5 A durable iteration checkpoint, and the pinned-public-key verification shape

Two smaller ones. Autopilot's checkpoint layer is credited durable across three processes with
atomic writes — the shape a resumable v2 loop runtime would need, capturable now under the
capture-first policy. And the proxy install path's pinned Ed25519 *public* key with fail-closed
verification is the correct counterpart to `ruflo verify`'s publicly-derivable seed; it is the shape
to use if a process-agent binary is ever pinned by integrity rather than by path.

### 4.6 What the differential test rejected, and why that matters

Several capabilities that would look like wins in a feature comparison fail here purely because this
repository already has them: reserve-and-settle spend control, append-only causal traces, a
stateless router with a single model registry, bounded repair with attempt limits, acceptance tests
as executable data, constitutional critique, a labelled human gate, and format validation. A
per-agent-session cost ledger, for instance, is a real gap in some systems; in **this** repository
`ReserveSettleBudget` plus `RouteLog` plus `EvalRow` already carry cost per call, per tier, and per
run, so it is not a reason to adopt anything.

The audit also surfaced four `CRITICAL` defects in this repository that are **not Ruflo's** and are
worth more than any Ruflo capability on this list: `product/` confinement is a textual prefix test,
so `product/../decisions/ADR-000.md` passes `TA src/ship.ts:559`, resolves inside the root, and
`writeAtomic`'s `rename` overwrites an accepted, immutable ADR (RUF-710, executed as `G1`);
`ProcessAgent` passes no `cwd` and no `env` (RUF-713, `H1` mutated the repo and enumerated a secret
env name); `AbortSignal.timeout` is disarmed by a descendant holding stdout (RUF-715); and `usage`
is agent-asserted and cross-checked by nothing (RUF-714). Fixing these is prerequisite to any
external-agent pilot, because three of the four are the mechanism by which a third-party agent would
do damage.

## 5. Deployment-specific analysis

**Scope label, applied throughout this section.** `TA docs/blueprint-execution.md:32` is explicit:
*"Deploy is the only irreversible action implemented in v1, so it is the only live human gate."* The
executable deployment in this repository is `deployLocalPreview`, which asserts
`product/index.html` exists and returns its `file://` URL (`TA src/ship.ts:571-578`). Everything
below except the gate itself is therefore **FUTURE SCOPE**, and none of it may be built ahead of the
data gate that authorises it (`TA docs/blueprint-execution.md:9,36-42`).

| Deployment requirement | Status in this repository | Does Ruflo help or hinder? |
| --- | --- | --- |
| Immutable commit identity for a deployable | **ABSENT (future scope).** No runtime code reads git; `.git` is only a hash exclusion (`TA src/files.ts:14`). Identity today is a working-tree content hash (`TA src/files.ts:93-112`). | **Hinders.** Ruflo's repo-local writes move that hash for reasons unrelated to the run (RUF-L6a-09), and its own verification binds to a mutable branch (RUF-011). |
| Deployment manifest | **ABSENT (future scope).** `tailered.config.json` carries model aliases and bounds only. | **Hinders.** Its shipped manifests describe trees they do not contain and reference `npx -y ruflo@latest` (§3.1 U12). |
| Environment contract for the agent/worker | **PARTIAL, and defective.** `ProcessAgentConfig` declares command, args, timeout, projections (`TA src/contracts.ts:244-255`); the spawn passes no `env`, so everything leaks in (RUF-713). | **Neutral to hindering.** Ruflo reads `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, and `OLLAMA_API_KEY` directly from that inherited environment (`11` BLOCKER-5). |
| Staged rollout | **ABSENT (future scope).** Curriculum Controller is v2, data-gated (`TA docs/full-system-blueprint.md:74-75`). | **No help.** Autopilot stages nothing and reports 100% on an empty malformed queue. |
| Canary | **ABSENT (future scope).** | **No help.** No canary surface exists in the packaged product. |
| Rollback | **PRESENT, by design.** Plain files plus `git revert` (`TA docs/full-system-blueprint.md:30`), with ADR immutability preserving history (`TA src/company.ts:138-151`). | **Hinders.** 204 files, 57 directories, and a 1.5 MB binary survive Ruflo's own uninstaller (RUF-205); a 12-hour daemon survives it too (RUF-202). |
| Health check | **ABSENT (future scope).** A run is one process; liveness is the child's exit. | **Pattern only.** Lease TTL + `process.kill(pid,0)` is real and effective within a PID namespace and fails across namespaces (RUF-444). |
| Lease expiry | **ABSENT (future scope).** No leases, because nothing is long-lived. | **Split.** Daemon leases are real (15 min); claim expiry is dead code with zero callers (RUF-442). Copy the daemon shape, never the claim shape. |
| Fleet governance from repository state | **PRESENT as the platform thesis.** Dashboard is a pure render; the repo is the sole state (`TA docs/platform-brief.md:46`; `TA decisions/ADR-000.md:19`). | **Hinders, structurally.** 32 repo-local state paths plus 14 SQLite tables plus a `$HOME` trust anchor keyed by absolute path (RUF-731). |

Three deployment-specific conclusions:

1. `INFERRED:` **the deploy gate itself is the one part Ruflo does not threaten.** Nothing in the
   packaged product deploys a Tailered preview, and the gate, its label capture, and the terminal
   eval are all Tailered-side (`11` Q19 = YES). The threat surface is determinism, not governance.
2. `VERIFIED:` **Ruflo packages `gh pr merge` and `gh pr close`** (`T dist/src/mcp-tools/github-tools.js:322,338`).
   Any future deployment automation must never expose those tools to an agent seat.
3. `VERIFIED:` **a single Ruflo command in a CI job leaves a 12-hour background process behind**
   (RUF-453), and `ruflo memory store`/`search` start it silently. That alone disqualifies Ruflo from
   any unattended deployment path before the other findings are considered.

## 6. Ranked shortlist — at most five things worth piloting

Ranked by value per unit of risk. Every pilot is runnable inside this repository alone, needs no
network, no credentials, and no Ruflo install, and each one ends in a check that can fail.

**P1 — Bound the agent call and kill the process group.** *(from §4.1; closes RUF-715, RUF-716)*
Smallest safe pilot: in `TA src/agent.ts:56-103`, spawn with `detached: true`, record the child's
pgid, race the child promise against a `setTimeout` the caller owns rather than relying on
`AbortSignal` surviving `exit`, and on expiry send `SIGTERM` to `-pgid` followed by `SIGKILL` after a
short grace. Acceptance: a new test that reproduces `ORPHAN-2` — a fixture whose child exits
immediately while a grandchild holds fd 1 — must fail before the change and pass after, and the
existing 18 tests plus `npm run validate` and `npm run demo` must stay green. No new dependency, no
new file outside `test/`.

**P2 — Make model identity and the ceiling checkable at the boundary.** *(from §4.2; closes RUF-712,
RUF-711)* Add `model_actual` and `provider_actual` to `AgentResponse` and `projection` to
`AgentRequest` (`TA src/contracts.ts:202-221`), thread them through `recordCall`
(`TA src/ship.ts:143-199`) into `AgentCallTrace`, and extend `validateRouteArtifacts`
(`TA src/validate.ts:275-290`) to cross-check the reported model. Acceptance: extend
`TA test/ship.test.ts:142-171` so it asserts on the model the agent *reports having used*, not only
on the request it received — the test that today would pass while the guarantee it encodes was
false.

**P3 — Read the prompt assets; extract nothing.** *(from §4.4)* Read the 90 agent definitions, 167
slash commands, and 33 skills from `T .claude/**` in the pinned extraction path. Produce a short
written assessment of which role contracts are worth expressing in `TA seats/roster.yaml` terms.
Hard rules for the pilot: never run `ruflo init`; copy no file into this repository until the licence
question is settled, because neither tarball ships a LICENSE file; and treat every line of that
Markdown as untrusted text that must never enter a critique prompt unreviewed.

**P4 — Define the session-observability envelope before any producer exists.** *(from §4.3)* Write
the schema for a per-run enrichment record under `.tailered/observability/<run-id>.json` — the
directory that `TA src/context.ts:48` already excludes from the model's context and that
`validateCompany` does not require. Populate it from Tailered's own `RouteLog` rows first, so the
shape is proven with data the platform already trusts. Acceptance: `npm run validate` unchanged, the
context snapshot byte count unchanged, and a written statement that these records are never a ledger
and are never read back into a decision. Hard rule from `11` §(d): nothing may ever be written under
`evals/`, `labels/`, or `decisions/` by anything but the ship loop.

**P5 — Capture a durable ship-loop checkpoint, without resume.** *(from §4.5)* After each stage of
`taileredShip`, atomically write the stage name, attempt counts, and passed-check set to
`.tailered/checkpoints/<run-id>.json`. Write only — no resume logic, which is v2 scope
(`TA docs/full-system-blueprint.md:57-58`). Acceptance: terminal `EvalRow` semantics are byte-identical
before and after, all 18 tests pass, and a killed run leaves a checkpoint that a human can read.

Anything not on this list is not recommended at this version.

## 7. Explicitly excluded, with reasons

| Excluded | Reason |
| --- | --- |
| Installing `ruflo` or `@claude-flow/cli` into this repository in any form | The audit verdict is `NOT_QUALIFIED` and the recommended integration boundary at this version is none (`00`, `16`). This repository has zero runtime dependencies (`TA package.json:26-29`); the default install is 534 s / 1.50 GiB / 50,012 files with 785 packages and 41 advisories. |
| `ruflo init` against any Tailered company repository | It evicts 100% of the governing files from the context snapshot (RUF-203), writes 309 paths on a call that crashed with SIGABRT (`CWD-4`), edits the root `.gitignore`, and appends to `~/.claude/CLAUDE.md`. `mintCompany` also requires an empty target (`TA src/company.ts:352-360`), so an initialised directory can never afterwards be minted. |
| The background daemon and every worker | Autostarts on unrelated commands and runs model-calling workers for up to 12 hours outside any reservation (`11` BLOCKER-5); one env var arms nine timed workers (RUF-739). Irreconcilable with `TA AGENTS.md:20`. |
| Memory / AgentDB / vector retrieval / cross-session memory | ~40% SIGABRT with silent write loss (RUF-741); `[OK] Data stored successfully` with the value absent while the self-test reports 6/6 (RUF-401/402); `delete` is a tombstone (RUF-744); provenance dropped on the read path (RUF-740). |
| Ruflo's model router and any proxy tier routing | A stateful Thompson-bandit router directly contradicts `TA AGENTS.md:28`, and the five-literal model allowlist contradicts `TA AGENTS.md:29` (`11` BLOCKER-3/4). |
| `swarm`, `hive-mind`, `autopilot` execution | Executes nothing, fabricates status, and mutates the repository on `--help` (RUF-701/702/720). |
| `ruflo verify` as evidence of anything | Reports `[OK]` with 53 drift and 2 missing and exits 0; the signing seed is publicly derivable; the manifest comes from a mutable branch (RUF-011/012). |
| `ruflo cleanup` as an uninstaller | Reverts 21.7%; the dry run starts a daemon it never stops (RUF-202/205). Manual deletion of the enumerated set is the only removal that works. |
| Appliance / IPFS / transfer packaging | Untested here, and the distribution model fails open to a fabricated catalog with a random CID (RUF-300/319). Also contradicts `TA decisions/ADR-000.md:19`. |
| Ruflo's GitHub tools | They package `gh pr merge` and `gh pr close`; no agent seat in this repository may hold that authority (`11` Q19). |
| MCP server registration, and `.mcp.json` as generated | Starting the MCP server alone writes a 1.5 MB `ruvector.db` into the repository root with no `init`, and the generated registration is `npx -y ruflo@latest` — a mutable tag (RUF-212). |
| The policy runtime and its trust anchor | Keyed by absolute path in `$HOME`; bricks a second checkout at the same path and makes the receipt ledger unverifiable off-machine (RUF-731). |
| Browser tools | 23 of 356 tools register only when an undeclared external binary answers within 3 s, so `tools/list` silently differs between machines (RUF-L1a-08). |
| The `ruvocal` payload in the `ruflo` tarball | 499 of 526 files are an Apache-2.0 chat-ui fork the entry point never references, shipping under an MIT declaration with no LICENSE file (RUF-L1a-05, RUF-301/302). |
| Any comparison to, or inference from, another first-party repository | `OUT_OF_SCOPE_REPOSITORY` per this lane's charter. |

## 8. What this lane could not determine

- **Anything requiring a paid model call.** No credentials existed in any audit container. Every
  statement about output quality, routing behaviour under real providers, or the cost of a real
  Tailered run through any Ruflo path is `UNKNOWN`.
- **Whether the MetaHarness readiness scorecard (U05) works.** `metaharness score` was never run.
  The idea is credited; the implementation has no evidence.
- **Whether Ruflo's distillation preserves provenance (U19).** The source tables were empty and
  distillation needs a populated corpus. This is the highest-risk unknown behind that row.
- **Whether the 90 agent definitions are actually MIT-licensed.** Both tarballs declare MIT and
  neither ships a LICENSE file. `INFERRED` only.
- **Whether Ruflo can be redirected away from the repository root** via `getProjectCwd()`, which
  lives in a package not bundled in the tarball (`11` §"could not determine"). If it can, BLOCKER-1
  softens; that does not change any recommendation in this document, because §4's six differentials
  all avoid installing Ruflo anyway.
