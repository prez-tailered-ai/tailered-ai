<!-- audit: {"audit_id":"AUD-RUFLO-20260811-221322","tailered_sha":"6172653e0aca0981d0abaf4ad8e9d587667737e9","ruflo_release":"v3.37.0","ruflo_sha":"6ce18b5a7fcd4939a2f72c2e3b8fdbdec660e5a9","generated":"2026-08-12T00:45:00Z","evidence_class":"MIXED","lane":"AUD-L0","caused_by":["AUD-RUFLO-20260811-221322/01-audit-charter.md","AUD-RUFLO-20260811-221322/11-tailered-compatibility.md","AUD-RUFLO-20260811-221322/08-reliability-and-data-integrity.md"]} -->

# 15 — Adoption scorecard

## Method

Scored 0–100 per dimension against the master specification's weights. A dimension is scored on what
the audit **observed under execution**, not on what is implemented or advertised. Where lanes found
something working correctly, it is credited explicitly — a scorecard that records only failures is
not an audit, and Ruflo does contain real engineering.

The specification's decision bands: `ADOPT` ≥ 85 with no blocker; `ADAPT` 70–84 with no blocker;
`STUDY` 50–69; `REJECT` below 50 **or** a fundamental authority conflict; `BLOCKED` where required
evidence was inaccessible. The specification also directs that a critical subsystem failure must not
be averaged away, so the per-capability decisions in section 3 govern any adoption action — the
aggregate is a summary, not the operative verdict.

## 1. Aggregate score

| Dimension | Weight | Score | Weighted | Basis |
| --- | ---: | ---: | ---: | --- |
| Functional truth | 15 | 8 | 1.20 | Six independently reproduced false success claims, including in the verification tool itself (RUF-011), the persistence layer (RUF-401/402), concurrency (RUF-440), and `init`'s own file counts (RUF-002). |
| Tailered architecture fit | 15 | 10 | 1.50 | Five of the nine blocking compatibility questions answer NO (Q5, Q7, Q8, Q11, Q12). Ruflo ships a *stateful* router where Tailered law requires a stateless one, and cannot honour a caller-supplied model identity. |
| Reliability and data integrity | 15 | 5 | 0.75 | Memory writes are silently discarded on a reachable fallback path while reporting success; a corrupt database is used silently; `memory store` aborts with SIGABRT roughly 1 in 6 with no contention; no corruption detection or repair exists. |
| Security and privacy | 15 | 15 | 2.25 | Witness signing key is derivable from public data; trust anchor is a mutable branch; a 90 MB model is fetched at runtime unpinned; global `~/.claude/CLAUDE.md` is written without a flag; the generated MCP registration uses `npx -y ruflo@latest`. Credited: real input validation, a loader-hijack denylist, `SafeExecutor` allowlists, and correct O_EXCL daemon locking. |
| Evidence and observability | 10 | 20 | 2.00 | Telemetry and a metrics database exist and are genuinely useful raw material, but provider failures are returned as *successful* tool results and errors are swallowed at six or more sites, so the emitted evidence cannot be trusted without external corroboration. |
| Concurrency and isolation | 8 | 12 | 0.96 | Two agents can hold "exclusive" ownership of one issue (reproduced 3/3); claims never expire; daemon mutual exclusion is PID-based and fails across PID namespaces; advertised worktree isolation is unreachable from the `ruflo` binary. Credited: daemon single-instance dedup is correctly implemented and empirically effective within a namespace. |
| Performance and cost | 7 | 20 | 1.40 | Default install is 534 s / 1.5 GB / 50,012 files. `ruflo status` p95 is 18.5 s against the vendor's own published "CLI startup < 500 ms" target. Ruflo's own measured `$1.56`/call from a project directory means four calls exceed Tailered's exclusive $5.00 cap. |
| Maintainability and portability | 5 | 20 | 1.00 | 785 packages, 42 hand-maintained overrides, alpha-versioned dependencies in the critical path, no `engines` field on the package that actually runs, and glibc/musl behavioural divergence with no error. |
| Supply chain and licensing | 5 | 10 | 0.50 | The published `ruflo` package declares MIT while 94.87% of its files are an Apache-2.0 huggingface/chat-ui fork; LGPL-3.0 native binaries appear transitively; `postinstall` mutates sibling packages up to 12 directories up. |
| Tailered agent-platform and deployment leverage | 5 | 40 | 2.00 | The one dimension with real positive signal. 90 agent definitions and 167 slash commands ship as plain MIT-licensed Markdown and are reusable as prompt assets independent of the runtime; the MCP tool surface and the readiness-scorecard idea are genuinely useful input. Against that: worktree isolation is unreachable, there is no deployment packaging, no canary or rollback surface, and agent fleet governance would require Ruflo's own state store — a second source of truth. See `12-agent-build-and-deployment-applications.md`. |
| **Total** | **100** | | **13.6 → 14** | |

**Aggregate decision: `REJECT` for wholesale adoption** — below 50, and independently disqualified by
a fundamental authority conflict (sections 2 and 3).

## 2. The authority conflict, stated plainly

Even at a perfect score this could not be adopted wholesale as an orchestration layer, because the
conflict is structural rather than qualitative. Tailered's constitution requires a **stateless**
router whose model identity comes only from `tailered.config.json`, a repository that only Tailered
writes, and a hard cost ceiling reserved before every model call. Ruflo ships a **stateful**
Thompson-bandit router that persists `.swarm/model-router-state.json`, accepts an explicit model only
when it matches one of five hardcoded literals (and `agent_execute` has no `model` field at all),
writes 32 repository-local state paths, and autostarts a daemon that runs model-calling workers for
up to twelve hours outside any reservation.

These are not defects to be fixed by configuration. They are a different theory of where authority
lives. Two systems cannot both own routing, repository writes, and spend.

## 3. Per-capability decisions

The specification requires a decision per capability, not one blanket verdict.

| # | Capability | Maturity reached | Decision | Reason |
| ---: | --- | --- | --- | --- |
| 1 | Core CLI | REACHABLE | **STUDY** | Works from a clean install, including with `--ignore-scripts`. Slow, but functional. |
| 2 | MCP server + tool surface | REACHABLE | **ADAPT** | 356 registered tools; the largest genuinely useful surface. Must be pinned, scoped, and never registered via `@latest`. |
| 3 | Plugin discovery/loading | PACKAGED | **REJECT** | 1 of 38 plugins ships; registry is IPFS-based. |
| 4 | Agent definitions | PACKAGED | **STUDY** | 90 agent definitions ship as prompt assets — reusable as *content* independent of the runtime. |
| 5 | Swarm coordination | UNKNOWN | **STUDY** | Not executable without model credentials; design ideas are informative. |
| 6 | Worktree isolation | PACKAGED, not REACHABLE | **REJECT** | No `worktree` command on the `ruflo` binary; worktrees are created outside the repository boundary; branches accumulate unboundedly. |
| 7 | Workflow persistence / resume | UNKNOWN | **STUDY** | Checkpointing exists in source; durability untested without credentials. |
| 8 | Autopilot / background workers | REACHABLE | **REJECT** | Autostarts on unrelated commands and spends outside any reservation; unacceptable where merge equals deploy. |
| 9 | AgentDB / memory persistence | REFUTED | **REJECT** | Silently discards writes on a reachable path while reporting success (RUF-401), and its own self-test passes in that state (RUF-402). |
| 10 | Vector retrieval / RAG / embeddings | PACKAGED | **REJECT** | Depends on the same persistence layer; `@claude-flow/embeddings` is imported by shipped code but not shipped. |
| 11 | Cross-session memory | REFUTED | **REJECT** | Same as 9. |
| 12 | Self-learning / SONA | ADVERTISED | **STUDY** | No reachable evidence; the term requires operational proof it does not have. |
| 13 | Model / provider routing | REACHABLE | **REJECT** | Directly conflicts with Tailered's stateless-router and model-registry law; the proxy cloud plane reassigns tiers per prompt (RUF-010). |
| 14 | Cost tracking | REACHABLE | **ADAPT** | Real token accounting and a metrics database; advisory only, never authoritative. Prices are a hand-maintained table with a $1/Mtok fallback. |
| 15 | Budget enforcement | REFUTED | **REJECT** | No pre-execution ceiling API exists; accounting is post-hoc; daemon spend is invisible. |
| 16 | Observability / tracing | REACHABLE | **ADAPT** | Best genuine candidate. Useful as an enrichment stream, never as the ledger. |
| 17 | Security scanning / AI defence | PACKAGED, partly unreachable | **STUDY** | `@claude-flow/aidefence` is dynamically imported by shipped code but is not shipped. |
| 18 | Prompt-injection / PII defences | PACKAGED | **STUDY** | Real code exists; effectiveness unproven here. |
| 19 | Browser automation | CONDITIONAL | **STUDY** | 23 tools register only if an undeclared `agent-browser` binary is present, so the tool list silently differs between machines. |
| 20 | Test generation | UNKNOWN | **STUDY** | Requires credentials. |
| 21 | GitHub integration | PACKAGED | **REJECT** | Packages `gh pr merge` and `gh pr close`. Tailered's only irreversible-action gate is the founder deploy gate (`policies/gates.yaml`); an agent surface that can merge or close on its own cannot be exposed to it. |
| 22 | Federation | PACKAGED | **STUDY** | No cross-machine requirement exists today. |
| 23 | MetaHarness grading | PACKAGED | **STUDY** | The readiness-scorecard idea is genuinely interesting and is the safest thing to look at first. |
| 24 | Witness verification | REFUTED | **REJECT** | Reports `[OK]` with 53 drift and 2 missing, exits 0, and its signing key is publicly derivable (RUF-011/012). |
| 25 | Install / upgrade | REACHABLE | **ADAPT** | Installs cleanly and works even with `--ignore-scripts`; a company repository still validates with Ruflo present or absent. |
| 26 | `cleanup` / uninstall | REFUTED | **REJECT** | Advertised as the uninstaller; `cleanup --force` reverts 56 of 258 changes (21.7%), leaving 204 files and 57 directories. It deletes `.claude/helpers/` while leaving `.claude/settings.json` still pointing at it, and even the **dry run** starts a background daemon it never stops. |

Counts: **ADOPT 0 · ADAPT 4 · STUDY 11 · REJECT 11**.

## 4. What Ruflo genuinely does well

Recorded so the verdict is not read as uniform condemnation. One item in an earlier draft of this
scorecard — "removability is real" — was **withdrawn** when the architecture lane measured the actual
`cleanup` residue; the corrected position is in row 26 above and in section 5.

- **Manual removal is possible, and the company survives it.** The deletion set is fully enumerable,
  and Tailered's `npm ci`, `check`, `test` (18/18), `validate`, and `demo` all exit 0 in the pristine
  repository, the Ruflo-initialised repository, **and** the post-cleanup repository. So a company
  repo does remain valid without Ruflo (Q24 = YES) — but that is achieved by deleting the paths by
  hand, not by Ruflo's own `cleanup`.
- **Re-initialisation is safe.** A second `init` refuses with "use `--force`" rather than clobbering,
  and the global `CLAUDE.md` write is append-only and idempotent — a pre-existing sentinel survived
  verbatim and global `settings.json` was byte-identical.
- **Daemon single-instance locking is correctly built** with `O_EXCL` held across the spawn
  lifecycle and stale reclamation; five concurrent starts yielded one survivor.
- **Breadth of surface is real**: 53 CLI commands, 356 registered MCP tools, and 90 agent definitions
  actually ship. The agent and command definitions are reusable as prompt assets on their own.
- **The v3.37.0 release notes disclose a previously undisclosed routing behaviour** rather than
  hiding it, and the project publishes an unusual amount of self-critical detail.
