# 24 — Audit manifest

The inventory and integrity statement for this audit corpus.

---

## Scope statement

| Repository | Role in this audit | Mutations performed |
|---|---|---|
| [`prez-tailered-ai/tailered-ai`](https://github.com/prez-tailered-ai/tailered-ai) | **Target · sole writable · sole publication repository · deployment control plane** | This audit corpus, on a dedicated branch |
| [`NousResearch/hermes-agent`](https://github.com/NousResearch/hermes-agent) | Read-only upstream reference | **None** |
| [`plastic-labs/honcho`](https://github.com/plastic-labs/honcho) | Read-only upstream reference | **None** |

No other repository received a branch, commit, issue, pull request, release, deployment, or
mutation of any kind.

## Frozen commits

| Repository | Commit |
|---|---|
| Target | [`6172653e0aca0981d0abaf4ad8e9d587667737e9`](https://github.com/prez-tailered-ai/tailered-ai/tree/6172653e0aca0981d0abaf4ad8e9d587667737e9) |
| Hermes | [`ed5e17f4b86da0c4f09c0694757b6074ae6b9d16`](https://github.com/NousResearch/hermes-agent/tree/ed5e17f4b86da0c4f09c0694757b6074ae6b9d16) |
| Honcho | [`a92fb1e0789fd29e9674aec133328513ed0dcda3`](https://github.com/plastic-labs/honcho/tree/a92fb1e0789fd29e9674aec133328513ed0dcda3) |

## Artifact inventory

| # | Artifact | Purpose |
|---|---|---|
| 00 | [executive-verdict](00-executive-verdict.md) | The verdict, and answers to all 25 questions |
| 01 | [baseline-and-methodology](01-baseline-and-methodology.md) | Scope lock, frozen baseline, lane architecture, harness defect and correction, completion gates |
| 02 | [evidence-ledger](02-evidence-ledger.md) | 294 canonical upstream findings, permalinked |
| 03 | [hermes-architecture](03-hermes-architecture.md) | Subsystem map, structural properties, doc-vs-code drift |
| 04 | [hermes-runtime-and-tools](04-hermes-runtime-and-tools.md) | Request lifecycle, tool registry, cost control |
| 05 | [hermes-security](05-hermes-security.md) | Threat analysis with executed detector evidence |
| 06 | [hermes-skills-and-multi-agent](06-hermes-skills-and-multi-agent.md) | Procedural learning and the two multi-agent lanes |
| 07 | [honcho-architecture](07-honcho-architecture.md) | Data model, ontology-to-storage mapping, API surface |
| 08 | [honcho-memory-and-epistemology](08-honcho-memory-and-epistemology.md) | Derivation pipeline, provenance, memory-authority model |
| 09 | [honcho-security-and-consistency](09-honcho-security-and-consistency.md) | Tenancy, deletion, queue delivery semantics |
| 10 | [hermes-honcho-integration](10-hermes-honcho-integration.md) | The real integration and its failure matrix |
| 11 | [tailered-gap-matrix](11-tailered-gap-matrix.md) | Invariant register + capability gap matrix |
| 12 | [tailered-agent-platform-opportunity](12-tailered-agent-platform-opportunity.md) | Opportunity across the eight agent-platform domains |
| 14 | [performance-and-cost](14-performance-and-cost.md) | Measured target baseline; inferred upstream cost structure |
| 15 | [license-and-maintenance-risk](15-license-and-maintenance-risk.md) | Per-component licences, AGPL boundary, upstream risk |
| 16 | [poc-results](16-poc-results.md) | 2 executed, 1 partial, 5 BLOCKED |
| 17 | [adoption-decision-matrix](17-adoption-decision-matrix.md) | 20 terminal dispositions + draft ADR-004 |
| 18 | [reference-architecture](18-reference-architecture.md) | Architecture E with provenance labels |
| 19 | [implementation-roadmap](19-implementation-roadmap.md) | Six gates, none implemented |
| 20 | [risk-register](20-risk-register.md) | Live, adoption-created, and audit-internal risks |
| 21 | [open-questions](21-open-questions.md) | Blockers, coverage limits, founder decisions |
| 22 | [raw-evidence](22-raw-evidence.md) | Lane inventory + OUT-OF-SCOPE provenance |
| 23 | [reproduction-instructions](23-reproduction-instructions.md) | Reproduce every executed result from GitHub |
| 24 | audit-manifest | This file |
| 25 | [concurrency-remediation-contract](25-concurrency-remediation-contract.md) | The blocking prerequisite, specified not applied |
| 26 | [procedure-outcome-architecture](26-procedure-outcome-architecture.md) | The strategic finding |
| 27 | [erratum](27-erratum.md) | **Append-only corrections** to TA-003, TA-004, and the POC-A scope statement |
| 28 | [closure-receipt](28-closure-receipt.md) | Founder acceptance, and what closes versus what stays open |
| — | [`tooling/`](tooling/) | Citation resolver + regression tests |

**Closure note.** Artifacts `27` and `28` were added at closure, after the audit's own
completion gates were met. They correct evidence and record the founder decision. They change
no verdict, no disposition, and no finding about either upstream system. Artifacts 00-26 are
unedited except for two inserted erratum notices, which add pointers and leave every original
statement in place.

**Numbering note.** `13` is intentionally absent: an earlier artifact at that number covered
a wider programme scope and was superseded by `12`, which is Tailered-only. Numbers are
stable identifiers, so it was retired rather than reused, and no cross-reference points at
it.

## Corpus statistics

| Measure | Value |
|---|---|
| Artifacts | 25 markdown + 2 tooling files, **+2 closure artifacts (27, 28)** |
| Total lines / words | 8,173 / ~127,700 |
| Canonical findings (upstream) | **294** |
| Severity split | 6 CRITICAL · 58 HIGH · 117 MEDIUM · 65 LOW · 3 HARDENING · 94 INFORMATIONAL |
| Recorded blockers | 143 |
| Subagents / tokens | 72 / ~8.0M |
| Adversarial verifications | 59 (40 first pass, 19 corrected rerun) |
| Executed POCs | 2 (+1 partial, 5 BLOCKED) |
| GitHub permalinks | **1,659** (971 Hermes · 622 Honcho · 66 target) |
| Local paths / `file://` URIs in the corpus | **0** |

## Integrity statement

- **Citation portability.** Every citation is an immutable GitHub permalink at a frozen
  commit. A reviewer needs only GitHub. 1,579 ledger citations resolved automatically; 82
  were left as plain text rather than guessed; **51 absolute local paths were rejected
  outright**.
- **Repository attribution** is resolved by verifying the cited path exists in that frozen
  checkout, never by inferring from a finding-id prefix.
- **Harness defect disclosed and closed.** 19 verifications were misrouted by an id-prefix
  heuristic; all 19 were rerun with explicit repository binding and identity assertion
  (**19/19 matched**), and a regression test now locks the invariant.
- **Self-corrections are recorded in place**, not silently dropped: two of this audit's own
  findings were downgraded on re-verification, one claim against upstream did not survive,
  and a false pass caused by reading a pipeline's exit code was caught and disclosed.
- **Secret scan**: no credential-shaped literal appears in the corpus.
- **Target repository health after publication**: `validate` exits 0, `npm test` 18/18,
  audit tooling tests 8/8.
- **Target repository health at closure** (`38e08bf`, after P0-A corrective closure):
  `validate` exits 0 VERIFIED, `npm test` **38/38**, `npm audit` 0 vulnerabilities, demo
  `shipped` at $0.068, dependency manifests unchanged. The rise from 18 to 38 tests is the
  P0-A containment suite, not a change to this corpus.
- **Two invariant rows were later refuted.** TA-003 and TA-004 were published VERIFIED on
  evidence that did not support them. The corrections are appended in
  [`27-erratum.md`](27-erratum.md); the original rows are unedited. No verdict, disposition,
  or upstream finding changes.

## What this corpus does not do

- It **implements nothing**. No remediation, no adoption, no agent code.
- It **appends no ADR**. Adoption is intent, and intent is the founder's; a draft sits in
  [17](17-adoption-decision-matrix.md).
- It **mutates no upstream repository**.
- It **authorizes no deployment**. Publication of an audit is not authorization to build.

## Verification commands

```bash
# target health
npm ci && npm test && npm run validate

# audit tooling regression tests (locks the repository-routing invariant)
node --test docs/audits/hermes-honcho/tooling/resolve-citation.test.mjs

# corpus scope checks
grep -rlE '/Users/|file://' docs/audits/hermes-honcho/*.md   # expect: no matches
ls docs/audits/hermes-honcho/*.md | wc -l                     # expect: 25
```

Read exit codes directly, never through a pipe — `cmd | tail` returns `tail`'s status and
produced a false pass during this audit.
