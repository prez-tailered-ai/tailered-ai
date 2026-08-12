# 01 — Baseline and methodology

Audit of **NousResearch/hermes-agent** and **plastic-labs/honcho** as candidate contributors
to **`prez-tailered-ai/tailered-ai`**, the repository in which agents are built, evaluated,
and deployed.

Read-first, evidence-first. No upstream code was installed into the Tailered dependency
graph, and neither upstream repository was modified, pushed to, or forked.

## Scope lock

| Repository | Role | Permitted operations |
|---|---|---|
| [`prez-tailered-ai/tailered-ai`](https://github.com/prez-tailered-ai/tailered-ai) | **Target · sole writable · deployment control plane** | read, execute, branch, commit, publish this audit |
| [`NousResearch/hermes-agent`](https://github.com/NousResearch/hermes-agent) | Upstream reference | clone, freeze, inspect, compare — **read-only** |
| [`plastic-labs/honcho`](https://github.com/plastic-labs/honcho) | Upstream reference | clone, freeze, inspect, compare — **read-only** |

Every upstream finding terminates in a Tailered AI disposition. Findings produced during
earlier, wider-scoped execution that concern a different application repository are excluded
from the canonical corpus and retained solely as audit provenance in
[22-raw-evidence.md](22-raw-evidence.md), clearly marked **OUT OF CURRENT SCOPE**. They carry
no weight in any disposition. Where an underlying engineering principle applies to Tailered
AI, it was **re-derived and independently proved against Tailered's own code** before being
carried into this corpus — never inherited.

## Frozen baseline

Every conclusion is anchored to these three immutable commits. No finding cites a moving
branch.

| Role | Repository | Commit | License | Commits | Size |
|---|---|---|---|---|---|
| Target | `prez-tailered-ai/tailered-ai` | [`6172653e0aca0981d0abaf4ad8e9d587667737e9`](https://github.com/prez-tailered-ai/tailered-ai/tree/6172653e0aca0981d0abaf4ad8e9d587667737e9) | Apache-2.0 | 3 | ~200 KB |
| Upstream A | `NousResearch/hermes-agent` | [`ed5e17f4b86da0c4f09c0694757b6074ae6b9d16`](https://github.com/NousResearch/hermes-agent/tree/ed5e17f4b86da0c4f09c0694757b6074ae6b9d16) | MIT | 21,728 | 803 MB |
| Upstream B | `plastic-labs/honcho` | [`a92fb1e0789fd29e9674aec133328513ed0dcda3`](https://github.com/plastic-labs/honcho/tree/a92fb1e0789fd29e9674aec133328513ed0dcda3) | AGPL-3.0 | 613 | 46 MB |

Both upstreams moved on the day of the audit, which is precisely why they were pinned to
detached HEADs before any conclusion was drawn. Neither was built or executed; Honcho in
particular was never run, so all Honcho findings are static-analysis findings and are
labelled accordingly.

### Target runtime baseline (VERIFIED by execution)

Established before any upstream comparison, on Node v24.11.1:

- `npm ci` — **4 packages, 0 vulnerabilities**. Zero runtime dependencies.
- `npm test` — **18/18 pass**.
- `npm run validate` — VERIFIED.
- `npm run demo` — `status: VERIFIED`, outcome `shipped`, `costUsd 0.068`,
  `wallTimeMs 277`, one terminal eval, one gate label, ADR written.

This baseline matters: the comparison is between a 3,615-line zero-dependency platform with a
green executable definition of done, and two large multi-language systems.

## Governing constraints applied

1. The target's constitution, v1 contract, agent protocol, platform brief, and blueprint are
   authoritative. No recommendation weakens an existing invariant to make integration easier.
2. Evidence states are never collapsed. Completion is `VERIFIED` / `INFERRED` / `UNKNOWN` /
   `BLOCKED`; upstream capability is `IMPLEMENTED` / `TESTED` / `DOCUMENTED` / `OBSERVED` /
   `INFERRED` / `UNVERIFIED`.
3. No AGPL-covered Honcho server source was copied anywhere.
4. Documentation claims are never accepted as implementation evidence. Where a README and the
   code disagree, the disagreement is itself the finding.
5. Every citation is an immutable GitHub permalink at the frozen commit. **Repository
   attribution is resolved by verifying the cited path exists in that checkout** — never by
   inferring from a finding-id prefix.

## Lane architecture and write ownership

Four lanes ran in parallel under strict single-writer ownership. Lane workers returned
structured findings to one coordinator; **no worker wrote an audit artifact**, so no two
writers ever touched the same file.

| Lane | Scope | Workers |
|---|---|---|
| A | Hermes: runtime, tools/MCP/providers, skills, multi-agent/cron, security, state/memory/cost, CI/licensing | 7 |
| B | Honcho: data model, epistemology, retrieval, queue/consistency, security/tenancy, benchmarks/licensing | 6 |
| C | The real Hermes↔Honcho integration + a 13-scenario failure matrix | 2 |
| D | Target-system inventory | 3 |
| — | Target source read end-to-end; POC-A and POC-C executed; all synthesis and writing | coordinator |

Total execution: **72 subagents, ~8.0M tokens, ~2,500 tool calls, zero agent errors**, across
18 lane reports and 59 adversarial verifications.

## Verification, and the harness defect — disclosed

Findings rated CRITICAL or HIGH, plus every adverse claim-matrix verdict, were passed to
independent adversarial verifiers instructed to **refute** them and to default to refuted
when they could not personally confirm the finding in code.

### The defect

The first verification pass routed each finding to a repository using a **heuristic on its id
prefix**. Synthesised claim-matrix ids (`CLAIM-…`) matched neither branch and were pointed at
the **Honcho** checkout while describing **Hermes**. Those verifiers correctly reported that
the cited files did not exist — output indistinguishable from a genuine refutation unless the
reasoning is read.

**19 verdicts were affected.** No finding was ever recorded as refuted on that basis.

### The correction

All 19 were **rerun with explicit structured repository binding** (`repo = tailered-ai |
hermes-agent | honcho`) plus a mandatory identity assertion — `git remote -v` and
`git rev-parse HEAD` checked against the expected values before any file was read.

| Corrected pass | Result |
|---|---|
| Repository identity matched | **19 / 19** |
| CONFIRMED | 7 |
| PARTIALLY_CONFIRMED (scope corrections, substance held) | 9 |
| REFUTED | 3 |

**Verdicts that changed a conclusion, recorded in place:**

- **Subagent isolation downgraded.** "Isolated subagents" is accurate in the standard
  agent-framework sense of *context* isolation, which the code delivers. The correct rating is
  "accurate but under-scoped", not "misleading" ([06](06-hermes-skills-and-multi-agent.md)).
- **Cross-agent file safety corrected.** `lock_path` is a **real** per-path lock held across
  the write critical section; only the staleness check is advisory. Lost updates are
  *detected and reported*, not *prevented* ([06](06-hermes-skills-and-multi-agent.md)).
- **A claim against upstream did not survive.** The documented "always-on hardline floor" is
  genuinely invoked before the bypass; the narrower command-position defect was confirmed
  separately as SEC-H-01 ([05](05-hermes-security.md)).
- **Synthetic-message count raised** from seven sites to eleven
  ([03](03-hermes-architecture.md)).
- **Doc-drift severity lowered**: `max_iterations` drift affects only direct library
  instantiation, since every shipped entry path passes the documented value
  ([03](03-hermes-architecture.md)).

### The regression test

`tooling/resolve-citation.mjs` implements the invariant, and
`tooling/resolve-citation.test.mjs` locks it — **8/8 passing**:

```bash
node --test docs/audits/hermes-honcho/tooling/resolve-citation.test.mjs
```

Three tests target the defect directly: an absolute path must never be attributed to any
repository (a naive path join discards the root and would resolve it against the first repo
tried); attribution must be by path existence rather than identifier prefix; and any fan-out
work item must carry an **explicit** repo key or be rejected.

### A second harness lesson, also disclosed

In the first pass the prompt framed the "claim under test" ambiguously, so verdict *labels*
carried mixed polarity — for some items REFUTED meant "the upstream documentation is wrong"
(finding upheld) and for others "the auditor's assertion is wrong". The corrected pass
therefore treats each verifier's **corrected statement** as authoritative rather than its
label alone, and the corrections above are quoted from those statements.

## Citation portability

A reviewer needs only GitHub. The canonical evidence ledger resolves **1,579 citations** to
immutable permalinks (957 Hermes, 622 Honcho); 82 remained unresolved and were left as plain
text rather than guessed; and **51 absolute local paths were rejected outright**. The
canonical corpus contains **zero** local filesystem paths, `file://` URIs, or editor-only
references.

## Artifact location

Artifacts live in `docs/audits/hermes-honcho/`, consistent with the repository's existing
convention of holding prose governance documents under `docs/`. The company format enumerated
in the constitution and enforced by the validator is unaffected: `validateCompany` checks a
fixed list of required paths and ledger integrity, so adding documents cannot invalidate the
repository. Confirmed by running `validate` after every change, reading the exit code
directly.

**No ADR was written by this audit.** Under the constitution humans own intent and accepted
decisions are immutable; an adoption decision is intent.
[17](17-adoption-decision-matrix.md) contains a *draft* ADR-004 for the founder to accept or
reject at a gate.

**No remediation was implemented.** The concurrency defect this audit found by execution is
specified in [25](25-concurrency-remediation-contract.md) and deliberately left unfixed;
publication of an audit is not authorization to change the system it audits.

## Completion gates

| Gate | Status | Evidence |
|---|---|---|
| **Coverage** | **VERIFIED**, with limits stated | 13 upstream subsystem lanes; unread modules enumerated in [21](21-open-questions.md) |
| **Code** | **VERIFIED** | 294 canonical findings, each with permalinked citations |
| **Runtime** | **VERIFIED where feasible; BLOCKED elsewhere** | Target: 18/18 tests, `validate`, demo, POC-A (5 cases), POC-C. Hermes: approval detector executed in an isolated harness. Honcho: **never executed** |
| **Security** | **VERIFIED** | [05](05-hermes-security.md), [09](09-honcho-security-and-consistency.md) |
| **Memory** | **VERIFIED** | [08](08-honcho-memory-and-epistemology.md) — the exact line where inference becomes durable state, and a memory-authority model |
| **Concurrency** | **VERIFIED** | [06](06-hermes-skills-and-multi-agent.md), [09](09-honcho-security-and-consistency.md), POC-C, [25](25-concurrency-remediation-contract.md) |
| **Tailered** | **VERIFIED** | [11](11-tailered-gap-matrix.md) invariant register; every disposition names its affected component |
| **Duplication** | **VERIFIED** | [12](12-tailered-agent-platform-opportunity.md) — capability-by-capability, target-first |
| **Economics** | **VERIFIED, deliberately bounded** | [14](14-performance-and-cost.md) measures the target exactly; upstream costs given as structure and constants. Dollar projections were **refused** rather than fabricated |
| **License** | **VERIFIED, counsel items flagged** | [15](15-license-and-maintenance-risk.md); AGPL §13 quoted verbatim |
| **POC** | **VERIFIED** | 2 executed, 1 partial, **5 BLOCKED** with unblock conditions |
| **Decision** | **VERIFIED** | [17](17-adoption-decision-matrix.md) — 20 terminal dispositions |
| **Evidence** | **VERIFIED** | Every recommendation cites finding ids; 59 verifications; harness defect, verdict-polarity ambiguity, and a false pass all disclosed |

## Known limitations

- Hermes at 803 MB cannot be read exhaustively. Each lane read its core modules in full and
  grepped the remainder; modules outside all seven lane scopes are unaudited and not claimed
  otherwise.
- No upstream code was executed, so every upstream performance and cost figure is derived
  from code structure and labelled `INFERRED` with assumptions stated.
- Benchmark claims were assessed by reading harness code, not by re-running benchmarks.
- License analysis reports what the license text supports. It is not legal advice; counsel
  items are flagged as such.
