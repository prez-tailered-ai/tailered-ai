# 20 — Risk register (Tailered AI)

Risks are scored by impact **on `prez-tailered-ai/tailered-ai`**. Each carries its evidence,
its trigger, and its mitigation. Risks whose rationale depended on any out-of-scope system
have been removed rather than restated.

---

## A. Live risk in the target system

| ID | Risk | Severity | Evidence | Mitigation | Status |
|---|---|---|---|---|---|
| **R-01** | **Tailered's ledger is not concurrency-safe.** A started run can produce **no terminal `EvalRow`**, violating the constitution's unconditional law | **HIGH** (blocks all multi-agent work) | **POC-C, executed**: 4 duplicate route ids, 10 validator errors, `validate` true exit 1, orphan run `…3d5cc699` | Remediation contract in [25](25-concurrency-remediation-contract.md); reorder finalisation, then a CAS-style claim | **OPEN — prerequisite** |
| **R-02** | The process boundary does not bound **execution**: an agent-chosen binary in a `testgen` payload runs | **MEDIUM** (documented, accepted) | **POC-A, executed**: marker file written; [`src/ship.ts:531-555`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/ship.ts#L531-L555) | Disposable worker, no ambient credentials, scoped egress — required before any external runtime | Accepted; constrains decision #14 |
| **R-03** | A future agent platform adds **spend channels outside reserve/settle** (subagents, tools, an external memory service), silently defeating the fourth operating law | **HIGH** if unaddressed | The ceiling today bounds only the process agent ([`src/budget.ts:48-54`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/src/budget.ts#L48-L54)); both upstreams demonstrate the failure mode (HA-502, HO-319) | Extend reserve/settle to every new spend channel as a design rule, not an afterthought | **OPEN — design constraint** |
| **R-04** | Procedure measurement built on an **incomplete ledger** computes confident, wrong numbers | **HIGH** if R-01 unfixed | Missing terminal rows are exactly the crashed runs — a selection bias that makes procedures look *better* than they are | Hard-sequence [26](26-procedure-outcome-architecture.md) behind [25](25-concurrency-remediation-contract.md) | **OPEN — sequencing** |

## B. Risks that adoption would introduce

### B1 — Interoperating with Honcho as a memory service (decision #3)

| ID | Risk | Severity | Evidence | Mitigation |
|---|---|---|---|---|
| **R-10** | **Cross-unit memory read *and* write** via a model-controlled `peer` argument with no allowlist | **HIGH** | HH-106; tool schemas actively invite it | One workspace per isolation unit; no cross-peer tool surface; no model-write tool |
| **R-11** | **Auth off by default**, failing open to full admin, with no startup warning | **HIGH** | SEC-O-03 | `USE_AUTH=True` asserted at deploy and smoke-tested |
| **R-12** | A peer-scoped key can join itself to any session in the workspace and read its messages | **CRITICAL** upstream → **HIGH** mitigated | SEC-O-01 | Per-unit workspace confines the blast radius to that unit's own data |
| **R-13** | **Deletion does not cascade** to derived conclusions, higher-order conclusions, or peer cards; **no individual-message delete exists** | **HIGH** | SEC-O-04, HO-101 (zero `ON DELETE` in the physical schema), HO-113 | Either non-derived memory, or an application-level erasure routine proven by test — a hard precondition |
| **R-14** | **Memory silently lost** at three points; the status endpoint reports errored items as completed | **HIGH** | HO-404 (CRITICAL), HO-406, HO-214, HO-414 | Treat memory as best-effort by design; never load-bearing; meter independently |
| **R-15** | **Duplicate conclusions** accumulate — no idempotency key, and non-deterministic prose defeats content-dedup | MEDIUM | HO-405 | Bounded retention; periodic review |
| **R-16** | **Unmetered second spend channel**; upstream's own calculator reports **$0.00** | **HIGH** | HH-109, HO-319, HO-508 | Route memory spend through Tailered's reserve/settle (see R-03) |
| **R-17** | All content goes to **OpenAI by default**, contrary to the README | MEDIUM | SEC-O-13 | Explicit provider configuration; data-flow review before any real data |
| **R-18** | AGPL obligations if the server is modified or its source linked | MEDIUM | LIC-O-04 (license text quoted verbatim) | Unmodified server, HTTP boundary only, never vendored. **Counsel review** |
| **R-19** | SDK licenses declared Apache-2.0/MIT with **no license text in the tree**; the Python SDK README contradicts its own link | MEDIUM | LIC-O-02, LIC-O-03 | **Counsel review** before any SDK ships |
| **R-20** | Self-hosted MCP worker **silently defaults to the vendor's managed API** | MEDIUM | HO-532 | Verify the endpoint at deploy; assert in a smoke test |

### B2 — Any use of Hermes

| ID | Risk | Severity | Evidence | Mitigation |
|---|---|---|---|---|
| **R-30** | **No reserve-before-spend anywhere**; adopting its accounting would violate the fourth operating law | **HIGH** | HA-502; exhaustive negative grep found zero enforcement sites | Never adopt the cost model; Tailered's reserve/settle must wrap any use |
| **R-31** | **Cannot be packaged** — `setup.py` raises on wheel and sdist; PyPI/Homebrew explicitly unsupported | **HIGH** (forecloses dependency) | HA-601 | Architectural borrowing only; pinned SHA + container if ever executed |
| **R-32** | Autonomous skill writer: default-on, approval off, unmeasured, `delete` permanently `rmtree`s | **HIGH** | HA-304, HA-306/307/308, HA-316 | REJECT (decision #7) |
| **R-33** | `SKILL.md` bodies can execute host shell at load time; neither scanner knows the syntax | **HIGH** | HA-312 | If the format is adapted (#6), **do not** port inline-shell expansion |
| **R-34** | No single approval chokepoint; `computer_use` defaults to **allow**; non-interactive sessions auto-approve | **HIGH** | HA-201, HA-203 (CONFIRMED), SEC-H-06 | Run any Hermes-derived process as an untrusted subprocess under OS isolation |
| **R-35** | `hermes -z` unconditionally disables approvals — a self-reachable child escalation | **HIGH** | SEC-H-05 (CONFIRMED) | Same as R-34 |
| **R-36** | Upstream churn: ~1,051 commits/week, 20,714 open PRs, no semver policy, coverage unmeasured, a required E2E check disabled while still counted green | **HIGH** | HA-602/604/605/607/609 | Never track `main`; pin the audited SHA |
| **R-37** | GSAP 3.15.0 (non-OSI, commercially restricted) is a production dependency of the shipped dashboard | MEDIUM | LIC-H-05 | Irrelevant unless `web/` is ever used; **counsel review** if so |

### B3 — Risks created by the combination

| ID | Risk | Severity | Evidence | Mitigation |
|---|---|---|---|---|
| **R-40** | **Persistent prompt-injection channel**: content reaches the model labelled "authoritative" in the *user* channel, and a model-authored conclusion re-enters every later turn | **HIGH** | HH-104 + HH-114 + SEC-HH-01/02/03 | System-role non-authoritative block; no model-write tool; instruction neutralisation |
| **R-41** | **Recursive belief drift**: derived beliefs feed later derivation with unvalidated `source_ids`, no supersession, unread confidence | **HIGH** | HH-114, HO-211, HO-204, HO-208, HO-210 | Non-derived memory for any pilot; human-confirmed writes only |
| **R-42** | Memory outage leaves a **permanent hole** — no durable buffer, no reconciliation | MEDIUM | HH-205 | Accept as a quality event; never depend on completeness |

## C. Risks in the audit itself

Stated so the work can be checked rather than trusted.

| ID | Risk | Mitigation applied |
|---|---|---|
| **R-50** | Upstreams were never executed, so behavioural claims could be wrong | Such findings labelled `INFERRED`/`BLOCKED`; five POCs recorded BLOCKED rather than estimated. One exception carries real runtime evidence: the approval-detector harness in `05` |
| **R-51** | Coverage of an 803 MB repository is necessarily partial | Unread modules enumerated in `21`; no claim made about them |
| **R-52** | "NONE FOUND" for tests is an unreproduced absence — the least reliable finding class | Flagged in `21`; treated as unproven, not proven-absent |
| **R-53** | **A harness defect routed 19 verifications to the wrong repository** | Disclosed in `01`; **all 19 rerun with explicit repo binding, 19/19 identity-matched**; a regression test now locks the invariant (`tooling/resolve-citation.test.mjs`, 8/8 passing) |
| **R-54** | Verdict polarity was ambiguous in the first verification pass | Corrected pass reports **corrected statements** as authoritative rather than verdict labels alone; disclosed in `01` |
| **R-55** | A pipeline could mask a failing check | Caught in practice: `validate \| tail` returned `tail`'s status; re-run directly to obtain true exit code 1. The reproduction guide warns about it explicitly |
| **R-56** | The audit could be biased toward adoption | Result argues against it: 0 ADOPT, 0 REPLACE, 7 REJECT. Findings that overstated the case were **downgraded on re-verification** and the downgrades are recorded (`06`, `03`) |

## Top five, ranked

1. **R-01** — the ledger race. Falsifies a constitutional law under concurrency and blocks
   every multi-agent objective. Fix before anything else.
2. **R-04 / R-03** — building measurement or new spend channels on top of an incomplete
   ledger or outside reserve/settle would quietly undo the platform's two strongest
   properties.
3. **R-10 / R-12** — Honcho cross-unit read and write. Disqualifies any shared-workspace
   deployment.
4. **R-13** — deletion does not cascade and individual messages cannot be deleted. A hard
   precondition for storing anything about real people.
5. **R-30 / R-31** — Hermes has no pre-spend ceiling and cannot be packaged. Together these
   remove direct adoption from consideration entirely.
