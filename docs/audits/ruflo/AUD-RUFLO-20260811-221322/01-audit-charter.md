<!-- audit: {"audit_id":"AUD-RUFLO-20260811-221322","tailered_sha":"6172653e0aca0981d0abaf4ad8e9d587667737e9","ruflo_release":"v3.37.0","ruflo_sha":"PENDING_ACQUISITION","generated":"2026-08-11T22:13:22Z","evidence_class":"VERIFIED","lane":"coordinator","caused_by":["gh-audit-ruflo.md"]} -->

# 01 — Audit charter

## Objective

Determine whether individual Ruflo capabilities should be adopted, adapted, studied, or
rejected for the Tailered AI agent platform implemented in `prez-tailered-ai/tailered-ai`, which is
the sole first-party repository in scope — while preserving Tailered's
company-as-code format, deterministic controls, process-agent boundary, reserve-and-settle
budget authority, stateless model router, append-only causal ledgers, constitutional
critique, and founder-controlled irreversible-action gates. The master specification is
`gh-audit-ruflo.md` (audit prompt, 2026-08-11). Repository precedence: `AGENTS.md` >
`docs/v1-contract.md` > `docs/platform-brief.md` > `docs/full-system-blueprint.md` /
`docs/blueprint-execution.md` > executable source and tests. This audit cannot override
the repository constitution.

## Identity

| Item | Value |
| --- | --- |
| Audit ID | `AUD-RUFLO-20260811-221322` |
| Host repo | `prez-tailered-ai/tailered-ai` (public, MIT-licensed upstream target; host repo Apache-2.0) |
| Tailered baseline SHA | `6172653e0aca0981d0abaf4ad8e9d587667737e9` (= `origin/main` at audit start; matches the SHA recorded in the master spec) |
| Active checkout | `~/src/tailered-ai`, branch `main`, clean tree — preserved untouched |
| Audit worktree | `/tmp/aud-ruflo-20260811/tailered-ai-audit`, branch `audit/ruflo-qualification-20260811` |
| Ruflo target (stable) | `v3.37.0` (npm `latest` at audit start; released 2026-08-11T17:07:54Z) |
| Ruflo target (delta) | `main` at acquisition time (delta review only) |
| Audit start (UTC) | 2026-08-11T22:13:22Z |

## Prior evidence incorporated

A separate Ruflo **3.36.0** investigation (different scope, outside this repository) was checkpointed
earlier on 2026-08-11 at `~/Documents/tailered-os-research/ruflo-adoption-2026-08-11/`.
Its verified findings carry into this audit as prior evidence, re-verified against 3.37.0
where material: (a) npm `ruflo` is a thin wrapper over `@claude-flow/cli` — audit the CLI;
(b) the init *upgrade* path injects SessionStart/SessionEnd hooks while the *fresh-init*
path writes zero hooks yet prints "Hooks: 7 hook types enabled"; (c) init skips an
existing `.mcp.json`, leaving the MCP execution surface unregistered while installing 108
files that coordinate through it; (d) provenance concern — Ruflo wrote unpinned,
unattributed content into provenance-controlled config trees.

## Fixed operating boundaries (enforced)

No `ruflo init` in any active checkout; no global installs; no mutable package tags; no
global config mutation; no uncontrolled daemons left running; no credentials exposed; no
production network calls; no writes to `main`; no merges; no ADR rewrites; no synthetic
rows in canonical Tailered ledgers; Ruflo self-verification is never independent
evidence. All Ruflo installation, initialization, databases, caches, and generated
projects live in disposable directories under `/tmp/aud-ruflo-20260811/` or disposable
Docker containers. Paid model calls are forbidden; provider behavior observed only via
fixtures/mocks is labeled `INFERRED`.

## Known environment deviations (declared up front)

1. **Node 24 vs local Node 22.22.0.** `package.json` declares `engines.node >=24`; the
   local toolchain has Node v22.22.0 only. The canonical baseline therefore runs inside
   disposable `node:24` Docker containers (matching CI); a supplementary local Node 22
   pass is captured and labeled as such.
2. **No GitHub push permission.** The authenticated `gh` account has `push: false` on
   `prez-tailered-ai/tailered-ai`. Per the master spec, the audit branch and commit are
   left ready locally and the exact push + draft-PR commands are reported.
3. **No Rust toolchain** (`cargo` absent). Ruflo Rust-crate tests, if any, run only where
   a container image provides the toolchain; otherwise those cells are `UNKNOWN`.
4. **Host resources.** 8 GB RAM, ~34 GB free disk, arm64 (Apple Silicon). Heavy
   concurrency scenarios are bounded accordingly and the bound is recorded where it
   truncates a test.

## Execution model

Coordinator (this session) plus bounded lanes with non-overlapping artifact ownership:

| Lane | Task ID | Owns artifacts |
| --- | --- | --- |
| Claims & capability inventory | AUD-L1 | `03-ruflo-capability-inventory.md`, `04-claims-to-evidence-matrix.md`, `evidence/claims.jsonl`, `evidence/capability-results.json`, `evidence/package-inventory.json` |
| Architecture, packaging, runtime | AUD-L2 | `05-architecture-and-runtime-map.md`, `06-build-package-and-ci-audit.md`, `evidence/full-init-file-diff.patch`, `evidence/full-init-process-diff.json`, `evidence/source-package-parity.json`, `evidence/test-results.json` |
| Security, privacy, supply chain | AUD-L3 | `07-security-privacy-and-supply-chain.md`, `evidence/license-inventory.json`, `evidence/network-observations.jsonl`, `evidence/provider-provenance.json` |
| Reliability, persistence, concurrency | AUD-L4 | `08-reliability-and-data-integrity.md`, `09-concurrency-and-isolation.md` |
| Performance & cost | AUD-L5 | `10-performance-and-cost.md`, `evidence/benchmark-results.json` |
| Tailered compatibility & agent platform | AUD-L6 | `11-tailered-compatibility.md`, `12-agent-build-and-deployment-applications.md` |
| Spikes | AUD-L7 | `13-integration-spikes.md`, `spikes/**` |
| Coordinator | AUD-L0 | `00`, `01`, `02`, `14`, `15`, `16`, `proposed-adr.md`, `evidence/audit-manifest.json`, `evidence/environment.json`, `evidence/commands.jsonl`, `evidence/findings.jsonl`, `evidence/file-hashes.json`, `evidence/process-inventory.json`, `evidence/blocked-items.json` |

Findings use IDs `RUF-###`; severities `CRITICAL/HIGH/MEDIUM/LOW/INFO`; every material
conclusion is labeled `VERIFIED`, `INFERRED`, or `UNKNOWN` per the maturity ladder
(ADVERTISED → IMPLEMENTED → PACKAGED → REACHABLE → EFFECTIVE → DURABLE → GOVERNABLE).
