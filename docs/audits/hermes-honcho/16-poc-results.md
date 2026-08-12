# 16 — Proof-of-concept results

Seven POCs were specified. Two were executed against the live Tailered runtime and
produced decisive results. Five are recorded `BLOCKED` with the exact blocking reason —
none is bridged by inference.

No POC made a model call. No API credit was spent.

---

## POC-A — Can an external process agent satisfy Tailered's protocol without weakening its invariants?

**Status: EXECUTED. VERIFIED.**

This is the load-bearing experiment for Architecture D (Hermes behind Tailered's
vendor-neutral process boundary). A deterministic mode-switched agent
implemented [`docs/agent-protocol.md`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/docs/agent-protocol.md)
and was driven through five behaviours by the real CLI on Node v24.11.1 against
`tailered-ai @ 6172653e`. Reproduction: [23-reproduction-instructions.md](23-reproduction-instructions.md).

| Case | Agent behavior | Outcome | Blocker reported | Verdict |
|---|---|---|---|---|
| conforming | honest usage; writes `product/index.html` | `shipped`, $0.004, 4 calls / 2 contexts, `validate` VERIFIED | — | Protocol is sufficient for an external agent |
| overspend | reports $1.00 against its own $0.50 reservation | `halted_budget` | `Accounting invariant failed: Settlement $1.000000 exceeds reservation $0.500000.` | **Accounting invariant HELD** |
| escape-write | `codegen` returns `policies/gates.yaml` | `halted_attempts` | `Agent and gate writes are restricted to product/` | **Mutation boundary HELD** (gates.yaml sha256 unchanged) |
| traversal-write | `codegen` returns `product/../../../tmp/poc-tailered-pwned.txt` | `halted_attempts` | `Path escapes repository root` | **Path guard HELD** (file absent on disk) |
| command-exec | `testgen` returns an arbitrary binary + args | ran to the gate | ENOENT on missing preview | **Execution NOT bounded** — marker file written |

### Conclusion

The boundary contains **mutation** and **accounting**. It does not contain **execution**.

`src/ship.ts:531-555` spawns `check.command` with `check.args`, and those values arrive
from the agent's `testgen` payload (`docs/agent-protocol.md:60-74`). `shell:false`
(`src/ship.ts:536`) eliminates shell-metacharacter injection and `resolveRepoPath`
(`src/files.ts:16-32`) confines the working directory, but the binary itself is
agent-chosen and executes. This is documented, not defective: `README.md:59` and
`docs/agent-protocol.md:5` both state that `--allow-local-execution` is "an explicit
trust-boundary acknowledgment, not a sandbox."

Adoption consequence: Tailered can bound what a Hermes-derived process agent **spends**
and what it **writes**, but not what it **executes**. Architecture D must therefore
supply the isolation Tailered deliberately omits — a disposable worker with no ambient
credentials and scoped egress. This aligns exactly with Hermes's own security posture
(`hermes-agent/SECURITY.md` §2.2: "The only security boundary against an adversarial LLM
is the operating system"), so the two systems agree about where containment must live.

### Secondary result

In all four non-shipping cases the run still appended exactly one terminal `EvalRow`,
wrote a terminal ADR, and `validate --repo` returned VERIFIED. The append-only ledger
survives adversarial agent behavior, preserving the failure half of the corpus as
`docs/v1-contract.md:28` requires.

---

## POC-C — Can multiple workers execute concurrently without dirty state?

**Status: EXECUTED. FAILED — and the failure is inside Tailered, not inside any agent.**

Three `tailered ship` runs were launched simultaneously against one minted company with
the same deterministic agent.

| Run | Exit | Result |
|---|---|---|
| 1 | 2 | `halted_attempts` — `Route log ROUTE-000007 already exists.` |
| 2 | 1 | **crashed outside the run loop** — `ADR-002 already exists. Accepted ADRs are never edited.` No receipt emitted. |
| 3 | 0 | `shipped` |

Resulting repository state:

```
route ids: ROUTE-000001 x3, ROUTE-000004 x3, ROUTE-000007, ROUTE-000008   (4 duplicates)
validate --repo   ->  true exit code 1, 10 integrity errors
runs with route logs: 3      runs with terminal eval: 2
STARTED RUN WITH NO TERMINAL EVAL: RUN-20260811223523147-3d5cc699
```

The reported exit code was verified directly rather than through a pipeline, because
`cmd | tail` returns `tail`'s status and would have shown a false pass.

### Root cause (two independent race classes)

1. **Read-then-write id allocation.** `nextRouteId` / `nextEvalId` / `nextLabelId`
   compute `rows.length + 1` (`src/ledger.ts:117-127`), and `appendRouteLog` re-checks
   for the id before appending (`src/ledger.ts:82-88`). Both are time-of-check /
   time-of-use over an unlocked `open(...,"a")` (`src/files.ts:52-64`).
2. **Terminal-eval loss through ADR collision.** Inside `taileredShip`'s `finally`,
   `appendAdr` runs at `src/ship.ts:420` *before* `appendTerminalEval` at
   `src/ship.ts:466`. ADR files are created with `flag: "wx"` (`src/files.ts:49`), so a
   concurrent id collision throws `AppendOnlyViolationError` out of the `finally` and the
   terminal record is never written.

Mechanism 2 breaks the constitution's unconditional law — *"Every started run appends
exactly one terminal `EvalRow`"* (`AGENTS.md:18`, `docs/v1-contract.md:19`). The affected
run started, spent tokens, wrote two route logs, and left no terminal record.

### Scope calibration

This is **not** a v1 contract violation. v1 contracts one ship loop, never claims
concurrent runs, and its single-run demo and CI are green. It **is** a hard prerequisite
blocker for safe parallel agent execution in Tailered AI. Full specification:
[25-concurrency-remediation-contract.md](25-concurrency-remediation-contract.md).

The adoption consequence is the most important structural result in this audit:
**the parallelism blocker is internal to Tailered's ledger, not to any agent runtime.**
Adopting Hermes's subagent or worker isolation would not deliver safe parallel execution,
because the corruption happens after the agent returns, in Tailered's own append path.
Ledger concurrency-safety is a prerequisite for — not a beneficiary of — any upstream
execution adoption. See [19-implementation-roadmap.md](19-implementation-roadmap.md) Gate 0.

---

## POC-B — One-shot Hermes coding worker on a Tailered benchmark task

**Status: BLOCKED.**

Requires installing Hermes's Python dependency tree and supplying a provider API key, then
spending real inference on the `todo-auth` benchmark. Governing rule 11 of this audit
forbids installing either upstream project into the Tailered AI dependency graph during the
audit, and the operating model policy restricts API credit. Cost and correctness of a Hermes worker on a Tailered benchmark are
therefore **UNMEASURED**, and no claim about them appears anywhere in this audit.

To unblock: an isolated disposable VM, a scoped provider key with a hard spend cap, and
explicit owner authorization for the spend. Specified as Gate 5 of the roadmap.

---

## POC-D — Represent a Tailered workflow as a Hermes-style skill

**Status: PARTIALLY EXECUTED (format compatibility VERIFIED). Measurement BLOCKED.**

Format compatibility was checked statically and is confirmed: Hermes skills are YAML
frontmatter (`name`, `description`, `version`, `author`, `license`, `platforms`,
`metadata.hermes.*`) over a markdown body
([`skills/media/*/SKILL.md`](https://github.com/NousResearch/hermes-agent/tree/ed5e17f4b86da0c4f09c0694757b6074ae6b9d16/skills)). The shape is the conventional agentskills.io / Anthropic `SKILL.md` convention rather than a Hermes invention.

The finding this produces is that the format is **cheap to adopt and carries no dependency** —
Tailered AI has no skills system today, so there is nothing to duplicate and nothing to
migrate. The only substantive candidate contribution is the closed learning loop, and its
measurement is exactly the part that is blocked.

The measurable claim — "measurably reduces repeated reasoning" — requires paired runs
(first-run vs learned-skill second-run) with token, tool-call, and correction counts. That
needs model calls and is blocked for the same reason as POC-B. **No efficiency claim for
skill reuse is made in this audit.**

---

## POC-E — Honcho preserves user context while leaving authoritative model output unchanged

**Status: BLOCKED.**

Requires a running Honcho instance: PostgreSQL with pgvector, optionally Redis, an LLM
provider key for the deriver, and an embedding provider. Standing up that stack and
paying for derivation inference was outside the audit's authorized scope.

Critically, this POC is the empirical test of the audit's hard boundary — that memory must
never become sports-model evidence. Because it is unexecuted, the boundary is argued
**architecturally** in `12-dime-ai-opportunity-matrix.md` and `18-reference-architecture.md`
and is **not** claimed to be empirically demonstrated. The roadmap makes this POC a
blocking gate before any Tailered memory pilot stores anything about a real person.

---

## POC-F — Persistent agent resumes across sessions and prioritizes current instruction over inferred memory

**Status: BLOCKED for execution; PARTIALLY ANSWERED from code.**

Execution requires both stacks running plus inference. However, the mechanism this POC
would test was traced statically in Lane C and the answer is adverse: recalled memory is
appended to the **user message** and wrapped in a note instructing the model to "Treat as
authoritative reference data" (`hermes-agent/agent/memory_manager.py:354-361`,
`agent/turn_context.py:53-85`). That is a trust *elevation* applied to LLM-derived content,
not a quarantine, so there is no structural mechanism guaranteeing that a current explicit
instruction outranks an inferred historical preference — it is left to model judgment.

Evidence state: IMPLEMENTED / VERIFIED for the injection mechanism; the behavioral
precedence question remains UNVERIFIED.

---

## POC-G — Can malicious remembered text trigger tools or persistent injection?

**Status: BLOCKED for exploitation; the reachable path is VERIFIED statically.**

No exploit was constructed and none is published here. The static chain is nevertheless
established end-to-end in Lane C and is the highest-severity integration finding:

- All five Honcho tools accept a free-form, model-controlled `peer` argument that reaches
  the backend with no allowlist or membership check
  (`plugins/memory/honcho/session.py:1324-1340`; dispatch at `__init__.py:1506-1594`), and
  the tool descriptions actively invite it ("pass any peer ID from this workspace",
  `__init__.py:153-154`).
- `honcho_conclude` is a **write** into a peer's durable profile
  (`session.py:1505-1546`).
- Server-side scoping does not compensate under defaults: Honcho ships `USE_AUTH=False`
  (`honcho/src/config.py:727`), and Hermes holds one workspace-broad key.
- Written conclusions are re-injected on later turns as "authoritative" (POC-F above),
  which closes a persistent instruction channel.

Severity HIGH rests on static reachability, not on an executed proof of concept, and is
labelled that way in the risk register. For any Tailered deployment holding more than one
isolation unit, this chain is the single most consequential reason the reference architecture
refuses a shared-workspace memory deployment.
