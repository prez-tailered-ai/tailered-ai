<!-- audit: {"audit_id":"AUD-RUFLO-20260811-221322","tailered_sha":"6172653e0aca0981d0abaf4ad8e9d587667737e9","ruflo_release":"v3.37.0","ruflo_sha":"6ce18b5a7fcd4939a2f72c2e3b8fdbdec660e5a9","generated":"2026-08-12T00:30:00Z","evidence_class":"MIXED","lane":"SYNTH-S1","caused_by":["AUD-RUFLO-20260811-221322/01-audit-charter.md","AUD-RUFLO-20260811-221322/evidence/claims.jsonl"]} -->

# 04 — Claims-to-evidence matrix

## 1. Method

This lane resolves every substantial Ruflo v3.37.0 claim against what the execution lanes actually
observed. The starting point is `evidence/claims.jsonl` — 90 claims extracted from Ruflo's own
README, `SKILL.md`, `CLAUDE.md`, `AGENTS.md`, `docs/`, plugin READMEs, `SECURITY.md`, `CHANGELOG.md`
and both published `package.json` files, each carrying an exact source `file:line`, an
implementation path, a published-artifact path, an expected postcondition, and an execution probe.
Lane AUD-L1b capped every claim at PACKAGED because it installed and executed nothing; this matrix
is where those ceilings move, in either direction.

Each claim is resolved to one level of the ladder **ADVERTISED → IMPLEMENTED → PACKAGED → REACHABLE
→ EFFECTIVE → DURABLE → GOVERNABLE**, or to **REFUTED**. Four rules governed the resolution, and
they are the reason the result differs sharply from Ruflo's own reporting.

1. **Promotion above PACKAGED requires an execution lane.** Every level of REACHABLE or higher cites
   a lane artifact, and where the lane gave a `file:line` or a measured number, that number is
   reproduced here rather than paraphrased.
2. **Ruflo's own success output never promotes a claim.** `[OK]`, `success: true`, `exit 0`,
   `Verification passed (6/6 tests)` and `[OK] All fixes verified` are treated as the claim under
   test, never as evidence for it. This is not a stylistic preference: lanes AUD-L2b, AUD-L4,
   AUD-L4b and AUD-L5 each independently found a case where that output was emitted over a state it
   contradicted.
3. **A postcondition independently verified as *not met* makes the claim REFUTED**, recorded at that
   verdict rather than at whatever level it otherwise reached. Forty-two claims land here.
4. **A claim no lane could test keeps its source-level maturity and takes decision `UNKNOWN`**, with
   the blocking reason stated. Thirty-four claims land here, most of them blocked by the charter's
   prohibitions on paid model calls, real credentials, and standing up external systems.

Evidence labels are carried through from the originating lane exactly as that lane assigned them.
No label was upgraded. Where two lanes observed different things, both observations appear in the
row and the disagreement is marked **CONFLICT** — CLAIM-020, CLAIM-022, CLAIM-059 and CLAIM-087
carry one.

**Artifact shorthand used in the evidence column.** `03` = `03-ruflo-capability-inventory.md`
(AUD-L1a), `05` = `05-architecture-and-runtime-map.md` (AUD-L2b), `06` =
`06-build-package-and-ci-audit.md` (AUD-L2a), `07` = `07-security-privacy-and-supply-chain.md`
(AUD-L3b), `08` = `08-reliability-and-data-integrity.md` (AUD-L4), `09` =
`09-concurrency-and-isolation.md` (AUD-L4b), `10` = `10-performance-and-cost.md` (AUD-L5), `11` =
`11-tailered-compatibility.md` (AUD-L6a), `12` = `12-agent-build-and-deployment-applications.md` (AUD-L6b).
Bare `RUF-0xx` identifiers are the coordinator's curated findings; `RUF-2xx`/`RUF-3xx`/`RUF-4xx`/
`RUF-5xx` belong to lanes L2b/L3b/L4/L4b/L5 respectively; `RUF-L1a-*`, `RUF-L6a-*`, `RUF-L6b-*` are
lane-local. **One ID collision exists and is not resolved here:** lane AUD-L3a (license inventory)
independently numbered its findings `RUF-301`–`RUF-315`, overlapping lane AUD-L3b's
`RUF-300`–`RUF-328`. Where this matrix cites the license lane it writes `AUD-L3a RUF-3xx` in full.

**Decision vocabulary.** `ADOPT` — rely on the capability as shipped. `ADAPT` — usable only with the
named containment. `STUDY` — the design is worth reading and rebuilding in-house; the implementation
is not adoptable. `REJECT` — do not rely on it: refuted, absent, or of no differential value to
either host. `UNKNOWN` — undecidable on the evidence gathered.

**Coverage gap, stated explicitly.** The spike lane artifacts `13-integration-spikes.md` and
`13-integration-spikes-bcde.md` are **absent** from the audit directory at synthesis time; only the
empty scaffold directories `spikes/{cost-accounting, observability-mapping, output-only-swarm,
process-agent-adapter, subordinate-memory}` exist, all empty. No claim in this matrix is resolved
using spike evidence, and no row's `UNKNOWN` should be read as final until those lanes report.

## 2. Summary

### By final maturity (all 90 claims)

| Final maturity | Claims | Change from the source-level ceiling (AUD-L1b) |
| --- | ---: | --- |
| ADVERTISED | 6 | unchanged; every one is a claim no lane could test |
| IMPLEMENTED | 1 | unchanged (CLAIM-080, the vitest baseline, was never re-run) |
| PACKAGED | 29 | down from 71; the other 42 split into promotions and refutations |
| REACHABLE | 7 | promoted: an execution lane invoked the capability and it answered |
| EFFECTIVE | 5 | promoted: the claimed behaviour was independently observed at least once |
| DURABLE | 0 | **no claim reached DURABLE** — survival across processes, crashes or environments was never established for any of them |
| GOVERNABLE | 0 | **no claim reached GOVERNABLE** |
| REFUTED | 42 | the claim's own expected postcondition was independently verified as not met |
| **Total** | **90** | |

Source-level ceiling for comparison (lane AUD-L1b, capped at PACKAGED): ADVERTISED 15, IMPLEMENTED 4, PACKAGED 71.

### By decision

| Decision | Claims | Meaning here |
| --- | ---: | --- |
| ADOPT | 0 | **No claim earned ADOPT.** Not one capability was both verified effective and governable enough to rely on as shipped. |
| ADAPT | 2 | CLAIM-049 (`--omit=optional` as a containment control) and CLAIM-053 (pin `@claude-flow/cli` directly + lockfile + `--ignore-scripts`). |
| STUDY | 5 | The five read-only design studies of lane 12 §6: session observability, pattern memory, cost attribution, routing evaluation, self-learning stores. |
| REJECT | 49 | Refuted, absent from the shipped artifact, unreachable, or of no differential value to Tailered or the agent platform. |
| UNKNOWN | 34 | Blocked by the charter (no paid model calls, no real credentials, no external systems) or simply never probed. Enumerated in §5. |
| **Total** | **90** | |

### By evidence label (carried through unchanged from the originating lane)

| Label | Claims |
| --- | ---: |
| VERIFIED | 57 |
| INFERRED | 4 |
| UNKNOWN | 29 |
| **Total** | **90** |

## 3. The matrix

All 90 claims, grouped by area. Claim text is trimmed to ~90 characters; the exact wording and the
full expected postcondition are in `evidence/claims.jsonl` under the same `claim_id`.

### number and specialization of agents (8)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-001** | Ruflo is the harness — the execution layer around Claude Code and Codex that adds 100+ sp… | `README.md:26` | **REFUTED** | 03 §3.1 — 90 agent definition files / **81 unique names** ship in the package `npm i ruflo` installs; the 108-file/97-name tree is the repo root, which is not published | REJECT | VERIFIED |
| **CLAIM-002** | \| What it gives you \| Slash commands + a few skills + agent definitions per-plugin \| Full… | `README.md:57` | **REFUTED** | 03 §3.1–3.5 — 81 names (not 98), 53 top-level CLI commands (not "60+"), 34 skill dirs / 33 `SKILL.md` (not 30). The MCP server, hooks and daemon halves do hold: 05 §2.1, §1.1, §3 | REJECT | VERIFIED |
| **CLAIM-003** | `agent_spawn` — spawn specialized agents (coder, reviewer, tester, security-architect, +5… | `SKILL.md:42` | **REACHABLE** | 07 RUF-322 — `agent spawn --name …` executed, name stored verbatim, no canary process created; 03 §4 — the handler only writes JSON state. The verb "spawn" is refuted as process creation (see CLAIM-090) | REJECT | VERIFIED |
| **CLAIM-004** | Ruflo - Enterprise AI agent orchestration platform. Deploy 60+ specialized agents in coor… | `work/extract/ruflo/package/package.json:4 (published ruflo@3.37.0 tar…` | **REFUTED** | 03 §3.1 — 90 files / 81 names ship, not "60+ deployable agents"; 03 §4 + claims.jsonl (AGENTS.md:114 "Claude-flow does NOT execute code!") — `agent_spawn` creates coordination records only, so "Deploy" is not satisfiable | REJECT | VERIFIED |
| **CLAIM-058** | You don't need to learn 314 MCP tools or 26 CLI commands. | `README.md:38` | **REFUTED** | 05 §2.1–2.2 — live `tools/list` returns **333** tools; the README advertises 314, 210, 210, 112+ and 103 on five different lines. 03 §3.3 — 53 top-level CLI commands, not 26 | REJECT | VERIFIED |
| **CLAIM-060** | 🧩 **Plugin Marketplace** \| 33 native Claude Code plugins + 21 npm plugins | `README.md:206` | **REFUTED** | 03 §3.4 — 38 plugin directories, 35 marketplace entries, 15 npm plugin packages under `v3/plugins/` (not 33+21); exactly **1** plugin (`ruflo-metaharness`) ships. 06 — 549 of 599 plugin files are deleted at publish (`prepare-publish.mjs:34-40`) | REJECT | VERIFIED |
| **CLAIM-078** | Ruflo installs into whatever agent the project uses (auto-detected by skills.sh) ... # Or… | `SKILL.md:64,70-71` | **PACKAGED** | No lane executed `npx skills add ruvnet/ruflo --all`, so the installer's own output was never measured. Independent counts do not reproduce 267: 03 §3.4–3.5 — 136 plugin `SKILL.md`, 34 packaged skill dirs, 39 repo-root skill dirs | UNKNOWN | UNKNOWN |
| **CLAIM-083** | \| 🛠️ \| **~210 tools, ready to call** \| 5 server groups (Core, Intelligence, Agents, Memor… | `README.md:228` | **PACKAGED** | The hosted browser gallery was never loaded and no egress from it was characterised. 05 §2.1 measured the CLI's own roster (333) — a different surface that must not be conflated with this figure | UNKNOWN | UNKNOWN |

### swarm topologies (3)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-005** | 🐝 **Swarm Coordination** \| Hierarchical, mesh, and adaptive topologies with consensus | `README.md:202` | **REACHABLE** | 07 §1.2 — `swarm init` completes offline (`--network none`). No lane demonstrated any behavioural difference between topologies; 09 §14 records swarm/hive-mind coordination as UNKNOWN because exercising it requires model calls | UNKNOWN | VERIFIED |
| **CLAIM-006** | \| **Topology** \| `hierarchical` \| Coordinator catches divergence \| ... `maxAgents` \| 6–8… | `plugins/ruflo-swarm/README.md:56-59` | **PACKAGED** | No lane tested `maxAgents` enforcement (spawn N+1 against a capped swarm); 09 §14 — swarm coordination not exercised | UNKNOWN | UNKNOWN |
| **CLAIM-079** | **Anti-Drift**: hierarchical topology with specialized strategy for tight coordination ..… | `plugins/ruflo-swarm/README.md:19 and CLAUDE.md:112` | **ADVERTISED** | No enforcement mechanism for topology, maxAgents, strategy or checkpoint cadence was identified in any lane. The nearest measured case contradicts enforcement: 05 §3 defect 3 — the daemon schedules **7** workers while the config Ruflo itself wrote declares 3 | REJECT | INFERRED |

### worktree isolation (3)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-007** | **Worktree Isolation**: Each agent works in its own git worktree to avoid conflicts | `plugins/ruflo-swarm/README.md:17` | **REFUTED** | 09 §7.1 — `ruflo --help` exposes no `worktree` command and the main CLI's `dist` never invokes `git worktree add`; creation exists only in `@claude-flow/codex`, whose binary is not linked into top-level `node_modules/.bin`. 09 §7.2 — invoked directly by path it does create real per-agent worktrees | REJECT | VERIFIED |
| **CLAIM-008** | A lease or work claim coordinates ownership; it never grants authority. | `CLAUDE.md:75 (and AGENTS.md:71)` | **REFUTED** | 09 §2 (RUF-440) — 6 agents claiming 6 **different** issues concurrently: all six printed `[OK] Claimed issue 30X` and exited 0; **3 of 6 claims persisted**. Reproduced 3/3 trials (6/4, 6/3, 6/3). A dropped issue was then claimed by agent `INTRUDER`, leaving two agents each holding an "exclusive" claim | REJECT | VERIFIED |
| **CLAIM-089** | - Never run two writers in one worktree. / - Delegation may only reduce tools, servers, n… | `AGENTS.md:54-57` | **REFUTED** | 08 §5.2 — the policy state Ruflo writes unprompted is `{"mode":"legacy","rules":[],"budgets":[]}` and every violation returns `enforcedOutcome: 'allowed'` unless mode is `enforce`; the spending path never calls the engine (RUF-406). 05 §1.3 — the `pre-bash` hook prints `[BLOCKED] Dangerous command detected` and exits **1**, which Claude Code treats as non-blocking, so the command runs | REJECT | VERIFIED |

### inter-agent communication (3)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-009** | Agent Teams turns Claude Code into a multi-agent system where named agents communicate in… | `CLAUDE.md:570` | **ADVERTISED** | No lane grepped the installed tree for a Ruflo-side `SendMessage` transport definition. 05 §1.8 / 07 RUF-309 verified that `init` sets `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` — a Claude Code feature flag — so INFERRED the comms surface is the host's, enabled by Ruflo | UNKNOWN | INFERRED |
| **CLAIM-010** | Federation gives agents the same thing — **shared workspaces across trust boundaries**, w… | `README.md:277` | **PACKAGED** | No two-host federation fixture existed and the charter forbids standing up external systems (09 §14). No receiver-side audit record was ever produced | UNKNOWN | UNKNOWN |
| **CLAIM-090** | Ruflo is the coordination ledger and policy decision point. Claude Code executes code, te… | `CLAUDE.md:20-22 (mirrored at AGENTS.md:31-32 and AGENTS.md:178)` | **REFUTED** | 12 §5.1 — `github_pr_manage` executes `runArgv('gh', ['pr','merge', String(prNumber), '--merge'])` (`github-tools.js:322`) and `github_workflow` executes `gh workflow run` (`:565`) and `gh run cancel` (`:574`): MCP tools that perform implementation, and in the agent platform a production deploy. 03 §6 — packaged code spawns `gcloud` ×10, `gh` ×8, `git` ×5, `docker` ×2, `agent-browser` ×2, beyond the daemon's `claude --print` | REJECT | VERIFIED |

### consensus (3)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-011** | \| Coordination \| Manual orchestration \| Queen-led hierarchy (Raft, Byzantine, Gossip) \| | `README.md:334` | **PACKAGED** | No lane ran a multi-process adversarial consensus experiment; 09 §14 — hive-mind/swarm/autopilot coordination requires model calls, which the charter forbids | UNKNOWN | UNKNOWN |
| **CLAIM-012** | 🗳️ **5 Consensus Algorithms**: Byzantine (f < n/3), Raft (leader-elected), Gossip (eventu… | `docs/USERGUIDE.md:265` | **PACKAGED** | No lane fed an identical vote sequence to the five named strategies, so no observable difference between them was measured (09 §14) | UNKNOWN | UNKNOWN |
| **CLAIM-074** | \| `hive-mind` \| 6 \| Queen-led Byzantine fault-tolerant consensus \| | `CLAUDE.md:388` | **PACKAGED** | `.claude-flow/hive/*.json` was never inspected. 03 §6 verified exactly one `createServer(…)/listen(…)` pair in the whole published `@claude-flow/cli` dist (an ephemeral loopback server at `browser-intent-tools.js:178,209`), and 05 §3 verified the daemon binds no sockets at all — INFERRED that no multi-node transport ships, which n≥3f+1 BFT requires | UNKNOWN | INFERRED |

### workflow persistence and resumption (2)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-013** | **MCP `workflow_*` tools** — declarative, persisted workflow definitions with a full stat… | `plugins/ruflo-workflows/README.md:5` | **REFUTED** | 08 §4.2 (S22–S25) — `workflow run` exits 0, writes `{"status":"running","currentStep":0}` to `.claude-flow/workflows/store.json`, then executes nothing and never writes a terminal state; two runs left two permanent zombie `running` records. `workflow list` reports `[INFO] No workflows found` with 2 records in the store, because `commands/workflow.js:276-278` passes the sentinel `'all'` into a literal equality filter. Resume/duplicate-effect safety remains UNKNOWN (no model credentials) | REJECT | VERIFIED |
| **CLAIM-014** | session-restore \| Session state management and persistence | `CLAUDE.md:382 (`session` \| 7 \| Session state management and persisten…` | **REACHABLE** | 05 §1.4 — `hook-handler.cjs session-restore` was probed directly and exited 0. No lane performed the marker round-trip (save → terminate → restore → read the store). The underlying store is non-durable on the sql.js path (08 RUF-401) | UNKNOWN | VERIFIED |

### autopilot (2)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-015** | Autonomous /loop-driven task completion with learning and prediction. Combines Ruflo's 10… | `plugins/ruflo-autopilot/README.md:3-5` | **REFUTED** | 08 §4.1 — autopilot does not execute tasks; it is a stop-hook gate that re-engages the agent and keeps no effect ledger, so duplicate-effect safety is delegated to a `status` field the agent writes. S21 — a malformed task source produced `ALLOW STOP: No tasks discovered from any source` (exit 0) and `autopilot status` reported `Tasks: 0/0 (100%)`, byte-identical to genuine completion. The checkpoint itself is durable (S20: iteration 1→2→3 across three processes) | REJECT | VERIFIED |
| **CLAIM-075** | **Cache-aware**: ScheduleWakeup at 270s keeps prompt cache warm between iterations | `plugins/ruflo-autopilot/README.md:20` | **ADVERTISED** | Prompt-cache retention is a provider property measurable only from `usage` fields on paid calls; the charter forbids paid model calls (10 §9, 08 §10) | UNKNOWN | UNKNOWN |

### background loops (3)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-016** | ⚡ **Background Workers** \| 12 auto-triggered workers (audit, optimize, testgaps, etc.) | `README.md:205` | **REFUTED** | 05 §3 and 10 §7.3 — the daemon declares 9 worker types and schedules **7** (`map` 900 s, `audit` 600 s, `optimize` 900 s, `consolidate` 1800 s, `testgaps` 1200 s, `backup` 86400 s, `harness` 21600 s), not 12. The daemon itself is real: PID 36, PPID 1, verified by `ps` (05 §3) and by `/proc` counters over 418 s (10 §7.3) | REJECT | VERIFIED |
| **CLAIM-017** | Every autonomous `claude --print` launch across ALL ruflo daemons in ALL worktrees/worksp… | `dist/src/services/global-ai-budget.js:3-37 (published tarball; source…` | **PACKAGED** | 09 §14 — `global-ai-budget` was read but never exercised; `aiWorkersEnabled: false` by default (10 §7.3) meant no `claude --print` launch occurred, so the launch ceiling and its receipts were never driven. 09 §5.2 verified the PID-liveness defect class it shares (`global-ai-budget.ts:428`) | UNKNOWN | UNKNOWN |
| **CLAIM-059** | \| `hooks` \| 17 \| Self-learning hooks + 12 background workers \| ... ## V3 Hooks System (17… | `CLAUDE.md:387 and CLAUDE.md:728` | **REFUTED** | 05 §2.2 — `hooks` is the largest live prefix at **44** tools; 03 §3.3 — 42 `hooks` subcommand entries; 05 §3 / 10 §7.3 — **7** workers scheduled, not 12. CONFLICT recorded: the `hooks_*` tool count is 41 (03 §4), 43 (claims.jsonl) and 44 (05 §2.2, live roster) | REJECT | VERIFIED |

### AgentDB persistence (3)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-018** | 💾 **Vector Memory** \| HNSW-indexed AgentDB — measured ~1.9x faster at N=20k, ~3.2x–4.7x a… | `README.md:204` | **PACKAGED** | 10 §5, §12 — no brute-force baseline exists in-tree to divide by, so **no speedup could be computed at all**; absolute latency and its scaling were measured instead (100× corpus → 8.7× latency, INFERRED sub-linear) | UNKNOWN | UNKNOWN |
| **CLAIM-068** | \| MCP server registered \| **No** (`memory_store`, `swarm_init`, etc. unavailable to Claud… | `README.md:59` | **REACHABLE** | 05 §2.1 — the CLI path was driven over real JSON-RPC stdio and returned 333 tools, so the "Yes" half holds. The plugin-only install path was never exercised, so the "No" half is untested | UNKNOWN | VERIFIED |
| **CLAIM-087** | **Encryption at rest** (opt-in via `CLAUDE_FLOW_ENCRYPT_AT_REST=1`) — AES-256-GCM with ma… | `plugins/ruflo-aidefence/README.md:25 and plugins/ruflo-rvf/README.md:…` | **EFFECTIVE** | 07 RUF-314 — with the gate off (the default) a value stored via `memory store` was recovered verbatim from `.swarm/memory.db` and its WAL with `strings`, and `doctor` states "Encryption at Rest: Off". CONFLICT with the claim's "mode 0600": `.swarm/agentdb-memory.db` and its `-shm`/`-wal` sidecars are **0644**, world-readable. The `CLAUDE_FLOW_ENCRYPT_AT_REST=1` path and the `RFE1` magic bytes were never exercised | UNKNOWN | VERIFIED |

### vector retrieval (3)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-020** | Provides semantic store/search/recall over AgentDB with HNSW-indexed vector search ... Br… | `plugins/ruflo-rag-memory/README.md:7` | **EFFECTIVE** | 08 §1.1 (S15) — real 384-dimension `Xenova/all-MiniLM-L6-v2` embeddings, semantic search returned the sentinel at score 0.71 on the native path; 10 §5 — 1,000 stores and 60 searches completed, `embeddingCoverage: "100.0%"`. Not DURABLE (08 RUF-401). The lexical-disjoint and ordering-stability probes were never run, and 10 §12 leaves real-vs-mock embeddings UNKNOWN for its own sql.js runs — a conflict with 08 §1.1's native-path VERIFIED result | STUDY | VERIFIED |
| **CLAIM-069** | \| **Memory** \| Session-only \| HNSW vector memory with sub-ms retrieval \| | `README.md:335 (also docs/USERGUIDE.md:459 'HNSW vector memory with su…` | **REFUTED** | 10 §5 — `memory_search` p50 **8.867 ms** (N=10), **20.419 ms** (N=100), **77.084 ms** (N=1,000): never sub-millisecond at any corpus size. 05 §2.4 — one `memory_search` in a fresh process took **29,979 ms** because the HNSW index is rebuilt per process | REJECT | VERIFIED |
| **CLAIM-072** | \| `embeddings` \| 4 \| Vector embeddings (embed, batch, search, init) — agentic-flow ONNX b… | `CLAUDE.md:401` | **EFFECTIVE** | 10 §4 — a cold `init` downloaded `model.onnx` at **90,387,606 B** (91,100,763 B across 4 files, 99.96% of init network, 41.2% of init wall time); 08 §1.1 — the database records `embedding_model = Xenova/all-MiniLM-L6-v2`, 384 dimensions, a genuine float vector. The observed backend is `@huggingface/transformers`, not "agentic-flow ONNX". 08 RUF-419 records an INFERRED mock-embedding fallback that was not reproduced | REJECT | VERIFIED |

### RAG (1)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-021** | **Smart retrieval — hybrid search, graph hops, diversity ranking** | `README.md:97` | **PACKAGED** | No lane tested hybrid (BM25-reachable) retrieval, 2-hop graph traversal, or diversity ranking; only single-vector `memory_search` was exercised (10 §5, 08 S15) | UNKNOWN | UNKNOWN |

### cross-session memory (2)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-022** | 💾 \| **Memory that sticks** \| Say *"remember my favorite color is indigo"* and ask weeks l… | `README.md:231` | **REFUTED** | **CONFLICT recorded between two lanes, both VERIFIED.** 05 §2.4 — process A stores `K1` with `stored: true`; a separate process reports `totalEntries: 0` and `found: false` while an independent `node:sqlite` reader finds the row in `memory_entries` and `grep -a` matches the raw bytes. 08 §1.2 (S04) — on the sql.js path the DB md5 is **byte-identical before and after** (`fd4c18546b2355b801019c3414b2f496`) and a whole-container `grep -rl` finds the value in **zero files**. 08 §1.1 (S01) — the native glibc path DOES survive into a brand-new container. Durability is environment-conditional with no runtime signal (RUF-403) | REJECT | VERIFIED |
| **CLAIM-023** | The `SessionStart` hook automatically imports current project's memories into AgentDB. | `CLAUDE.md:924` | **PACKAGED** | 05 §1.1 verified the generated `SessionStart` group declares `auto-memory-hook.mjs import`, but no lane confirmed an AgentDB row inside a session window or enumerated which files were read. The cross-project read surface is real and unmeasured: `memory_import_claude` carries an `allProjects` flag (05 §2.2) | UNKNOWN | UNKNOWN |

### self-learning (2)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-024** | 🧠 **Self-Learning** \| SONA neural patterns, ReasoningBank, trajectory learning | `README.md:203` | **PACKAGED** | No lane ran the wiped-store vs preserved-store experiment on a pre-registered metric, so no improvement was measured. 10 §6.1 verified the adjacent telemetry is not a measurement: `searchImprovement: reasoningBankSize > 0 ? '150x-12,500x' : 'N/A'` is a string literal gated on "at least one pattern is stored" | STUDY | UNKNOWN |
| **CLAIM-071** | 🦾 \| **ruvLLM self-learning AI** \| Native support for ruvLLM — RuFlo's self-improving loca… | `README.md:227` | **PACKAGED** | The ruvllm path was never exercised, so the data-residency claim was not tested. 07 §1.1 did verify egress to `funnel.ruv.io`, `gateway.pinata.cloud` and four other IPFS gateways, and to a vendor Cloud Function — from other commands, not from ruvllm | UNKNOWN | UNKNOWN |

### SONA or adapter learning (2)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-025** | \| **SONA**: Self-Optimizing Neural Architecture (measured 0.0043ms/adapt, target <0.05ms… | `CLAUDE.md:788` | **PACKAGED** | The 0.0043 ms figure was never measured by any lane. Its only in-tree assertion is a no-op: 10 §6.4 executed `tests/docker-regression/scripts/test-performance.sh` in `docker run --rm --network none node:24` with no network, no ruflo installed, no vectors, no model and no database, and it printed `Total: 51 \| Passed: 51 \| Failed: 0`, exit 0 — including the case "Adaptation < 0.05ms" (RUF-501) | REJECT | VERIFIED |
| **CLAIM-086** | \| `neural` \| 5 \| Neural pattern training (train, status, patterns, predict, optimize) \| .… | `CLAUDE.md:395 and CLAUDE.md:789` | **REACHABLE** | 07 §1.2 — `neural status` completes offline with zero DNS and zero TCP at the sinkhole. Whether the MoE gate changes which model or agent is actually selected on a held-out set was never tested | UNKNOWN | VERIFIED |

### model routing (3)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-026** | \| Task Routing \| You decide \| Intelligent routing (89% accuracy) \| | `README.md:337` | **PACKAGED** | No labelled task→agent dataset ships, so 89% is not recomputable by anyone; no lane could test it. 11 BLOCKER-3 verified the router that would be measured: a stateful Thompson-sampling bandit persisting `.swarm/model-router-state.json` that preempts the caller's choice | STUDY | UNKNOWN |
| **CLAIM-027** | \| **1** \| Deterministic codemod \| ~1ms \| $0 \| Structural transforms with **no LLM**: `var… | `CLAUDE.md:99` | **REACHABLE** | 07 §1.2 — `route` completes under `--network none` and produced zero DNS and zero TCP at the sinkhole, which satisfies the zero-egress conjunct for that command. The three codemods (`var-to-const`, `remove-console`, `add-logging`) were never applied to a fixture and the "$0 structurally guaranteed" conjunct was not tested | UNKNOWN | VERIFIED |
| **CLAIM-067** | Integrates agentic-flow optimizations for 30-50% token reduction: ... \| ReasoningBank ret… | `CLAUDE.md:526,534,537,540-545` | **PACKAGED** | None of the cited percentages carries a baseline, workload or measurement protocol, and no lane reproduced any of them. 10 §6.1–6.3 verified that the same figure class is retracted in-tree (upstream `CLAUDE.md:830`: "150x-12,500x NOT reproduced — was brute-force fallback") while 22 dist files still ship the HNSW claim, 11 ship the Flash Attention claim, and `init` writes both into 20 agent-facing files of the customer repo | REJECT | INFERRED |

### provider support (3)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-028** | 🔌 **Multi-Provider** \| Claude, GPT, Gemini, Cohere, Ollama with smart routing | `README.md:207` | **REFUTED** | claims.jsonl (lane AUD-L1b) — **zero** case-insensitive occurrences of `cohere` anywhere in the published dist, the bundled `node_modules`, `bin/`, or the repo's CLI source, so `ruflo providers list` cannot enumerate Cohere. 03 §4 — the `providers` command carries 8 rows | REJECT | VERIFIED |
| **CLAIM-029** | \| LLM Providers \| Anthropic only \| 5 providers with failover \| | `README.md:339` | **REFUTED** | The "5 providers" enumeration fails for the reason in CLAIM-028. Failover itself was never demonstrated — 07 §4 records live provider behaviour under real credentials as UNKNOWN. 07 RUF-304 verified the related defect: provider is chosen by ambient environment (`useOpenRouter = … (!anthropicKey && !!openrouterKey)`) and erased from the normalised result shape | REJECT | VERIFIED |
| **CLAIM-066** | Ruflo v3 is built on top of **[agentic-flow]**, a production-ready AI agent orchestration… | `docs/USERGUIDE.md:4869` | **REFUTED** | RUF-007 (coordinator) — a clean install of the pinned version resolved **`agentic-flow 3.0.0-alpha.2`**; the root manifest pins `^2.0.14` while `@claude-flow/cli` pins `^3.0.0-alpha.1`, a major-version disagreement inside one release train. 07 RUF-311 lists `agentic-flow` among the advisory-flagged packages. An alpha resolution does not support "production-ready" | REJECT | VERIFIED |

### cost tracking (1)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-030** | Tracks token usage per agent, task, and model, then computes USD cost attribution using c… | `plugins/ruflo-cost-tracker/README.md:7` | **REFUTED** | 08 §5.2 (RUF-406) — `headless-worker-executor.js`, the component that actually spends money, contains **zero** references to the policy engine; cost is parsed after the fact from the result envelope at `:371`. The only gated surface (`mcp-client.js:234`) never supplies `costUsd`, so in enforce mode it would deny every MCP call as unmetered while still not gating model spend. 06 — the `ruflo-cost-tracker` plugin is one of the 37 deleted at publish | STUDY | VERIFIED |

### budget enforcement (1)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-031** | **Budget Circuit Breaker (ADR-097)**: per-call `maxHops` (default 8), optional `maxTokens… | `plugins/ruflo-federation/README.md:20` | **PACKAGED** | No multi-node delegation chain was constructed, so `maxHops`, `HOP_LIMIT_EXCEEDED` and `BUDGET_EXCEEDED` were never driven and no receiving-node audit log exists (09 §14; charter forbids external systems) | UNKNOWN | UNKNOWN |

### observability (2)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-032** | Implements OpenTelemetry-compatible structured logging with correlation IDs, distributed… | `plugins/ruflo-observability/README.md:7` | **REFUTED** | 06 — 37 of 38 plugins are deleted at publish (`prepare-publish.mjs:34-40`), so `ruflo-observability` is in neither tarball. claims.jsonl (AUD-L1b) — **zero** occurrences of `startSpan`, `parentSpanId` or `traceId` anywhere in the published `@claude-flow/cli` dist. No span can be produced by the shipped artifact | REJECT | VERIFIED |
| **CLAIM-034** | - **ADR-052**: Statusline Observability System | `docs/USERGUIDE.md:3130` | **REFUTED** | "Reads only local files" does not hold. 10 §7.2 — `statusline.cjs` `execSync`s the CLI with `{timeout: 8000}` over a candidate list ending in `npx --prefer-offline @claude-flow/cli`, costing p50 **8,270.6 ms** per render when ruflo is not project-resolvable versus 70.8 ms when it is (117×, and identical with `--network none`), and renders a sponsor row into the IDE chrome. 05 §1.7 — it reads the user's global `~/.claude.json`. 07 RUF-306 — the content it renders is fetched unsigned from `https://funnel.ruv.io/v1/messages` with no consent gate | STUDY | VERIFIED |

### tracing (1)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-033** | 🔬 \| **observe trace <task-id>** -- Trace agent execution for a specific task. 1. Query `o… | `plugins/ruflo-observability/commands/observe.md:8-11` | **REFUTED** | Same packaging evidence as CLAIM-032: the plugin that defines `observe trace` is absent from both tarballs (03 §3.4, 06), and claims.jsonl records zero occurrences of `observability` as a namespace string in the dist | REJECT | VERIFIED |

### security scanning (5)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-035** | 🛡️ **Security** \| AIDefence, input validation, CVE remediation, path traversal prevention | `README.md:208` | **REFUTED** | 07 RUF-307 — identical secrets quoted vs unquoted: 3 HIGH found quoted, **0 found** in `unquoted.env` and `unquoted.js` (patterns require surrounding quotes, `security.js:172-177`), output `No security issues found!`, `Critical: 0 High: 0`, exit 0 over live-format credentials. 07 RUF-308 — `memory export --output ../../../tmp/EXPORT_ESCAPE.json` wrote outside the project root, contradicting "path traversal prevention". 07 RUF-310 — AIDefence is absent from every shipped install | REJECT | VERIFIED |
| **CLAIM-036** | **`security scan --type container` is rejected instead of silently reporting clean** — it… | `CHANGELOG.md:31` | **PACKAGED** | No lane ran `security scan --type container`, so the claimed rejection was never observed. The second half of the postcondition is answered adversely by 07 RUF-307: the remaining scan types still return a clean bill over planted, live-format credentials, and `--depth deep` was byte-identical to `standard` (RUF-327) | UNKNOWN | UNKNOWN |
| **CLAIM-037** | **Input validation** using Zod schemas for all public API inputs / **Parameterized SQL qu… | `SECURITY.md:48-51` | **REFUTED** | The claim is universal ("all public API inputs"), so one counter-example falsifies it. 07 RUF-323 — memory keys `../../escape-key` and namespaces `/tmp/absns` were accepted with `[OK] Data stored successfully` and no validation whatsoever (they are harmless only because they land as parameterised SQLite column values). 07 RUF-308 — `memory export --output` applies no `PathValidator` and escapes the project root. Parameterised SQL is separately confirmed (RUF-323) | REJECT | VERIFIED |
| **CLAIM-064** | ## Supported Versions \| 3.5.x \| Yes \| 3.0-3.4 \| No \| 2.x \| No | `SECURITY.md:5-9` | **REFUTED** | The shipped `SECURITY.md:5-9` supported-versions table names `3.5.x` and no 3.3x line, so the currently shipping release is not covered by its own policy. 07 RUF-317 — `CHANGELOG.md` has no `3.35.0`, `3.36.0` or `3.37.0` entry; 07 RUF-311 — the 3.37.0 tree carries 41 advisories (1 critical RCE) | REJECT | VERIFIED |
| **CLAIM-065** | 🔒 **Production-Ready Security** - Built-in protection against prompt injection, input val… | `docs/USERGUIDE.md:231` | **REFUTED** | 07 RUF-311 — `npm audit --package-lock-only`: **1 critical, 13 high, 27 moderate = 41** over 785 packages, including `protobufjs <7.5.5` arbitrary code execution (GHSA-xq3m-2v4x-88gg). 07 RUF-310 — the prompt-injection defence is absent from every install. 07 RUF-307 — the secret scanner is structurally blind to `.env`-shaped credentials | REJECT | VERIFIED |

### prompt-injection protection (2)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-038** | **Safety scanning**: Detect prompt injection, jailbreak attempts, and adversarial content | `plugins/ruflo-aidefence/README.md:14` | **REFUTED** | 07 RUF-310 — `@claude-flow/aidefence` is **ABSENT** from `install-default`, `install-noscripts` and `install-nooptional`, is a declared dependency in no form, and `doctor` reports `⚠ AIDefence: @claude-flow/aidefence not loadable — aidefence_* MCP tools will fail`. Ladder: ADVERTISED → IMPLEMENTED → ✗ PACKAGED. 07 RUF-307 — a blatant prompt-injection fixture (`inject.md`) produced 0 findings | REJECT | VERIFIED |
| **CLAIM-039** | **Loader-hijack denylist** — `validateEnv()` rejects `LD_PRELOAD`, `LD_LIBRARY_PATH`, `LD… | `plugins/ruflo-aidefence/README.md:24` | **PACKAGED** | No lane called `terminal_create` with `LD_PRELOAD`, `NODE_OPTIONS` or any other denylisted variable, and the other child-spawning paths (`headless-worker-executor`, `agent_execute`, update/executor) were not probed for the same filter | UNKNOWN | UNKNOWN |

### PII protection (2)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-040** | 🛡️ \| **PII-gated data flow** \| 14-type detection pipeline scans every outbound message. P… | `README.md:291` | **PACKAGED** | No PII corpus was run against the pipeline and no federation outbound path was exercised, so neither the miss rate nor the "every outbound message" coverage claim was tested | UNKNOWN | UNKNOWN |
| **CLAIM-041** | **PII detection**: Flag emails, SSNs, API keys, and other sensitive data | `plugins/ruflo-aidefence/README.md:15` | **REFUTED** | 07 RUF-310 — one side of the required comparison cannot exist in a shipped install: `aidefence_has_pii` is unreachable because `@claude-flow/aidefence` is absent from every install tree and `doctor` states the `aidefence_*` tools will fail | REJECT | VERIFIED |

### federation (5)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-042** | 🔒 \| **Zero-trust federation** \| Remote agents start untrusted. Identity proven via mTLS +… | `README.md:290` | **PACKAGED** | No TLS handshake was captured because no federation node was started; standing up two peers is outside the charter (09 §14). Neither a `CertificateRequest` nor a client `Certificate` message was observed or excluded | UNKNOWN | UNKNOWN |
| **CLAIM-043** | 📊 \| **Behavioral trust scoring** \| Formula (`0.4×success + 0.2×uptime + 0.2×threat + 0.2×… | `README.md:292` | **PACKAGED** | No lane located the weighted-sum implementation or drove a peer's success rate down, so neither the 0.4/0.2/0.2/0.2 coefficients nor any access change on downgrade was observed | UNKNOWN | UNKNOWN |
| **CLAIM-044** | 📋 \| **Compliance built-in** \| HIPAA, SOC2, GDPR audit trails as compliance modes. Every f… | `README.md:293` | **ADVERTISED** | No control mapping and no third-party attestation ships in either tarball, and none was located by any lane. A control-framework assertion is not testable from an artifact; an audit log satisfies none of HIPAA, SOC2 or GDPR on its own | REJECT | UNKNOWN |
| **CLAIM-082** | Slack gave teams channels. Federation gives agents the same thing ... You don't configure… | `README.md:277,281` | **PACKAGED** | `federation init` was never run, so the key material it generates, where it is stored and at what file mode are unmeasured. The claim also contradicts CLAIM-042 in the same README — mutual TLS requires certificates on both sides | UNKNOWN | UNKNOWN |
| **CLAIM-088** | \| **Agent Federation** \| Cross-installation agent collaboration with zero-trust security \| | `README.md:209` | **PACKAGED** | No federation node was started, so no unauthenticated-peer reachability probe was possible and no zero-trust property was individually confirmed or excluded | UNKNOWN | UNKNOWN |

### browser automation (1)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-045** | Session-as-skill browser automation. Playwright-backed via 23 `mcp__plugin_ruflo-core_ruf… | `plugins/ruflo-browser/README.md:3` | **REACHABLE** | 05 §2.1 — a live `tools/list` returned **333** tools, exactly the unconditional count established at 03 §3.2, so the 23 `browser_*` tools were absent with no error surfaced: the conditional gate at `mcp-client.js:75-88` is confirmed on the without-binary arm. The with-binary arm was never run. 12 §3.2 (use case 6) — zero differential for the agent platform, which already mandates `/gstack-browse` | REJECT | VERIFIED |

### test generation (2)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-046** | **Test Generation**: Automated test scaffolding for uncovered modules | `plugins/ruflo-testgen/README.md:16` | **REFUTED** | 05 §2.2 — the live 333-tool roster contains no `testgen` prefix at all. 03 §3.2 and 12 RUF-L6b-08 — `testgen_tdd_repair` is exported from `dist/src/mcp-tools/index.js:31` and is one of the 5 packaged-but-never-registered tools. Zero reachable test-generation tools | REJECT | VERIFIED |
| **CLAIM-047** | \| [**ruflo-testgen**](plugins/ruflo-testgen/README.md) \| Find missing tests and generate… | `README.md:116` | **REFUTED** | Same as CLAIM-046, plus 06 — the `ruflo-testgen` plugin is one of the 37 plugin directories deleted at publish, so it is in neither tarball. No test file could be emitted, executed, or negative-tested | REJECT | VERIFIED |

### MetaHarness grading (2)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-048** | 🔬 **[MetaHarness]** \| Audit your AI agent setup before you ship. Grade readiness (1-100),… | `README.md:210` | **PACKAGED** | `metaharness score` was never run, so neither determinism across two identical runs nor the ADR-150 `{degraded:true}` behaviour with the optional packages absent was observed | UNKNOWN | UNKNOWN |
| **CLAIM-049** | **Ruflo remains operational if every MetaHarness package is removed.** Four rules: 1. **R… | `CLAUDE.md:1265-1269` | **EFFECTIVE** | 07 RUF-321 — `npm i ruflo@3.37.0 --omit=optional` yields **124 MiB / 11,956 files** versus 1.5 GiB / 50,012, drops `better-sqlite3` (removing the RUF-301 abort), `@huggingface/transformers` (removing the 90 MB download) and `@napi-rs/keyring`, and **the CLI still runs**; 10 §1 re-measured the tree (127,100 KB, 11,956 files, 74 s). Caveat: on that same tree `memory store` prints `[OK]` and discards the write (08 §1.2), so "operational" holds for exit codes, not for behaviour | ADAPT | VERIFIED |

### witness verification (3)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-050** | \| **[Verification](verification.md)** \| Cryptographically prove your installed bytes matc… | `README.md:385` | **REFUTED** | RUF-011 (coordinator, CRITICAL) — on a pristine `npm install ruflo@3.37.0` with no modifications, `ruflo verify` prints `pass: 0, drift: 53, regressed: 0, missing: 2` and then `[OK] All fixes verified. Installed artifact matches the signed witness manifest.` with a measured exit code of **0**. `verify.js:201` computes `allOk` from `manifestHashOk && publicKeyReproducible && signatureValid && regressedCount === 0`, excluding drift and missing by construction. The Ed25519 seed is `sha256(witness.manifest.gitCommit + ':ruflo-witness/v1')` (`verify.js:124`), so the private key is publicly derivable and the signature attests to nothing about origin | REJECT | VERIFIED |
| **CLAIM-051** | The command fetches the manifest, recomputes SHA-256 for every cited file, re-derives the… | `docs/STATUS.md:112` | **REFUTED** | RUF-011 — drift does **not** produce a non-zero exit: 53 SHA-256 mismatches produced exit 0 and no aggregate warning, because `verify.js:244` early-returns on `allOk` and makes the drift warning at `:252` unreachable. RUF-012 — the manifest is fetched at verify time from `raw.githubusercontent.com/ruvnet/ruflo/{branch}/verification.md.json` with the default branch `fix/issues-may-1-3` (`verify.js:21,139,161`), a mutable feature branch | REJECT | VERIFIED |
| **CLAIM-073** | Every documented fix in ruflo gets attested by a SHA-256 + marker substring + Ed25519 sig… | `verification/README.md:3` | **REFUTED** | RUF-011 / RUF-L1a-02 — the vendor's own sentence is the defect: because the **seed** is `sha256(gitCommit + ':ruflo-witness/v1')` and both inputs are public, anyone with the commit re-derives the *private* key, not merely the public one, and `verify.js:126` presents `publicKeyReproducible` as a security property. No forgery was executed; the refutation is read directly from the shipped `dist/src/commands/verify.js` | REJECT | VERIFIED |

### package reproducibility (12)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-019** | agentdb compatibility patches. Two patches applied to the user's installed agentdb tree:… | `@claude-flow/cli/package/scripts/postinstall.cjs:3-23` | **REFUTED** | RUF-001 (coordinator) — only `copySiblings` executes. `augmentExports` is defined at `scripts/postinstall.cjs:95` and never called; `main()` at `:137-151` calls `copySiblings` only. Run against a synthetic agentdb tree it created `dist/{controllers,optimizations,security,services}` while `package.json` stayed byte-identical (sha256 `83f5a21ce823b50654be6782a7ba698334384fe5fd34ff116521a62c991124b6` before and after). Exit 0 either way, so half the documented work silently does not happen | REJECT | VERIFIED |
| **CLAIM-052** | \| **Verification** \| Cryptographically prove your installed bytes match the signed witness | `README.md:385` | **REFUTED** | RUF-012 — the trust anchor is a mutable feature branch fetched over the network at verify time, so offline verification is impossible and "verified" can change at any moment. 03 §4 and 06 — the `verification/` evidence directory ships in **neither** tarball, so an npm-only installer holds no local witness at all | REJECT | VERIFIED |
| **CLAIM-053** | `ruflo` (thin wrapper) ... Users invoke it as `npx ruflo <command>`. | `SKILL.md:8` | **REFUTED** | RUF-007 — `ruflo@3.37.0` depends on `@claude-flow/cli` via the caret range `^3.33.0`, so the pinned wrapper does not pin the implementation; a clean install resolved `agentdb 3.0.0-alpha.20`, `ruvector 0.2.41`, `agentic-flow 3.0.0-alpha.2` across 785 packages. "Thin wrapper" also fails: 03 §1 — 499 of 526 files are a HuggingFace `chat-ui@0.20.0` fork that `bin/ruflo.js` never references. The workable pinning form is in 11 Q25 | ADAPT | VERIFIED |
| **CLAIM-054** | Published tarball file counts: ruflo = 526 files, @claude-flow/cli = 1507 files | `audit charter frozen fact; independently re-counted in this lane` | **PACKAGED** | 03 §1 — 526 and 1507 confirmed exactly by independent count; the license lane records that 1507 also matches the registry's `dist.fileCount`. What the counts contain is the finding: 03 §1 / RUF-L1a-05 (499 of 526 files are a chat-ui fork with its own Dockerfile, Helm chart, 10 CI workflows and a 543 KB WASM asset), 07 RUF-318 (a third party's live production topology: `chat.conveyorclaims.ai`, GCP project `new-project-473022`), AUD-L3a RUF-301/302 (an Apache-2.0 subtree published under an MIT declaration, with no LICENSE file in either tarball) | REJECT | VERIFIED |
| **CLAIM-061** | \| **[Status](docs/STATUS.md)** \| See what currently works — capability counts, test basel… | `README.md:381` | **REFUTED** | `docs/STATUS.md` — the document presented as "see what currently works" snapshots `ruflo@3.10.2` / `@claude-flow/cli@3.10.1`, 27 minor releases behind the audited 3.37.0. 07 RUF-317 — `CHANGELOG.md` carries no entry for 3.35.0, 3.36.0 or 3.37.0, so no in-artifact document describes the shipped release | REJECT | VERIFIED |
| **CLAIM-062** | ## Version — Current: 3.31.0 (stable, published to npm as `ruflo@latest` / `claude-flow@l… | `SKILL.md:80-82` | **REFUTED** | 06 — `.claude/helpers/helpers.manifest.json` declares version `3.34.0` with one Ed25519 signature in the tagged source and `3.37.0` with a different signature in the tarball, and `.helpers-version` reads `3.32.29` in source versus `3.33.0` in the tarball. 10 §7.2 — `statusline.cjs:839` hardcodes `let ver = "3.32.8"` and renders `RuFlo V3.32.8` on the fallback path against an installed 3.37.0. The shipped artifact self-reports at least four different versions | REJECT | VERIFIED |
| **CLAIM-063** | ## [3.34.0] - 2026-07-31 ... ## [3.32.10] - 2026-07-26 ... ## [3.5.0] - 2026-02-27 | `CHANGELOG.md:10,33,53` | **REFUTED** | 07 RUF-317 — at `6ce18b5` the `[Unreleased]` heading is empty and the newest changelog entry is `[3.34.0] - 2026-07-31`. There is no entry for 3.35.0, 3.36.0 or 3.37.0 — including for the release titled "proxy install hardening, cloud routing disclosure, tier pinning". A consumer cannot learn what changed in the version they installed | REJECT | VERIFIED |
| **CLAIM-070** | Registry source: IPFS via Pinata (`QmXbfEAaR7D2Ujm4GAkbwcGZQMHqAMpwDoje4583uNP834`) ... P… | `CLAUDE.md:1444 and CLAUDE.md:1382` | **REFUTED** | 07 RUF-300 — with all five IPFS gateways sinkholed, stderr showed five `Gateway … failed: fetch failed` lines and `Fetch failed … on all gateways`, while stdout printed `Registry discovered: 21 plugins available`, 20 rows every one marked `Trust: Official`, and `Registry CID: bafybeiplugin9f7bf92dfab6ad868…` — minted by `crypto.randomBytes(16)` at `discovery.js:230` — with exit **0**. The fallback fires on signature-verification failure too. 07 RUF-319 — the catalog's checksums are placeholders (`sha256:abc123neural`, `sha256:def456security`), not 64-hex digests | REJECT | VERIFIED |
| **CLAIM-080** | \| **Combined audit-fix surface** \| all encryption + federation + graph tests \| green \| ..… | `docs/STATUS.md:55-57` | **IMPLEMENTED** | No lane installed both dependency trees and re-ran Ruflo's vitest suite at 3.37.0, so the actual pass/fail/skip counts are unmeasured. 10 §6.4 ran only the repo's `tests/docker-regression` shell suite, which is a different artifact (and 370 of its 491 assertions are `echo`). The advertised 1999/1999 is a 3.10.x-era figure from the stale document refuted at CLAIM-061 | UNKNOWN | UNKNOWN |
| **CLAIM-081** | **Snapshot at `ruflo@3.10.2` / `@claude-flow/cli@3.10.1`** ... \| MCP tools \| **323** \| `v… | `docs/STATUS.md:49,63` | **REFUTED** | `docs/STATUS.md:63` cites `verification/inventory.json` as the source for "323 MCP tools" while that file records 305 — the citation does not support the number. Neither figure matches the measured surface: 03 §3.2 — 356 registered, 333 unconditional; 05 §2.1 — 333 in a live `tools/list` | REJECT | VERIFIED |
| **CLAIM-084** | \| Ecosystem downloads \| 8.1M+ \| Git clones (14d) \| 106k | `README.md:15-16 (badge labels linking to data/clone-data.proof.json a…` | **ADVERTISED** | Download and clone counts were never re-derived from `api.npmjs.org/downloads` or GitHub's traffic API; the only real outbound traffic in the audit was package-metadata resolution against the registry (07 §0) | UNKNOWN | UNKNOWN |
| **CLAIM-085** | ruflo wins cold start, single turn, RSS by 1.3×–1953× [vs LangGraph / AutoGen / CrewAI] | `README.md:384` | **ADVERTISED** | The comparator harness lives on the feature branch `perf/sota-comparator-benchmarks`, which was never fetched, and no competitor framework was installed, so no like-for-like matrix exists. 10 §2 measured Ruflo's own cold `--help` at 17,903–18,680 ms and records the vendor's own source comment documenting a "blocking 60+ s" cold path — neither is a comparison | UNKNOWN | UNKNOWN |

### GitHub integration (2)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-055** | ### GitHub & Repository `github-modes`, `pr-manager`, `code-review-swarm`, `issue-tracker… | `CLAUDE.md:556-557` | **PACKAGED** | 12 §5.1 — argument construction is the argv form `runArgv('gh', ['pr','merge', String(prNumber), '--merge'])`, so shell-metacharacter injection is not the hazard (07 RUF-322 separately found agent/task-name injection not exploitable). The hazard is the unprompted mutating action set in the same file: `gh pr merge` `:322`, `gh pr close` `:338`, `gh issue close` `:466`, `gh workflow run <id> --ref <ref>` `:565`, `gh run cancel` `:574`, with no CI-status, approval or branch-protection precondition. No lane executed a GitHub mutation (charter) | REJECT | VERIFIED |
| **CLAIM-077** | \| `deployment` \| 5 \| Deployment management (deploy, rollback, status, environments, relea… | `CLAUDE.md:400` | **PACKAGED** | `ruflo deployment deploy` was never run, with or without a dry-run flag, so what it targets and whether it can mutate a remote is unmeasured. 03 §6 records 10 `gcloud` spawn sites in the packaged code — an INFERRED remote-mutation surface that was not exercised | UNKNOWN | UNKNOWN |

### clean removal (3)

| Claim | Claim text (trimmed) | Source | Final maturity | Evidence | Decision | Label |
| --- | --- | --- | --- | --- | --- | --- |
| **CLAIM-056** | Removes project artifacts created by claude-flow/ruflo ... Ruflo-owned subdirectories wit… | `v3/@claude-flow/cli/src/commands/cleanup.ts:2,14-17` | **REFUTED** | 05 §4.4 — `cleanup --force` reverted **56 of 258** changes (21.7%). Surviving: 148 `.claude/commands/**` files, 30 `.claude/skills/**`, 18 `.claude/agents/**`, `.mcp.json` still registering `npx -y ruflo@latest mcp start`, `CLAUDE.md` (9,360 B), `ruvector.db` (1,589,248 B binary in the repo root), the `.gitignore` edit, the global `~/.claude/CLAUDE.md` block, and the `Bash(npx @claude-flow*)` / `Bash(node .claude/*)` / `mcp__claude-flow__*` permission grants plus `"model": "claude-sonnet-5"`. 05 §4.3 — the documented **dry run** creates 4 files, modifies 2, and starts a background daemon it never stops, on both installs | REJECT | VERIFIED |
| **CLAIM-057** | This writes a `CLAUDE.md` with hooks and routing rules, registers the MCP server with Cla… | `docs/STATUS.md:28` | **EFFECTIVE** | All three stated effects were observed, and the statement is materially incomplete. 05 §4.2 — a successful `init` adds **256 files** and modifies `.gitignore` and `~/.claude/CLAUDE.md`. 07 RUF-303 — `init --force` replaces project `settings.json` and `.mcp.json` **wholesale** (settings, hook and third-party-MCP canaries all destroyed) while a pre-existing project `CLAUDE.md` is merged and survives. 07 RUF-309 — plain `init` merges but injects `Bash(node .claude/*)` and `mcp__claude-flow__*` into `permissions.allow` | REJECT | VERIFIED |
| **CLAIM-076** | `ruflo eject` turns a ruflo project into a standalone agent toolkit with its own name. | `README.md:210` | **PACKAGED** | `ruflo eject` was never run, in dry-run or for real, so neither the proposed file set nor `CLAUDE.md:1328`'s "refuses in-repo target" behaviour was observed | UNKNOWN | UNKNOWN |

## 4. Refuted claims

Forty-two of the 90 claims are REFUTED: an execution lane independently checked the claim's own expected
postcondition and found it not met. Each entry gives the claim, then the contradicting observation with the
numbers and `file:line` references the lane recorded. Ruflo's success output appears here only as the thing
being contradicted.

### 4.1 — Reported success over a state that contradicts it

The audit charter's CRITICAL class. In each of these the command printed success, exited 0, and the postcondition was independently checked and found absent. Thirteen claims.

**CLAIM-008** — A lease or work claim coordinates ownership — two processes cannot hold the same claim.  
`CLAUDE.md:75 (and AGENTS.md:71)`

09 §2 (RUF-440, CRITICAL). Six agents claimed six **different** issues concurrently. All six printed `[OK] Claimed issue 30X` and exited 0; `claims.json` held **3**. Surviving ids: `301`, `303`, `306`. Two further trials: `success=6 persisted=4 LOST=2` and `success=6 persisted=3 LOST=3` — 3/3 trials lose claims. The overlap was then proven directly: issue `402`, reported claimed by agent `a2` with exit 0, was re-claimed by `ruflo issues claim 402 --agent coder:INTRUDER`, which also printed `[OK] Claimed issue 402`, and the final `claims.json` owner is `INTRUDER`. Root cause `claim-service.ts:265-286` — the conflict check reads a process-local `Map`, there is no lock, and `:258` persists with a whole-file non-atomic `fs.writeFileSync`. The correct `O_EXCL` + tmp/rename pattern exists in the same tree at `workspace-lease.ts:92-142` and is not used here.

**CLAIM-013** — Declarative persisted workflows with a full state-machine lifecycle (create → run ↔ pause → complete/cancel).  
`plugins/ruflo-workflows/README.md:5`

08 §4.2 (S22–S25, RUF-417/RUF-418). `workflow run -t development --task "probe task"` exits 0 and prints a workflow ID and stage table; `.claude-flow/workflows/store.json` receives `"status": "running", "currentStep": 0, "steps": [{"status": "pending"}]` — and then nothing executes and no terminal status is ever written. Two runs left two permanent zombie `running` records for processes that no longer exist. Those records are invisible: `workflow list` prints `[INFO] No workflows found` (exit 0) with 2 records in the store, because `commands/workflow.js:276-278` sends `status: status || 'all'` and `mcp-tools/workflow-tools.js` applies it as a literal equality filter `w.status === input.status`; `--status running` returns exactly 1, proving the store is readable and the default view is the defect. Resume and duplicate-effect safety remain **UNKNOWN** — no model credentials, explicitly not inferred.

**CLAIM-015** — Autonomous /loop-driven task completion — keeps agents working until all tasks are done.  
`plugins/ruflo-autopilot/README.md:3-5`

08 §4.1 (S20/S21, RUF-409). Autopilot executes nothing: it is a stop-hook gate that re-engages the agent and keeps no effect ledger, so duplicate-effect safety on resume is delegated entirely to a `status` field the agent itself writes. Its completion signal fails open — malformed JSON in the task source produced `ALLOW STOP: No tasks discovered from any source` (exit 0), **byte-identical to the genuinely-empty case**, with `autopilot status` reporting `Tasks: 0/0 (100%)`. A corrupt work queue silently means "done, at 100%". The checkpoint layer itself is sound and is credited: across three separate processes the iteration counter advanced 1 → 2 → 3 with `writeFileAtomic`, and terminal states (`Max iterations (4) reached`, `Autopilot disabled`) are reachable.

**CLAIM-019** — The postinstall applies two documented patches to the user's installed agentdb tree.  
`@claude-flow/cli/package/scripts/postinstall.cjs:3-23`

RUF-001 (coordinator, HIGH). Only `copySiblings` executes. `augmentExports` is defined at `scripts/postinstall.cjs:95` and is never called — `main()` at `:137-151` calls `copySiblings` only. Run against a synthetic agentdb tree it created `dist/{controllers,optimizations,security,services}` while `package.json` remained **byte-identical**: sha256 `83f5a21ce823b50654be6782a7ba698334384fe5fd34ff116521a62c991124b6` before and after. Exit code 0 either way. The six subpath exports the docblock promises — including two security controllers (`AttestationLog`, `MutationGuard`) — stay undeclared, so Node's strict exports enforcement still blocks them.

**CLAIM-022** — Memory that sticks: store something in one session, retrieve it weeks later.  
`README.md:231`

**Two lanes, two different verified failure modes — CONFLICT recorded rather than reconciled.** 05 §2.4 (RUF-201, CRITICAL): process A stores key `K1` and receives `{"success": true, "stored": true, "hasEmbedding": true, "embeddingDimensions": 384}` with `memory_stats` reporting `totalEntries: 1`; a second container on the same mounts reports `totalEntries: 0`, `found: false`, empty `memory_list` and empty `memory_search` — while an independent reader (Node 24's built-in `node:sqlite`, no Ruflo code in the path) opens `.swarm/memory.db` read-only and finds `memory_entries rows=1` with the sentinel content, and `grep -a` matches the raw bytes of the DB and its WAL. 08 §1.2 (S04, RUF-401, CRITICAL): on the sql.js/WASM path the file is **never written at all** — md5 `fd4c18546b2355b801019c3414b2f496` **before and after** the store, and `grep -rl` across the whole container filesystem returns zero files, while the CLI prints `[OK] Data stored successfully` and exits 0. Reproduced in four environments including the fully-native install on musl and a copy of the coordinator's already-initialised Tailered repository. 08 §1.1 (S01) is the counterweight and is credited: on `install-default` + glibc the value survived into a brand-new container with a fresh `HOME`, confirmed by host `sqlite3`. Durability is therefore environment-conditional, selected by a silent runtime try/catch on native-module load, with no error, no warning and no change in exit code (RUF-403).

**CLAIM-030** — Cost tracking with tiered budget alerts and a hard stop at 100%.  
`plugins/ruflo-cost-tracker/README.md:7`

08 §5.2 (RUF-406, HIGH). The component that actually spends money never consults the budget: `headless-worker-executor.js` — which spawns the model-backed workers — contains **zero** references to the policy engine (`grep` for `evaluatePolicyRequest`, `authorizeMcpTool`, `policy`: no matches). Cost arrives after the fact, parsed from the result envelope at `:371` (`costUsd: numOrUndef(obj.total_cost_usd ?? obj.cost_usd ?? obj.totalCostUsd)`). The single policy call site is `mcp-client.js:234`, for outbound MCP tool calls, and its attributes come from `classifyMcpTool()`, which returns `{actionType, network, destructive, namespaceAccess}` and **never** `costUsd` — so configuring a cost budget in enforce mode would deny every MCP tool call as unmetered while still not gating model spend at all. There is no reserve-and-settle and no hard pre-spend ceiling. Separately, 06: the `ruflo-cost-tracker` plugin is one of the 37 plugin directories deleted at publish, so it is in neither tarball.

**CLAIM-035** — Security: AIDefence, input validation, CVE remediation, path traversal prevention.  
`README.md:208`

Three of four conjuncts fail, all VERIFIED in 07. RUF-307 — a controlled fixture pair: `quoted.js` (`"ghp_aaa…"`, `"AKIAIOSFODNN7EXAMPLE"`, `password = "supersecret123"`) → **3 HIGH found**; `unquoted.env` and `unquoted.js` carrying the same GitHub token, the same AKIA id and a real-format AWS secret key → **0 found**, output `No security issues found!`, `Critical: 0 High: 0`, exit 0. Root cause `commands/security.js:172-177`: every pattern demands surrounding quotes (`/['\"]AKIA[A-Z0-9]{16}['\"]/g`), and `.env` files never quote. The quoted control proves the scanner can fire, so this is a false-negative class, not a broken harness. RUF-308 — `memory export --output ../../../tmp/EXPORT_ESCAPE.json` run from `/repo` wrote `/tmp/EXPORT_ESCAPE.json`: an arbitrary-file-write primitive, directly contradicting "path traversal prevention". RUF-310 — AIDefence is absent from every shipped install (see CLAIM-038).

**CLAIM-050** — `ruflo verify` cryptographically proves your installed bytes match the signed witness.  
`README.md:385`

RUF-011 (coordinator, CRITICAL). On a **pristine** `npm install ruflo@3.37.0` with no modifications, `ruflo verify` prints its own summary `pass: 0, drift: 53, regressed: 0, missing: 2` and then `[OK] All fixes verified. Installed artifact matches the signed witness manifest.` with a real exit code of **0**, measured directly and not through a pipeline. The mechanism is in the shipped compiled code: `dist/src/commands/verify.js:201` — `const allOk = sig.manifestHashOk && sig.publicKeyReproducible && sig.signatureValid && regressedCount === 0;` — excludes `driftCount` and `missingCount` from the pass condition by construction, and the `--json` path shares the semantics (`ok: allOk`, `exitCode 0` at `:210`). The signature layer must not be credited either: `verify.js:124` derives the Ed25519 private seed as `createHash('sha256').update(witness.manifest.gitCommit + ':ruflo-witness/v1').digest()`, and both inputs are public, so any party can forge a valid signature over any manifest. One of the two missing entries, `v3/@claude-flow/embeddings/dist/transformers-loader.js`, is a path that cannot exist in an npm install.

**CLAIM-051** — Drift in any fix produces a non-zero exit and a structured error naming the regressed file.  
`docs/STATUS.md:112`

RUF-011. 53 SHA-256 mismatches produced exit **0** and no aggregate warning at all: `verify.js:244` early-returns on `allOk`, which makes the drift warning at `:252` unreachable. RUF-012 (HIGH) adds the second half: the manifest is fetched over the network at verify time from `https://raw.githubusercontent.com/ruvnet/ruflo/{branch}/verification.md.json` with the default branch the literal `fix/issues-may-1-3` (`verify.js:21`, `:139`, `:161`) — a mutable feature branch, not a tag and not `main`. Anyone able to push there redefines what "verified" means.

**CLAIM-052** — An installer can cryptographically prove the installed bytes against a shipped witness.  
`README.md:385`

RUF-012 plus 03 §4 and 06: the `verification/` evidence directory (10 files including per-OS manifests) ships in **neither** published tarball. An npm-only installer therefore holds no local witness data of any kind, so `ruflo verify` must reach the network, and what it reaches is a mutable feature branch. Offline or air-gapped verification is impossible, and the reproducibility a CI gate would need cannot be obtained.

**CLAIM-056** — `ruflo cleanup` removes Ruflo's project artifacts and preserves everything else in `.claude/`.  
`v3/@claude-flow/cli/src/commands/cleanup.ts:2,14-17`

05 §4.4 (RUF-205) and §4.3 (RUF-202, CRITICAL). Ruflo's own report claims `Removed 4 artifact(s) totaling 1.8 MB`. Measured against SHA-256 snapshots of every file under `/repo` and `/root`: **56 of 258 changes reverted — 21.7%**. Surviving: 148 `.claude/commands/**` files, 30 `.claude/skills/**`, 18 `.claude/agents/**`, `.mcp.json` still registering `npx -y ruflo@latest mcp start`, `CLAUDE.md` (9,360 B), `ruvector.db` (**1,589,248 B binary in the repository root**), `.agents/skills/ruflo/SKILL.md`, `~/.claude-flow/update-state.json`, the `.gitignore` edit (not restored), the appended block in the global `~/.claude/CLAUDE.md` (not restored), and inside the surviving `settings.json` the grants `Bash(npx @claude-flow*)`, `Bash(npx claude-flow*)`, `Bash(node .claude/*)`, `mcp__claude-flow__*` plus `"model": "claude-sonnet-5"`. `cleanup` deletes `.claude/helpers/` but leaves the statusline pointing at it, so the `|| D="${HOME}"` fallback now executes the user's **global** helper from a repo that has supposedly uninstalled Ruflo. And the documented **dry run** — which prints "This was a dry run" — created 4 files, modified 2, and started a background daemon it never stops, reproduced on two independent installs.

**CLAIM-070** — Plugins are distributed via IPFS from a pinned CID and registry entries carry an enforced checksum.  
`CLAUDE.md:1444 and CLAUDE.md:1382`

07 RUF-300 (CRITICAL). `discoverRegistry()` falls back to `createDemoRegistryAsync()` on four distinct paths — IPNS failure, IPFS fetch failure, **signature-verification failure**, and any thrown error — and the fallback returns `success: true`. Measured with all five gateways sinkholed: stderr showed five `Gateway … failed: fetch failed` lines and `Fetch failed … on all gateways`, while **stdout** printed `Registry discovered: 21 plugins available`, 20 rows every one marked `Trust: Official`, `Source: claude-flow-official (demo)` and `Registry CID: bafybeiplugin9f7bf92dfab6ad868…` — a content address minted at `dist/src/plugins/store/discovery.js:230` by `crypto.randomBytes(16).toString('hex')`. Exit code 0. The source comment above the signature gate claims "Fail closed on missing/invalid signature"; the code fails **open**, to fabricated data. RUF-319: the demo catalog's integrity metadata is decorative — `sha256:abc123neural`, `sha256:def456security`, `sha256:stu901agents` are placeholder strings, not 64-hex digests.

**CLAIM-073** — Anyone with the same git commit can re-derive the public key and verify the witness independently.  
`verification/README.md:3`

RUF-011 / RUF-L1a-02. The vendor's own sentence is the defect. Because the **seed** — not merely the public key — is `sha256(witness.manifest.gitCommit + ':ruflo-witness/v1')` (`dist/src/commands/verify.js:124`), and the git commit ships inside the manifest while the salt is a hardcoded literal in published code, anyone with the commit re-derives the **private** key and can sign arbitrary content. `verify.js:126` checks `publicKeyReproducible` and presents that reproducibility as a security property. No forgery was executed in this audit; the refutation is read directly from the shipped code.

### 4.2 — Advertised, but absent from or unreachable in the shipped artifact

The capability exists in the repository, the marketing, or both, and cannot be reached from what `npm i ruflo` installs. Nine claims.

**CLAIM-007** — Each agent works in its own git worktree to avoid conflicts.  
`plugins/ruflo-swarm/README.md:17`

09 §7.1. `ruflo --help` exposes `agent`, `swarm`, `hive-mind`, `autopilot`, `route`, `issues` — and **no `worktree` command**. The main CLI's compiled `dist` mentions "worktree" in 16 files but **never invokes `git worktree add`**; its worktree code only observes worktrees. Creation lives solely in `CodexWorktreeCoordinator`, shipped in a different package (`@claude-flow/codex@3.0.3`) nested at `node_modules/@claude-flow/cli/node_modules/@claude-flow/codex`, whose binary `claude-flow-codex` is not linked into the top-level `node_modules/.bin`. Spawning agents through `ruflo` therefore leaves `git worktree list` unchanged, which is precisely the disproof the claim's own postcondition names. Credited: invoked directly by path it works (09 §7.2 — real worktrees, per-agent branches `ruflo/run1/a1`, read-only agents correctly detached), with four defects (worktrees created **outside** the repository at `../.ruflo-worktrees/<repo>/`; `prepare` poisons its own dirty-tree precondition; `cleanup` never deletes the per-agent branches; `integrate()` merges with no conflict handling).

**CLAIM-028** — Multi-provider support: Claude, GPT, Gemini, Cohere, Ollama.  
`README.md:207`

claims.jsonl (lane AUD-L1b): **zero** case-insensitive occurrences of `cohere` — excluding the unrelated word "coherence" — anywhere in the published dist, the bundled `node_modules`, `bin/`, or the repo's CLI source. `ruflo providers list` cannot enumerate a provider that does not exist in the artifact, and `ruflo providers test cohere` has no implementation to reach. 03 §4: the `providers` command carries 8 rows (`dist/src/commands/providers.js:10-19`).

**CLAIM-032** — OpenTelemetry-compatible logging, distributed tracing with parent-child spans, and metrics.  
`plugins/ruflo-observability/README.md:7`

Two independent refutations. 06: `v3/@claude-flow/cli/scripts/prepare-publish.mjs:34-40` deletes and rebuilds `plugins/` at publish, removing 549 of 599 files — `ruflo-observability` is in neither tarball. claims.jsonl (AUD-L1b): **zero** occurrences of `startSpan`, `parentSpanId` or `traceId` anywhere in the published `@claude-flow/cli` dist, and zero occurrences of `observability` as a namespace string. A tracing system that cannot produce a span produces no evidence.

**CLAIM-033** — `observe trace <task-id>` queries the `observability` namespace for spans and builds a trace tree.  
`plugins/ruflo-observability/commands/observe.md:8-11`

Same packaging evidence as CLAIM-032: the plugin defining the command ships in neither tarball (03 §3.4 — exactly one plugin, `ruflo-metaharness`, is published; 06 — the other 37 are deleted at publish), and no `observability` namespace string or span primitive exists in the dist. There is no namespace to dump and no parent/child record to build a tree from.

**CLAIM-038** — AIDefence detects prompt injection, jailbreak attempts, and adversarial content.  
`plugins/ruflo-aidefence/README.md:14`

07 RUF-310 (HIGH). `@claude-flow/aidefence` is **ABSENT** from `install-default`, `install-noscripts` and `install-nooptional` — present only in the upstream repo as `plugins/ruflo-aidefence`. It is not a declared dependency of `@claude-flow/cli` in any form, and Ruflo's own `doctor` confirms at runtime: `⚠ AIDefence: @claude-flow/aidefence not loadable — aidefence_* MCP tools will fail (optional package)`. The maturity ladder terminates early: ADVERTISED → IMPLEMENTED → **✗ PACKAGED**, therefore never REACHABLE and never EFFECTIVE. Corroborating behaviour, 07 RUF-307: a blatant prompt-injection payload in `inject.md` produced **0 findings** from the scanner that does ship.

**CLAIM-041** — PII detection flags emails, SSNs, API keys and other sensitive data.  
`plugins/ruflo-aidefence/README.md:15`

07 RUF-310. The comparison the claim's postcondition requires cannot be performed in any shipped install, because one side of it does not exist: `aidefence_has_pii` is unreachable in `install-default`, `install-noscripts` and `install-nooptional`, and `doctor` states the `aidefence_*` MCP tools will fail. The federation plugin's 14-pattern pipeline is a separate, unexercised surface (CLAIM-040, untested).

**CLAIM-046** — Automated test scaffolding for uncovered modules.  
`plugins/ruflo-testgen/README.md:16`

05 §2.2 — the live 333-tool roster, taken over real JSON-RPC stdio, contains no `testgen` prefix at all (`hooks 44 · wasm 27 · agentdb 20 · metaharness 16 · memory 15 · workflow 12 · claims 12 · …`). 03 §3.2 and 12 RUF-L6b-08 give the mechanism: `testgen_tdd_repair` is exported from `dist/src/mcp-tools/index.js:31` but absent from the registry — one of exactly 5 packaged-but-never-registered tools. Zero reachable test-generation tools.

**CLAIM-047** — ruflo-testgen finds missing tests and generates them automatically.  
`README.md:116`

As CLAIM-046, with the packaging layer added: 06 — the `ruflo-testgen` plugin is one of the 37 plugin directories deleted by `prepare-publish.mjs:34-40`, so it is in neither tarball. No test file could be emitted, executed under a runner, or negative-tested against a broken implementation.

**CLAIM-060** — 33 native Claude Code plugins + 21 npm plugins.  
`README.md:206`

03 §3.4. **38** plugin directories exist under `plugins/`, each with a `.claude-plugin/plugin.json`; `.claude-plugin/marketplace.json` lists **35** of them (three — `ruflo-agntcy`, `ruflo-bbs-federation`, `ruflo-business-pods` — are in the tree but not the manifest); the separate `v3/plugins/` tree holds **15** npm packages, not 21; and **exactly one** plugin, `ruflo-metaharness`, ships in the published `@claude-flow/cli` tarball. 06 confirms the mechanism and the magnitude: 549 of 599 plugin files are removed at publish time.

### 4.3 — Counts, versions and measurements that do not reproduce

Independently recounted or re-measured, and different. Sixteen claims.

**CLAIM-001** — 100+ specialized agents.  
`README.md:26`

03 §3.1. Independently counted: the published `@claude-flow/cli` tarball's `.claude/agents/**` holds **89** `.md` files with valid frontmatter across **81 unique `name:` values**, plus 1 more inside the single packaged plugin — **90 agent definition files, 81 unique names, in the package `npm i ruflo` installs.** The 108-file/97-name figure is the repository root, which is not published, and the two sets are not nested (9 names are package-only, 25 are root-only, including `coder`, `researcher`, `reviewer`, `tester`). Five mutually inconsistent counts ship together in the same artifact: 100+, 98, 60+, 45, 44.

**CLAIM-002** — Full Ruflo loop — 98 agents, 60+ commands, 30 skills, MCP server, hooks, daemon.  
`README.md:57`

03 §3.1–3.5, all three numbers independently recounted: **81** unique agent names (not 98); **53** top-level CLI commands, being the keys of `commandLoaders` in `dist/src/commands/index.js:15-97` (not "60+"); **34** packaged skill directories of which **33** contain a `SKILL.md` (not 30 — `.claude/skills/dual-mode/` ships no `SKILL.md`). The remaining three items of the list do hold and are credited: the MCP server answers a real handshake (05 §2.1), 16 hook commands are installed (05 §1.1), and the daemon is a real detached process (05 §3).

**CLAIM-004** — Deploy 60+ specialized agents in coordinated swarms (npm registry description).  
`work/extract/ruflo/package/package.json:4 (published ruflo@3.37.0 tarball)`

03 §3.1 — 90 agent files / 81 unique names ship, so the count is wrong in the registry metadata itself. The verb is the larger problem: 03 §4 and claims.jsonl establish that the `agent_spawn` handler calls `loadAgentStore()`/`saveAgentStore()`, writes `.claude-flow/agents.json`, and starts no process — consistent with Ruflo's own `AGENTS.md:114` ("Claude-flow does NOT execute code!") and `AGENTS.md:178` ("They create coordination RECORDS only"). "Deploy" is not satisfiable by a JSON write.

**CLAIM-016** — 12 auto-triggered background workers (audit, optimize, testgaps, etc.).  
`README.md:205`

05 §3 and 10 §7.3, measured from the OS rather than from `hooks worker status`. `dist/src/services/worker-daemon.js:30-40` declares **9** worker types and the running daemon schedules **7**: `map` 900 s, `audit` 600 s, `optimize` 900 s, `consolidate` 1800 s, `testgaps` 1200 s, `backup` 86400 s, `harness` 21600 s (`predict` and `document` are disabled). The daemon itself is real and is credited — PID 36 with PPID 1 confirmed by `ps`, no listening sockets, a working duplicate-start lock, a clean `stop`, 4.20 CPU-seconds over a 418 s window and a 102,948 KB peak RSS. A third count exists: the packaged `.claude/settings.json` declares 3 workers, which the daemon ignores (05 §3 defect 3).

**CLAIM-029** — 5 LLM providers with failover, against Anthropic-only alternatives.  
`README.md:339`

The enumeration fails for the reason in CLAIM-028 — one of the five named providers exists nowhere in the artifact. Failover itself was never demonstrated and is recorded as UNKNOWN (07 §4: no API credentials exist in any container and none may be created). What was verified is adjacent and worse: 07 RUF-304 — provider selection is made from the ambient environment (`useOpenRouter = explicitProvider === 'openrouter' || (!anthropicKey && !!openrouterKey)`, `agent-execute-core.js:71-106`), and the result shape `AnthropicCallResult` carries **no provider field and no endpoint field**, with the module stating the intent outright: "Response shape is normalized … so existing callers don't need to know which provider answered." Given a successful result, which vendor served it is unrecoverable.

**CLAIM-053** — `ruflo` is a thin wrapper; users invoke it as `npx ruflo <command>` at a pinned version.  
`SKILL.md:8`

RUF-007 (coordinator, HIGH) — `ruflo@3.37.0` depends on `@claude-flow/cli` through the caret range `^3.33.0`, so the pin does not pin the implementation. A clean install of the pinned version resolved `agentdb 3.0.0-alpha.20` (declared `^3.0.0-alpha.17`), `better-sqlite3 12.11.1`, `ruvector 0.2.41` (declared `^0.2.27`) and `agentic-flow 3.0.0-alpha.2` across 785 packages; multiple load-bearing dependencies are alpha-versioned. "Thin" fails independently: 03 §1 — **499 of 526 files (95%)** are a vendored fork of HuggingFace `chat-ui@0.20.0` with 43 runtime and 49 dev dependencies of its own, a Dockerfile, a 13-template Helm chart, 10 GitHub Actions workflows and a 4.5 MB-class WASM asset, and `bin/ruflo.js` contains no reference to any of it. The workable pinning form is set out in 11 Q25: depend on `@claude-flow/cli@3.37.0` directly, commit a lockfile, install `--ignore-scripts`, and re-declare the 33 `overrides`, which are inert when `ruflo` is a dependency (RUF-L6a-11).

**CLAIM-058** — You don't need to learn 314 MCP tools or 26 CLI commands.  
`README.md:38`

05 §2.1–2.2 — a live `tools/list` over real JSON-RPC stdio returned **333** tools; the same README advertises 314, 210, 210, 112+ and 103 on five different lines, and none matches. 03 §3.2 reconciles the packaged surface: 361 tool definitions, **356 registered**, 333 unconditionally, 23 conditional on the external `agent-browser` binary, 5 packaged but never registered. 03 §3.3 — **53** top-level CLI commands, not 26, with 387 subcommand entries beneath them.

**CLAIM-059** — 17 self-learning hooks + 12 background workers.  
`CLAUDE.md:387 and CLAUDE.md:728`

05 §2.2 — in the live roster `hooks` is the largest prefix at **44** tools. 03 §3.3 — the `hooks` command carries 42 subcommand entries, the densest in the CLI. 05 §3 and 10 §7.3 — **7** workers are scheduled, not 12. **CONFLICT recorded:** the `hooks_*` tool count itself differs across lanes — 41 packaged handlers (03 §4), 43 packaged handlers (claims.jsonl, AUD-L1b), 44 in the live roster (05 §2.2). The discrepancy is not adjudicated here; what all three agree on is that no figure approaches 17.

**CLAIM-061** — `docs/STATUS.md` is the is-it-ready document: what currently works.  
`README.md:381`

The document presented as current snapshots `ruflo@3.10.2` / `@claude-flow/cli@3.10.1` — 27 minor releases behind the audited 3.37.0 — and every capability count and test baseline in it describes that older release. 07 RUF-317 closes the gap: `CHANGELOG.md` at `6ce18b5` has an empty `[Unreleased]` heading and a newest entry of `[3.34.0] - 2026-07-31`, so **no document in the shipped artifact describes the shipped version**.

**CLAIM-062** — `SKILL.md` states the current version is 3.31.0 (published as `ruflo@latest`).  
`SKILL.md:80-82`

The installed `SKILL.md` self-reports **3.31.0** inside a **3.37.0** release, and an agent reading it as authority also inherits its "314+ MCP tools" figure (refuted at CLAIM-058). It is not an isolated slip: 06 — `.claude/helpers/helpers.manifest.json` declares `3.34.0` with one Ed25519 signature in the tagged source and `3.37.0` with a *different* signature in the tarball, and `.helpers-version` reads `3.32.29` in source versus `3.33.0` in the tarball; 10 §7.2 — `statusline.cjs:839` hardcodes `let ver = "3.32.8"` and renders `RuFlo V3.32.8` on the fallback path. The shipped artifact self-reports at least four different versions of itself.

**CLAIM-063** — The CHANGELOG records the release history (newest entry 3.34.0).  
`CHANGELOG.md:10,33,53`

07 RUF-317. At the audited SHA there is **no `## [3.35.0]`, `## [3.36.0]` or `## [3.37.0]` heading** — including for the release under audit, which upstream titles "proxy install hardening, cloud routing disclosure, tier pinning". `[Unreleased]` is empty and only 8 version headings exist for a project claiming 5,800+ commits. A consumer cannot learn from the shipped changelog what changed in the version they installed, and the release that changed a security-relevant routing default is one of the three undocumented ones.

**CLAIM-064** — SECURITY.md supported versions: 3.5.x supported; 3.0–3.4 and 2.x not.  
`SECURITY.md:5-9`

The table in the shipped `SECURITY.md:5-9` names `3.5.x` and no 3.3x line at all, so the currently shipping release is not named by its own security policy, and whether 3.37.0 receives security fixes cannot be answered from the artifact. The consequence is not theoretical: 07 RUF-311 measured **41 known vulnerabilities** in the installed 3.37.0 tree (1 critical, 13 high, 27 moderate), and 07 RUF-317 shows three releases including this one are undocumented.

**CLAIM-065** — Production-ready security: prompt-injection protection, input validation, path traversal prevention, command-injection blocking, safe credential handling.  
`docs/USERGUIDE.md:231`

07 RUF-311 — `npm audit --package-lock-only` on the installed tree: **1 critical, 13 high, 27 moderate = 41** advisories over **785 packages**, the critical being `protobufjs <7.5.5` arbitrary code execution (GHSA-xq3m-2v4x-88gg); flagged packages include `@claude-flow/cli`, `agentdb`, `agentic-flow`, `@huggingface/transformers` and `onnxruntime-node`. The 3.5.0 release notes claim "0 Production Vulnerabilities: Clean `npm audit` across all packages"; that is not the state of 3.37.0. The components delivering the claim are themselves prereleases — `@claude-flow/security@3.0.0-alpha.14`, `@claude-flow/mcp@3.0.0-alpha.8`, `@claude-flow/neural@3.0.0-alpha.9` — and the two named protections that were tested both fail (RUF-307 secret scanning, RUF-308 path traversal), while the third is not installed at all (RUF-310). Credited: command injection via agent/task names was tested and is **not** exploitable (RUF-322), and SQL is genuinely parameterised (RUF-323).

**CLAIM-066** — Ruflo v3 is built on agentic-flow, a production-ready AI agent orchestration platform.  
`docs/USERGUIDE.md:4869`

RUF-007 — the clean install of the pinned version resolved **`agentic-flow 3.0.0-alpha.2`**. The two manifests in the same release train disagree about which major version that even is: the root umbrella pins `^2.0.14` while `@claude-flow/cli` pins `^3.0.0-alpha.1`. 07 RUF-311 lists `agentic-flow` among the advisory-flagged packages. An alpha resolution reached through a caret range on a prerelease does not support "production-ready".

**CLAIM-069** — HNSW vector memory with sub-millisecond retrieval.  
`README.md:335 (also docs/USERGUIDE.md:459 'HNSW vector memory with sub-ms retrieval + knowledge graph'; docs/USERGUIDE.md:726 'Search Algorithm: HNSW (sub-millisecond)')`

10 §5, measured over real JSON-RPC stdio, 20 searches at each corpus size: `memory_search` p50 **8.867 ms** at N=10, **20.419 ms** at N=100, **77.084 ms** at N=1,000 (p95 24.970 / 52.598 / 118.115 ms). Not sub-millisecond at any size, and the end-to-end figure a user actually experiences is worse: 05 §2.4 observed one `memory_search` in a fresh process taking **29,979 ms**, because the HNSW index is rebuilt per process. "Sub-ms" is an inner-loop figure that no user-visible path reaches.

**CLAIM-081** — STATUS.md: 323 MCP tools, sourced from `verification/inventory.json`.  
`docs/STATUS.md:49,63`

The cited source does not support the number — `verification/inventory.json` records **305**. Neither figure matches the measured surface: 03 §3.2 — 356 registered, 333 unconditional, from a walk of every `inputSchema:` back to its `name:` in the packaged dist; 05 §2.1 — **333** in a live `tools/list`. The generator that produces the competing 397 figure is reproducible and methodologically wrong: it regexes `name:` strings out of `src/mcp-tools/*.ts`, sweeping in 39 non-tools (`disk`, `memory`, `topology`, `pre-task`, …) while missing 3 real tools defined outside the directory it scans (03 §3.2).

### 4.4 — Guarantees that are advisory rather than enforced

The mechanism exists and does not bind. Four claims.

**CLAIM-034** — ADR-052 Statusline Observability System — the statusline reads local files.  
`docs/USERGUIDE.md:3130`

"Reads only local files" does not hold on any of three counts. 05 §1.7 — `statusline.cjs` reads the user's **global** `~/.claude.json` (projects, MCP servers, `lastModelUsage`). 07 RUF-306 — the content it renders is fetched from `https://funnel.ruv.io/v1/messages` by `refreshRemoteMessages()`, which has **no `hasConsent()` call anywhere in its path**, is wired to fire from the `SessionStart` hook that `init` installs (`hook-handler.cjs:99` → `spawnDetachedHookRefresh('refresh-funnel')`), and is unsigned by the module's own admission. 10 §7.2 — the render itself `execSync`s the CLI with `{timeout: 8000}` over a candidate list ending in `npx --prefer-offline @claude-flow/cli`, costing p50 **8,270.6 ms** per render when ruflo is not project-resolvable versus **70.8 ms** when it is — a 117× difference that is **identical with `--network none`**, and the slow topology is the one Ruflo's own generated `.mcp.json` prescribes. It also renders a sponsor row into the developer's IDE chrome (RUF-510).

**CLAIM-037** — Zod input validation for **all** public API inputs; parameterised SQL; PathValidator; SafeExecutor.  
`SECURITY.md:48-51`

A universal claim falls to one counter-example, and 07 supplies two. RUF-323 — memory keys `../../escape-key` and namespaces `../../../tmp/nsescape` and `/tmp/absns` were all accepted with `[OK] Data stored successfully` and **no validation whatsoever**; the lane's own wording is "Input validation is absent, but the traversal is not exploitable *through this surface*" — they land as parameterised SQLite column values. RUF-308 — `memory export --output` applies no `PathValidator` and writes outside the project root. Credited, because the same tests establish it: SQL really is parameterised, and `SafeExecutor`-class protection holds for agent and task names (RUF-322).

**CLAIM-089** — Never run two writers in one worktree; delegation may only reduce; policy denial cancels dependent work before side effects.  
`AGENTS.md:54-57`

Policy denial is advisory by default, not enforced. 08 §5.2 — the policy state Ruflo writes unprompted is `{"version":1,"mode":"legacy","rules":[],"budgets":[],"usage":[],"approvals":[],"receipts":[]}`, `engine.js` ranks `legacy=0, observe=1, enforce=2`, and **every budget violation returns `enforcedOutcome: 'allowed'` unless `mode === 'enforce'`** — and the mode cannot be changed from automation, because `commands/policy.js:18` requires `process.stdin.isTTY && process.stdout.isTTY` and refused in both a plain container run and `docker run -t` (RUF-408). 05 §1.3 — the one denial surface that was driven end-to-end prints `[BLOCKED] Dangerous command detected: rm -rf /` and exits **1**, and Claude Code blocks a `PreToolUse` hook only on exit **2**, so the command proceeds; 05 §1.4 verified that **no** installed hook can exit 2, making the `[BLOCKED]` message unachievable by construction. 09 §2 — "never run two writers" is likewise unenforced (RUF-440).

**CLAIM-090** — Ruflo records work; it does not perform the implementation — no MCP tool creates an OS process beyond the daemon's `claude --print`.  
`CLAUDE.md:20-22 (mirrored at AGENTS.md:31-32 and AGENTS.md:178)`

The vendor's own scoping statement is contradicted by its own shipped tools. 12 §5.1 — `github_pr_manage` action `merge` executes `runArgv('gh', ['pr', 'merge', String(prNumber), '--merge'])` (`dist/src/mcp-tools/github-tools.js:322`) with no CI-status, approval or branch-protection precondition, and the same file carries `gh pr close` (`:338`), `gh issue close` (`:466`), `gh workflow run <id> --ref <ref>` (`:565`) and `gh run cancel` (`:574`). In the agent platform, where merging to `main` **is** a production deploy, that is implementation of the most consequential kind. 03 §6 — packaged code spawns `gcloud` (10 sites), `gh` (8), `git` (5), `npx` (4), `npm` (4), `systemctl` (3), `launchctl` (3), `docker` (2), `claude` (2), `agent-browser` (2), `python3` (1), `powershell` (1). 12 RUF-L6b-03 compounds it: when `gh` is unavailable the tool returns `{success: true, source: 'local-store', action: 'merged'}`, distinguished from a real merge only by an absent `_real: true` flag.

## 5. Claims that could not be tested

Thirty-four claims carry decision `UNKNOWN`. Each keeps the source-level maturity lane AUD-L1b assigned it,
or the higher level an adjacent execution observation supports, and none is treated as either confirmed or
refuted. Four blockers account for almost all of them: the charter forbids paid model calls, forbids real
provider credentials, forbids standing up external systems (so no second federation host, no multi-host
fixture), and the vendor publishes no dataset behind its accuracy figures. The spike lanes noted in the
method section are still outstanding and may close some of these.

| Claim | Area | Final maturity | Blocking reason |
| --- | --- | --- | --- |
| **CLAIM-005** | swarm topologies | REACHABLE | The behavioural half of the postcondition — an observable difference between topologies — needs a multi-agent run, which needs model calls. `swarm init` itself was reached (07 §1.2). |
| **CLAIM-006** | swarm topologies | PACKAGED | No lane spawned agents against a capped swarm, so `maxAgents` enforcement was never driven; swarm coordination is UNKNOWN in 09 §14 for want of model calls. |
| **CLAIM-009** | inter-agent communication | ADVERTISED | No lane grepped the installed tree for a Ruflo-side `SendMessage` transport definition, which is the whole of the claim's postcondition. |
| **CLAIM-010** | inter-agent communication | PACKAGED | Requires two independent Ruflo installs on two hosts and a receiver-side audit read. No multi-host fixture existed and the charter forbids standing up external systems (09 §14). |
| **CLAIM-011** | consensus | PACKAGED | Byzantine tolerance requires N≥4 participants in separate processes with an adversarial voter. Exercising hive-mind requires model calls, which the charter forbids (09 §14). |
| **CLAIM-012** | consensus | PACKAGED | Requires feeding one identical vote sequence to five strategies and diffing the consensus histories; same blocker as CLAIM-011. |
| **CLAIM-014** | workflow persistence and resumption | REACHABLE | The `session-restore` handler was invoked (05 §1.4, exit 0) but nobody ran the marker round-trip — save a nonce, terminate, restore in a new process, read the restored store directly. |
| **CLAIM-017** | background loops | PACKAGED | `aiWorkersEnabled` is `false` by default (10 §7.3), so no autonomous `claude --print` was ever launched and the per-hour launch ceiling and its receipts could not be driven. 09 §14 records `global-ai-budget` as read but not exercised. |
| **CLAIM-018** | AgentDB persistence | PACKAGED | No speedup could be computed at all: 10 §5/§12 established that no brute-force baseline exists in-tree to divide by. Absolute latency and its scaling were measured instead. |
| **CLAIM-021** | RAG | PACKAGED | No lane tested hybrid (BM25-reachable) retrieval, 2-hop graph traversal, or diversity ranking; only single-vector `memory_search` was exercised. |
| **CLAIM-023** | cross-session memory | PACKAGED | 05 §1.1 confirmed the `SessionStart` group declares `auto-memory-hook.mjs import`, but no lane confirmed an AgentDB row inside a session window or enumerated which files the `allProjects` path reads. |
| **CLAIM-027** | model routing | REACHABLE | The zero-egress conjunct is satisfied for `route` (07 §1.2, zero DNS and zero TCP at the sinkhole), but the three codemods were never applied to a fixture and "$0 structurally guaranteed" was never tested. |
| **CLAIM-031** | budget enforcement | PACKAGED | Requires a 3-hop delegation chain across federation nodes and a receiving-node audit read; no federation node was started (charter). |
| **CLAIM-036** | security scanning | PACKAGED | No lane ran `security scan --type container`, so the claimed rejection was never observed. The adjacent half is answered adversely by RUF-307/RUF-327. |
| **CLAIM-039** | prompt-injection protection | PACKAGED | No lane called `terminal_create` with `LD_PRELOAD`, `NODE_OPTIONS` or any other denylisted variable, and the other child-spawning paths were not probed for the same filter. |
| **CLAIM-040** | PII protection | PACKAGED | Coverage requires a held-out PII corpus and an exercised outbound federation path; neither was run. |
| **CLAIM-042** | federation | PACKAGED | Proving mutual TLS requires capturing a handshake between two peers and observing a `CertificateRequest` and a client `Certificate` message. No federation node was started (charter). |
| **CLAIM-043** | federation | PACKAGED | No lane located the weighted-sum implementation or drove a peer's success rate down, so neither the coefficients nor any access change on downgrade was observed. |
| **CLAIM-048** | MetaHarness grading | PACKAGED | `metaharness score` was never run, so neither determinism across two identical runs nor the ADR-150 `{degraded:true}` path with the optional packages absent was observed. |
| **CLAIM-068** | AgentDB persistence | REACHABLE | The CLI half is verified (05 §2.1, 333 tools over real stdio); the plugin-only install path was never exercised, so the "No" half of the comparison is untested. |
| **CLAIM-071** | self-learning | PACKAGED | The ruvllm code path was never exercised, so the residency claim was not tested. Egress to `funnel.ruv.io`, `gateway.pinata.cloud` and four other IPFS gateways was verified from *other* commands (07 §1.1). |
| **CLAIM-074** | consensus | PACKAGED | `.claude-flow/hive/*.json` was never inspected for a node or peer set. INFERRED only, from 03 §6 (one ephemeral loopback listener in the whole dist) and 05 §3 (daemon binds no sockets). |
| **CLAIM-075** | autopilot | ADVERTISED | Prompt-cache retention is a provider property observable only in `usage` fields on paid calls; the charter forbids paid model calls. |
| **CLAIM-076** | clean removal | PACKAGED | `ruflo eject` was never run, in dry-run or for real, so neither the proposed file set nor the claimed in-repo refusal was observed. |
| **CLAIM-077** | GitHub integration | PACKAGED | `ruflo deployment deploy` was never run. 03 §6 records 10 `gcloud` spawn sites in packaged code — an INFERRED remote-mutation surface that was not exercised. |
| **CLAIM-078** | number and specialization of agents | PACKAGED | `npx skills add ruvnet/ruflo --all` was never executed. Independent counts (03 §3.4–3.5: 136 plugin `SKILL.md`, 34 packaged skill dirs, 39 repo-root skill dirs) do not reproduce 267, but the installer's own output was never measured. |
| **CLAIM-080** | package reproducibility | IMPLEMENTED | No lane installed both dependency trees and re-ran Ruflo's vitest suite at 3.37.0. 10 §6.4 ran only the repo's `tests/docker-regression` shell suite, a different artifact. |
| **CLAIM-082** | federation | PACKAGED | `federation init` was never run, so the key material generated, its location and its file mode are unmeasured. The claim also contradicts CLAIM-042 in the same README. |
| **CLAIM-083** | number and specialization of agents | PACKAGED | The hosted browser gallery was never loaded and no egress from it was characterised. 05 §2.1 measured the CLI's own roster (333), a different surface. |
| **CLAIM-084** | package reproducibility | ADVERTISED | Download and clone counts were never re-derived from `api.npmjs.org/downloads` or GitHub's traffic API; the only real outbound traffic in the audit was registry metadata resolution (07 §0). |
| **CLAIM-085** | package reproducibility | ADVERTISED | The comparator harness lives on the feature branch `perf/sota-comparator-benchmarks`, never fetched, and no competitor framework was installed. 10 §2's cold-start figures are Ruflo-only and not like-for-like. |
| **CLAIM-086** | SONA or adapter learning | REACHABLE | `neural status` runs offline (07 §1.2), but whether the MoE gate changes which model or agent is actually selected on a held-out task set requires model calls. |
| **CLAIM-087** | AgentDB persistence | EFFECTIVE | The `off` half is verified (07 RUF-314: plaintext recovered with `strings`; `doctor` reports "Encryption at Rest: Off"). The `CLAUDE_FLOW_ENCRYPT_AT_REST=1` path, the `RFE1` magic bytes and the no-plaintext-remains check were never exercised. CONFLICT with the claim's "mode 0600": `.swarm/agentdb-memory.db` and sidecars are **0644**. |
| **CLAIM-088** | federation | PACKAGED | No federation node was started, so no unauthenticated-peer reachability probe was possible and no individual zero-trust property was confirmed or excluded. |

Two of these deserve a note beyond the table. **CLAIM-018** is untestable in a specific and instructive
way: the claim is a *speedup*, and 10 §12 established that no brute-force baseline exists anywhere in the
tree to divide by, so the number is not merely unverified — it is not computable from the artifact by anyone,
including the vendor. **CLAIM-087** is the only `UNKNOWN` row that also carries a verified contradiction: the
default-plaintext disclosure is accurate and was reproduced, while the accompanying "mode 0600" assertion is
contradicted by a world-readable `0644` database sitting beside the correctly-permissioned one (07 RUF-314).

## 6. What this matrix does not resolve

- **The spike lanes.** `13-integration-spikes.md` and `13-integration-spikes-bcde.md` are absent. Their
  subjects — process-agent adapter shape, subordinate memory, output-only swarm, cost accounting, and
  observability mapping — bear directly on CLAIM-014, CLAIM-017, CLAIM-021, CLAIM-023 and CLAIM-031.
- **The four recorded conflicts.** CLAIM-020, CLAIM-022, CLAIM-059 and CLAIM-087 each carry two lane
  observations that do not agree. Both are recorded in the row; none is adjudicated here.
- **The `RUF-3xx` identifier collision** between the license lane (AUD-L3a) and the security lane (AUD-L3b).
  This matrix disambiguates by writing `AUD-L3a RUF-3xx` in full where it cites the license lane, but the
  underlying numbering is still ambiguous in the evidence set.
- **Anything requiring money.** No claim in this matrix was resolved against a paid model call, a real
  provider credential, or a second host. Every `UNKNOWN` in §5 is a live question, not a closed one.
