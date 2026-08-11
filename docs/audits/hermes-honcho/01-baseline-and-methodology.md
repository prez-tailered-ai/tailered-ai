# 01 — Baseline and methodology

Audit of **NousResearch/hermes-agent** and **plastic-labs/honcho** as candidate
contributors to Tailered AI, Tailered OS, and Dime AI.

Conducted 2026-08-11. Read-first, evidence-first. No upstream code was installed into
any Tailered or Dime dependency graph, and neither upstream repository was modified.

## Frozen baseline

Every conclusion in this audit is anchored to these three immutable commits. No finding
cites a moving branch.

| Role | Repository | Branch | Commit (frozen) | License | Commits | Working-tree size |
|---|---|---|---|---|---|---|
| Target / source of truth | `prez-tailered-ai/tailered-ai` | `main` | `6172653e0aca0981d0abaf4ad8e9d587667737e9` | Apache-2.0 | 3 | ~200 KB |
| Upstream A | `NousResearch/hermes-agent` | detached | `ed5e17f4b86da0c4f09c0694757b6074ae6b9d16` | MIT | 21,728 | 803 MB |
| Upstream B | `plastic-labs/honcho` | detached | `a92fb1e0789fd29e9674aec133328513ed0dcda3` | AGPL-3.0 | 613 | 46 MB |

Tailered AI HEAD is `Execute v1 blueprint foundations` (2026-07-30). Hermes HEAD is
2026-08-11 16:00 EDT; Honcho HEAD is 2026-08-11 17:50 EDT — both repositories moved on
the day of the audit, which is precisely why they were pinned to detached HEADs before
any conclusion was drawn.

Both upstreams were cloned into an isolated scratch location outside every tracked
source tree and checked out at the pinned SHA. Neither was built, installed, nor
executed; Honcho in particular was never run, so all Honcho findings are static-analysis
findings and are labelled accordingly.

### Target-system runtime baseline (VERIFIED)

Established by execution before any upstream comparison, on Node v24.11.1:

- `npm ci` — 4 packages, 0 vulnerabilities. The platform has **zero runtime
  dependencies**; `typescript` and `@types/node` are the only devDependencies
  (`package.json:26-29`).
- `npm test` — 18/18 pass.
- `npm run validate` — VERIFIED; ledgers empty at HEAD (0 evals, 0 labels, 0 routes).
- `npm run demo` — `status: VERIFIED`, outcome `shipped`, `costUsd 0.068`,
  `wallTimeMs 277`, one terminal eval, one gate label, ADR-002 written.

This baseline matters: comparisons of maturity and complexity below are between a
3,615-line, zero-dependency, fully-green platform and two large multi-language systems.

## Governing constraints applied

1. Tailered's constitution (`AGENTS.md`), `docs/v1-contract.md`,
   `docs/agent-protocol.md`, `docs/platform-brief.md`, and
   `docs/full-system-blueprint.md` are authoritative. No recommendation in this audit
   weakens an existing invariant to make integration easier.
2. Evidence states are never collapsed. Completion is labelled `VERIFIED`, `INFERRED`,
   `UNKNOWN`, or `BLOCKED`. Upstream capability is labelled `IMPLEMENTED`, `TESTED`,
   `DOCUMENTED`, `OBSERVED`, `INFERRED`, or `UNVERIFIED`.
3. No AGPL-covered Honcho server source was copied into any Tailered or Dime tree.
4. Documentation claims are not accepted as implementation evidence. Where a README
   claim and the code disagree, the disagreement is itself recorded as a finding.
5. Dime internals are cited from the Dime repository directly, which was read but never
   written to. Anything not evidenced there is marked `REQUIRES DIME VERIFICATION`.

## Lane architecture and write ownership

Four lanes ran in parallel with strict single-writer ownership. Lane workers returned
structured findings to one coordinator; no worker wrote an audit artifact, so no two
writers ever touched the same file.

| Lane | Scope | Workers | Ownership rule |
|---|---|---|---|
| A | Hermes: runtime, tools/MCP, skills, multi-agent, security, memory/cost, CI/licensing | 7 | May not write Honcho conclusions |
| B | Honcho: data model, epistemology, retrieval, queue, security/tenancy, benchmarks/licensing | 6 | May not write Hermes conclusions |
| C | The real Hermes↔Honcho integration + a 13-case failure matrix | 2 | Must cite both upstreams |
| D | Dime AI and Tailered OS capability inventory | 3 | Must inspect the target, not assume upstream superiority |
| — | Tailered AI source read end-to-end; POC-A executed; synthesis | coordinator | Sole writer of all artifacts |

Lane A and B findings rated CRITICAL or HIGH, plus every claim-matrix verdict of
`MISLEADING` / `DOCUMENTATION_ONLY` / `STALE`, were passed to independent adversarial
verifiers instructed to **refute** them and to default to refuted when they could not
personally confirm the finding in the code.

Total execution: **53 subagents, 6.43M tokens, 1,993 tool calls, zero agent errors**,
across the 18 lane reports and 40 adversarial verifications.

### Verification results, reported honestly

| Outcome | Count |
|---|---|
| Verifier runs | 40 |
| **Invalidated by a bug in this audit's own harness** | **13** |
| Genuine adjudications | 27 |
| — CONFIRMED | 16 |
| — PARTIALLY_CONFIRMED (scope corrections, substance held) | 9 |
| — REFUTED | 2 |

**The harness bug, disclosed.** The verification step routed each finding to a repository
path using a heuristic on its id prefix. Synthesised claim-matrix ids (`CLAIM-…`) did not
match that heuristic and were pointed at the **Honcho** checkout even though they concerned
**Hermes**. Those verifiers correctly reported that the cited files did not exist in the
repository they were given. **No finding is recorded as refuted on the basis of a misrouted
verdict.** Notably, most of those verifiers detected the mismatch themselves, located the
sibling checkout, and verified against the correct code anyway — those re-scoped verdicts
are counted as genuine above.

**Both genuine refutations concern claim-matrix entries, not substantive findings**, and one
of them *vindicated upstream*: the assertion that Hermes's documented "always-on hardline
floor" was misleading did not survive, because `detect_hardline_command` is in fact invoked
at `tools/approval.py:3757-3760` **before** the YOLO bypass at `:3785`. The narrower defect —
that `_CMDPOS` does not absorb a path-qualified command word, so `/bin/rm -rf /` never
matches `HARDLINE_PATTERNS` — was confirmed separately as SEC-H-01.

Every CRITICAL and HIGH finding that received a genuine adjudication was CONFIRMED or
PARTIALLY_CONFIRMED. Confirmed outright: HA-202, HA-203, HA-204, HA-306, HA-311, HA-402,
SEC-H-01 through SEC-H-05, SEC-H-07, SEC-H-08, SEC-H-09.

Two independent spot-checks by the coordinator also passed: Hermes skill counts
(79 bundled / 15 categories, 114 optional / 21, 193 total) matched exactly, and disputed
file sizes were re-measured directly (see the correction recorded in `05`).

## Artifact location rationale

Artifacts live in `docs/audits/hermes-honcho/`. This is consistent with the repository's
existing convention: `docs/` already holds prose governance documents
(`platform-brief.md`, `v1-contract.md`, `agent-protocol.md`, `full-system-blueprint.md`,
`blueprint-execution.md`) that are not part of the company format proper. The company
format enumerated in `AGENTS.md` and enforced by `src/validate.ts:17-30` is unaffected:
`validateCompany` checks a fixed list of required paths and ledger integrity, so adding
documents under `docs/` cannot invalidate the repository. This was confirmed by running
`npm run validate` after the directory was created.

**No ADR was written by this audit.** Under the constitution, humans own intent and
machines own implementation (`AGENTS.md:17`), and accepted decisions are immutable
(`AGENTS.md:27`). An adoption decision of this size is intent. Artifact
`17-adoption-decision-matrix.md` therefore contains a *draft* ADR body for the founder to
accept or reject at a gate; this audit does not append it to `decisions/`.

## Method: claim → code → runtime

For each material capability the chain was: locate the documented claim → find the
implementation entrypoint → identify the state mutation → find the tests → obtain runtime
evidence where feasible → trace the failure path → identify the security boundary → cost →
Tailered/Dime relevance. Where a link in that chain was missing, the gap is the finding.

Runtime evidence was obtained for Tailered AI (full suite, validate, demo, and the
adversarial POC-A matrix in `16-poc-results.md`). Runtime evidence for Hermes and Honcho
was **not** obtained: executing either would have required installing dependency trees and
provider credentials, and Honcho additionally requires PostgreSQL with pgvector plus an
LLM provider key. Those constraints are recorded as explicit `BLOCKED` items rather than
bridged by inference, per governing rule 2.

## Completion gates

Each gate is either VERIFIED or explicitly BLOCKED with its reason. None is asserted
without evidence.

| Gate | Status | Evidence |
|---|---|---|
| **Coverage** — every material production subsystem classified | **VERIFIED**, with limits stated | 13 subsystem lanes: Hermes runtime, tools/MCP/providers, skills, multi-agent/cron, security, state/memory/cost, CI/packaging/licensing; Honcho data model/API, deriver/epistemology, retrieval/dialectic, queue/consistency, security/tenancy/deletion, benchmarks/SDK/deploy/licensing. Unread modules enumerated in `21` |
| **Code** — critical features traced to implementation, not README | **VERIFIED** | 343 findings, each carrying file:line citations; claim-to-code verdicts recorded per lane |
| **Runtime** — runtime evidence where feasible | **VERIFIED where feasible; BLOCKED elsewhere** | Tailered: 18/18 tests, `validate` exit 0, demo, POC-A (5 cases), POC-C. Hermes: approval detector executed in an isolated harness (`05`). Honcho: **never executed** — requires Postgres+pgvector and paid inference |
| **Security** — every privileged boundary threat-analysed | **VERIFIED** | `05` (12 code-execution tools, 7 independent gates, 21 findings), `09` (tenancy, deletion, auth defaults, 17 findings) |
| **Memory** — observation, inference, provenance, authority analysed | **VERIFIED** | `08` — four epistemic levels, the exact commit line where inference becomes durable state, and a memory-authority model |
| **Concurrency** — multi-agent and worker behaviour under contention/failure | **VERIFIED** | `06` Part 2 (two Hermes lanes), `09` (delivery semantics), POC-C (executed against Tailered) |
| **Tailered** — every recommendation maps to an exact capability or gap | **VERIFIED** | `11` invariant register TA-001…TA-016 + gap matrix; `17` names the affected component per decision |
| **Dime** — recommendations distinguish personalisation / operational / prediction | **VERIFIED** | `12` classifies all 12 candidates; prediction-affecting memory is REJECTED absolutely |
| **Duplication** — nothing recommended that already exists | **VERIFIED** | `11` Parts 2-3; skill format, subagents, worktrees, browser, MCP, approval gating all shown already present |
| **Economics** — high-impact recommendations quantified or bounded | **VERIFIED, deliberately bounded** | `14` measures Tailered exactly; upstream costs are given as **structure and constants** with assumptions stated. Dollar projections at 100/1k/10k/100k users were **refused** rather than fabricated — `AGENTS.md:33` reserves money for deterministic computation |
| **License** — integration compatible with verified licenses | **VERIFIED, with counsel-review flags** | `15` per-component tables for both repos; AGPL §13 quoted verbatim; three Honcho components declare licenses with no text in the tree |
| **POC** — empirical proof or explicitly marked unproven | **VERIFIED** | 2 executed (A, C), 1 partial (D, format only), **5 BLOCKED** with unblock conditions. No efficiency or benchmark claim is made from a blocked POC |
| **Decision** — every material capability ends in a disposition | **VERIFIED** | `17`: 18 decisions, all terminal |
| **Evidence** — no major conclusion unsupported | **VERIFIED** | Every recommendation cites finding ids; 40 adversarial verifications; harness bug and a false-pass both disclosed |

## Known limitations of this audit

- Hermes at 803 MB / ~4,000 Python files and ~1,400 TypeScript files cannot be read
  exhaustively by any process. Coverage is scoped: each lane read its core modules in
  full and grepped the remainder. Modules outside all seven Hermes lane scopes are
  unaudited and are not claimed otherwise.
- No upstream code was executed, so every upstream performance and cost number in
  `14-performance-and-cost.md` is derived from code structure, not measurement, and is
  labelled `INFERRED` with its assumptions stated.
- Benchmark claims were assessed by reading harness code, not by re-running benchmarks;
  reproduction would require datasets, judge models, and paid inference.
- License analysis reports what the license text and file layout support. It is not
  legal advice, and items needing counsel are flagged as such in
  `15-license-and-maintenance-risk.md`.
