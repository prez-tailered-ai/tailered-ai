# 20 — Risk register

Risks that would be *created or activated* by acting on this audit, plus risks the audit
found in the target systems themselves. Each carries its evidence, its trigger, and its
mitigation. Severity reflects impact **on Tailered or Dime**, not on the upstream project.

Risks are grouped by whether they exist today or would be introduced by adoption.

---

## A. Live risks in the target systems (exist now, independent of any adoption)

| ID | Risk | Severity | Evidence | Mitigation | Status |
|---|---|---|---|---|---|
| **R-01** | Dime's numeric-grounding allowlist is seeded from client-supplied `role:"user"` text, so any injected or replayed content widens the "supported numeric" set | **HIGH** | DA-205: `dime-chat.route.ts:823-826, 862-864`; enforcement `dimeAnswerRouting.ts:1188-1210`; `sanitizeDimeChatHistory` carries no provenance | Derive `supportedNumericValues` only from server retrieval; tag history provenance | **Open — Gate D0.1** |
| **R-02** | Dime chat pool falls back to the read-write `DATABASE_URL`; a memory layer reusing `getPool()` inherits write access to every prediction table | **MEDIUM** | DA-204: `dimeChatContext.ts:149-174`; `DIME_CHAT_DATABASE_URL` unconfigured anywhere | SELECT-only MySQL grant | **Open — Gate D0.2** |
| **R-03** | Tailered's ledger is not concurrency-safe; a started run can produce **no terminal EvalRow**, violating `AGENTS.md:18` | **HIGH** (blocks parallelism) | **POC-C, executed**: 4 duplicate route ids, 10 validator errors, `validate` exit 1, orphan run `…3d5cc699` | Reorder the `finally`; CAS-style id claim | **Open — Gate 0** |
| **R-04** | Tailered's process boundary does not bound execution: an agent-chosen binary in a `testgen` payload runs | **MEDIUM** (documented, accepted) | **POC-A, executed**: marker file written. `ship.ts:531-555`; documented `README.md:59` | Disposable worker, no ambient credentials, scoped egress | Accepted; constrains Gate 3 |
| **R-05** | Dime's prediction boundary holds by convention, not mechanism — nothing prevents a future PR importing `getDb` into an LLM-lane module | **MEDIUM** | DA-202 risk note; the property is VERIFIED true today | R-02's grant makes it mechanical; optionally a CI import-boundary check | Open |
| **R-06** | `games.updateProjections` turns an arbitrary ≤50-char string into a published projection | **MEDIUM** | DA-206: `routers.ts:441-465`; owner-gated, genuinely (`appUsers.ts:133-163`) | Never let an agent or memory component hold an owner session | Open, forward-looking |
| **R-07** | Chat context reads raw model columns, bypassing `stripGameModelFields`; a memory layer persisting context would persist proprietary fields into a store with different access rules | **MEDIUM** | DA-210: `dimeChatContext.ts:568-597` vs `feedGating.ts:121-132` | Apply the feed's substring-`model` rule to any memory persistence | Open, conditional |

---

## B. Risks that adoption would introduce

### B1 — Adopting Honcho as a memory service

| ID | Risk | Severity | Evidence | Mitigation |
|---|---|---|---|---|
| **R-10** | **Cross-user memory read *and* write** via a model-controlled `peer` argument with no allowlist; `honcho_conclude` writes another peer's durable profile | **HIGH** | HH-106: `session.py:1324-1340`; dispatch `__init__.py:1506-1594`; schemas invite it (`:153-154`) | **One workspace per user**; no cross-peer tool surface; no model-write tool |
| **R-11** | **Auth is off by default and fails open to full admin**, with no startup warning | **HIGH** | SEC-O-03: `config.py:727`; `security.py:211-212` | `USE_AUTH=True` asserted at deploy; smoke test that an unauthenticated call is rejected |
| **R-12** | A peer-scoped key can join itself to any session in the workspace, converting into member-read of its messages | **CRITICAL** (upstream) → **HIGH** (mitigated) | SEC-O-01: `routers/sessions.py:274-321`; `crud/session.py:242-274, 981-1072` | Per-user workspace makes the blast radius one user's own data |
| **R-13** | **Deletion does not cascade** to derived conclusions, higher-order conclusions, or peer cards; there is **no individual-message delete** | **HIGH** | SEC-O-04, HO-101 (zero `ON DELETE` in the physical schema), HO-113 | Either non-derived memory, or an application-level erasure routine proven by test — a hard precondition for any real-user pilot |
| **R-14** | **Memory can be silently lost** at three points (enqueue swallow, permanent error-drop, batch parse failure) and the status endpoint reports errored items as completed | **HIGH** | HO-404 (CRITICAL upstream), HO-406, HO-214, HO-414 | Treat memory as best-effort by design; never load-bearing; meter independently |
| **R-15** | **Duplicate conclusions** accumulate — no idempotency key, and non-deterministic prose defeats content-dedup | MEDIUM | HO-405: `crud/document.py:520-610` | Bounded retention; periodic review |
| **R-16** | **Unmetered, unbounded per-turn cost**; upstream's own cost calculator reports **$0.00** for every level and the efficiency metric excludes ingestion | **HIGH** | HH-109; HO-319; HO-508 | Raise `dialectic_cadence`; meter on the Dime side; apply reserve/settle (TA-112) |
| **R-17** | All message content, conclusions and peer cards go to **OpenAI by default**, contrary to the README | MEDIUM | SEC-O-13 | Explicit provider configuration; data-flow review before any real user data |
| **R-18** | AGPL obligations if the server is ever modified or its source linked | MEDIUM | LIC-O-04, quoting `LICENSE:540-551, 72-89, 146-154` | Unmodified server, HTTP boundary only, never vendored. **Counsel review** |
| **R-19** | SDK licenses are declared Apache-2.0/MIT with **no license text in the tree**, and the Python SDK README contradicts its own link | MEDIUM | LIC-O-02, LIC-O-03 | **Counsel review** before shipping any SDK |
| **R-20** | Self-hosted MCP worker **silently defaults to the vendor's managed API** | MEDIUM | HO-532 | Verify the endpoint at deploy; assert in a smoke test |

### B2 — Adopting Hermes in any form

| ID | Risk | Severity | Evidence | Mitigation |
|---|---|---|---|---|
| **R-30** | **No reserve-before-spend anywhere**; adopting its accounting would violate `AGENTS.md:20-21` | **HIGH** | HA-502; exhaustive negative grep found zero enforcement sites | Never adopt the cost model; Tailered's reserve/settle must wrap any use |
| **R-31** | **Cannot be packaged** — `setup.py` raises on wheel and sdist; PyPI/Homebrew explicitly unsupported | **HIGH** (blocks dependency) | HA-601 | Architectural borrowing only; pinned SHA + container if ever used |
| **R-32** | Autonomous skill writer is default-on with approval **off**, unmeasured, quota-driven, and `delete` permanently `rmtree`s | **HIGH** | HA-304, HA-306/307/308, HA-316 | REJECT (decision #7) |
| **R-33** | `SKILL.md` bodies can execute host shell at load time (`` !`cmd` ``) and neither scanner knows the syntax | **HIGH** | HA-312 | Never import third-party skills into an environment where this is enabled |
| **R-34** | No single approval chokepoint; `computer_use` defaults to **allow**; non-interactive sessions auto-approve everything | **HIGH** | HA-201, HA-203, SEC-H-06 | Run only as an untrusted subprocess under OS isolation |
| **R-35** | `hermes -z` unconditionally disables approvals — a self-reachable child-agent escalation | **HIGH** | SEC-H-05: `oneshot.py:221-222` | Same as R-34 |
| **R-36** | Upstream churn: ~1,051 commits/week, 20,714 open PRs, no semver or stability policy, coverage unmeasured, required E2E check disabled while counted green | **HIGH** | HA-602/604/605/607/609 | Never track `main`; pin the audited SHA |
| **R-37** | GSAP 3.15.0 (non-OSI, commercially restricted) is a production dependency of the shipped dashboard | MEDIUM | LIC-H-05 | Do not ship `web/`; **counsel review** if ever considered |

### B3 — Risks created by the *combination*

| ID | Risk | Severity | Evidence | Mitigation |
|---|---|---|---|---|
| **R-40** | **Persistent prompt-injection channel**: content reaches the model labelled "authoritative" in the *user* channel, and a model-authored conclusion re-enters every subsequent turn | **HIGH** | HH-104 + HH-114 + SEC-HH-01; Honcho-side SEC-HH-02 (raw content into the dialectic **system** prompt) and SEC-HH-03 (unescaped `<messages>` fence) | System-role non-authoritative block; no model-write tool; instruction neutralization |
| **R-41** | **Recursive belief drift**: derived beliefs feed later derivation (dream lane) with unvalidated `source_ids`, no supersession, and unread confidence | **HIGH** | HH-114, HO-211, HO-204, HO-208, HO-210 | Non-derived memory for any pilot; human-confirmed writes only |
| **R-42** | Memory outage produces a **permanent hole** — no durable buffer, no reconciliation | MEDIUM | HH-205 | Accept as a quality event; never depend on completeness |
| **R-43** | Two independent unmetered cost channels compound | **HIGH** | HA-502 + HH-109 | Meter externally; enforce reserve/settle |

---

## C. Risks in the audit itself

Stated so the work can be checked rather than trusted.

| ID | Risk | Mitigation applied |
|---|---|---|
| **R-50** | Upstreams were never executed, so behavioral claims could be wrong | All such findings labelled `INFERRED`/`BLOCKED`; POC-B/E/F/G recorded BLOCKED rather than estimated. One exception with real runtime evidence: the approval-detector harness in `05` |
| **R-51** | Coverage of an 803 MB repo is necessarily partial | Unread modules enumerated in `21`; no claim made about them |
| **R-52** | "NONE FOUND" for tests is an unreproduced absence — the least reliable finding class | Flagged explicitly in `21` item 4; treated as unproven, not proven-absent |
| **R-53** | Lane findings could be wrong or overstated | CRITICAL/HIGH findings and adverse claim verdicts passed to independent adversarial verifiers instructed to refute and to default to refuted; spot-checked independently (skill counts verified exactly: 79/15, 114/21, 193) |
| **R-54** | A pipeline could mask a failing check | Caught in practice: `validate \| tail` returned `tail`'s status; re-run directly to obtain the true exit code 1 |
| **R-55** | The audit could be biased toward adoption | Result argues against it: 0 `ADOPT`, 0 `REPLACE`, 7 `REJECT`. The one hypothesis the audit expected to confirm — that the integration was thin — was **refuted** and recorded as such |

## Top five, ranked

1. **R-01** — Dime's numeric-grounding vector. Live today, HIGH, and it is the exact
   mechanism by which memory would contaminate grounded evidence. Fix regardless of adoption.
2. **R-03** — Tailered's ledger race. Falsifies a constitutional law under concurrency and
   blocks every parallelism objective.
3. **R-10 / R-12** — Honcho cross-peer read and write. Disqualifies shared-workspace
   deployment for any multi-user product.
4. **R-13** — deletion does not cascade, and individual messages cannot be deleted. A hard
   precondition for real-user data.
5. **R-30 / R-31** — Hermes has no pre-spend ceiling and cannot be packaged. Together these
   remove direct adoption from consideration entirely.
