<!-- audit: {"audit_id":"AUD-RUFLO-20260811-221322","tailered_sha":"6172653e0aca0981d0abaf4ad8e9d587667737e9","ruflo_release":"v3.37.0","ruflo_sha":"6ce18b5a7fcd4939a2f72c2e3b8fdbdec660e5a9","generated":"2026-08-11T23:00:00Z","evidence_class":"MIXED","lane":"AUD-L7b","caused_by":["AUD-RUFLO-20260811-221322/01-audit-charter.md"]} -->

# Spike D — Cost accounting

## Question

Does Ruflo track cost; where; with what precision; does it reserve **before** spending or only
report after; what happens on retry, fallback, failure, cancellation, and concurrency — and can
Tailered's `ReserveSettleBudget` remain authoritative on top of it?

## Tailered's contract

`src/budget.ts` + `src/money.ts` + `docs/v1-contract.md`:

- Integer **micro-dollars** (`usdToMicros`, `Math.round(value * 1_000_000)`, rejects non-safe
  integers). No floating-point USD is ever accumulated.
- **Reserve before spend**: `reserve(tier, projectedCostUsd, projectedTokens)` denies when
  `settled + reserved + projected >= cap`. The cap is exclusive at $5.00.
- **Settle after**: `settle()` throws `AccountingInvariantError` if actual cost **or** actual
  tokens exceed the reservation. *"Agent projections must be hard ceilings."*
- Process failure settles at the reserved ceiling (`settleProjection`) — v1 will not silently
  discard potentially incurred spend.
- `assertSettled()` — an unsettled reservation at end of run is an invariant failure.

## Headline answer

**Ruflo has no pre-spend reservation of any kind, and its only spend-ceiling mechanism
(`policy budget`) is inert in every configuration that was reachable.**

Cost appears in Ruflo in three disconnected places, none of which is a ledger:

1. **Hardcoded per-tier estimates** returned by the model router (`estimatedCost`).
2. **A static, manually-maintained price table** (`ruvector/model-prices.js`).
3. **A post-hoc JSONL trajectory file** (`.swarm/model-router-trajectories.jsonl`) read for a
   7-day "cost savings" report — **which did not exist after any command in this audit**.

All three are floating-point USD. None is consulted before a call. Nothing enforces a ceiling.

## Findings

### RUF-730 — CRITICAL — no reserve-before-spend exists; the policy budget never meters

`policy budget set` accepts a ceiling object, and `policy status` reports `budgets: N`. It does
nothing.

Programmatic test (bypassing the CLI's TTY gate — see RUF-732), in a disposable repo:

```
mode: enforce   budgets: [{"id":"tailered-cap","action":"model.call","maxCostUsd":5,"periodMs":3600000}]
costUsd 1     -> {"outcome":"denied","enforced":"denied","reason":"default-deny","obligations":[]}
costUsd 4     -> {"outcome":"denied","enforced":"denied","reason":"default-deny","obligations":[]}
costUsd 9.99  -> {"outcome":"denied","enforced":"denied","reason":"default-deny","obligations":[]}
costUsd 1000  -> {"outcome":"denied","enforced":"denied","reason":"default-deny","obligations":[]}
usage rows after: []
```

Two things are proven here:

- The **decision is never made by the budget**. With zero rules, `enforce` mode is deny-all
  (`reason: "default-deny"`) — identical for $1 and for $1000. The `maxCostUsd: 5` ceiling is
  never the discriminator.
- **`usage` stays empty** across all four evaluations. Nothing is accumulated against the
  budget window, so even a correctly-authored rule set would meter against an empty ledger.

The only other reachable mode is `legacy`, the default, where every action returns
`{"outcome":"allowed","reason":"legacy-default-allow","matchedRules":[]}` — including a
`model.call` on `claude-opus-4`. A production install therefore runs with **allow-everything**
authorization and **no** spend ceiling.

Evidence: `evidence/mcpbud.out`, `evidence/mcpbud2.out`, `evidence/policy3.out`.

### RUF-731 — CRITICAL — a policy-trust anchor keyed by absolute path permanently bricks any second checkout at that path

The policy ledger's tamper-evidence key lives **outside the repository**, in the user's home,
keyed only by the project's absolute path (`services/policy-runtime.js:51-56`):

```js
const trustRoot = join(userInfo().homedir, '.config', 'ruflo', 'policy-trust');
const projectId = createHash('sha256').update(realpathSync(projectRoot)).digest('hex');
```

The anchor is written the moment a project enters enforce mode
(`policy-runtime.js:91-110`, `if (state.mode === 'enforce' || existsSync(anchorPath))`), and
thereafter `verifyStateAnchor` HMAC-checks the on-disk state against it, throwing
`policy-state-authentication-failed` on mismatch.

**Controlled reproduction** (two containers, one shared `$HOME`, both mounted at `/repo`):

| Step | Action | Result |
| --- | --- | --- |
| 1 | repoA at `/repo`, `setPolicyMode('enforce')` | anchor created at `~/.config/ruflo/policy-trust/816fc349…/` — and `sha256("/repo")` = `816fc349d3faebf805d1bed70fce7e14754cad5251c77dda31c414ee961a0bdd`, an exact match |
| 2 | repoB (a **different** checkout) at `/repo`, same `$HOME` | `task create` → `policy-state-authentication-failed`, exit 1 |
| | | `agent spawn` → `policy-state-authentication-failed`, exit 1 |
| | | `policy status` → `policy-state-authentication-failed` |

The lockout is permanent, has no self-repair, and no recovery command is surfaced. Only
`memory store` (which does not traverse the policy path) still worked.

Three consequences:

1. **Container/CI collision.** Every workspace conventionally mounted at `/repo`, `/workspace`,
   `/app`, or `/github/workspace` shares one anchor per user. The second project to arrive is
   bricked. This is not a hypothetical — it is how this audit discovered the defect.
2. **The ledger is not portable evidence.** `policy status` reports `"ledger": {"valid": true}`
   using a random 32-byte key in `$HOME`. From a fresh clone, or from CI, or from any other
   machine, the receipt chain **cannot be verified at all**. A hash-linked ledger whose key is
   not in the repo is not auditable evidence for a Tailered Release record.
3. **Cross-project contamination.** The anchor records `mode`, so one project's decision to
   enforce silently becomes another project's lockout condition.

Evidence: `evidence/anchor.out`, `evidence/policy-trust-anchor.json`, `evidence/conc2.out`,
`evidence/conc3.out`.

### RUF-732 — HIGH — the interactive-administrator gate is bypassed by the MCP tool agents can call

`commands/policy.js:17-19`:

```js
function requireInteractiveAdministrator() {
    if (!process.stdin.isTTY || !process.stdout.isTTY)
        throw new Error('policy administration requires an interactive local terminal');
```

`policy budget set` and `policy init --mode enforce` both refuse from any non-interactive
context (VERIFIED: refused with a pseudo-TTY on stdout only, `docker run -t`).

But `mcp-tools/policy-tools.js:68-82` exposes `policy_budget_set`, which calls
`setPolicyBudget()` from `services/policy-runtime.js` **with no gate at all**. Direct
programmatic invocation succeeded:

```
setBudget OK
budgets now: [{"id":"tailered-cap","action":"model.call","maxCostUsd":5,"periodMs":3600000}]
setPolicyMode('enforce') -> mode after: enforce
```

So the control reads as "only a human at a terminal may change spend limits", while an agent
holding the MCP surface can set its own ceiling and flip enforcement mode. The gate protects
the CLI, not the capability. Evidence: `evidence/policy3.out`, `evidence/mcpbud.out`.

### RUF-733 — HIGH — cost is floating-point USD end to end

Every cost path uses IEEE-754 doubles:

- `ruvector/model-prices.js` — `costUsd = (input × $/Mtok_in + output × $/Mtok_out) / 1_000_000`
- `hooks-tools.js:3436-3439` — `Math.round(actual * 1_000_000) / 1_000_000` (round-trips
  through a float; the accumulator `actual += out.cost_usd` is a float sum over an unbounded
  outcome list)
- `commands/neural.js:2836` — `$${w.actualUsd.toFixed(6)}`

Tailered converts to integer micros at the boundary (`usdToMicros`) precisely to avoid this.
Any Ruflo-reported figure crossing into Tailered must be re-quantised, and the re-quantised
value must be treated as an estimate, never a settlement. This is a **contract mismatch**, not
merely a style difference: `settle()` throws `AccountingInvariantError` on a
`actualMicros > projectedMicros` comparison, and float drift on either side of that comparison
produces spurious invariant failures or silent under-reporting.

### RUF-734 — HIGH — `estimatedCost` is a hardcoded constant, not a projection

`ruvector/enhanced-model-router.js` returns fixed values per branch:

```
:330  estimatedCost: 0
:349  estimatedCost: 0.015
:400  estimatedCost: 0.0002
:414  estimatedCost: 0.003
:427  estimatedCost: 0.015
```

The value does not depend on the prompt, the context size, the token budget, or the model's
actual price. It is a per-tier placeholder. Tailered's `AgentProjection.maxCostUsd` is a **hard
ceiling** the settlement is checked against; feeding it a five-value lookup table would make
every reservation either grossly over- or under-sized.

### RUF-735 — MEDIUM — the price table is hand-maintained and its fallback is anti-conservative

`ruvector/model-prices.js` header: *"New models added via the registry sidecar should be
reflected here AS THEY ARE ADDED (no auto-sync); see ADR-149."* The table carries 8 concrete
models plus 4 tier-label fallbacks.

```js
const p = MODEL_PRICES[modelId] ?? { in: 1.0, out: 1.0 };   // "conservative"
```

The comment calls the `$1/Mtok` fallback conservative. Against the table's own entries it is
not: `claude-opus-4` is `{in: 15, out: 75}`. An unrecognised or renamed model id — a new
release, a typo, an OpenRouter slug change — is costed at **1/15th of input and 1/75th of
output price**, silently. Cost under-reporting is the failure direction that a budget cannot
catch.

### RUF-736 — MEDIUM — cost is recorded only in a file that never appeared

The only place actual `cost_usd` and `tokens` are read is
`.swarm/model-router-trajectories.jsonl` (`hooks-tools.js:3391-3440`,
`commands/neural.js` cost-savings report). Independent verification after the full command
battery:

```
ls -la /repo/.swarm/model-router-trajectories.jsonl
ls: cannot access '…': No such file or directory
```

The file is written only by a credentialed model-router execution path. Its consumer silently
skips malformed lines and any outcome lacking `cost_usd` or `tokens`
(`if (!out?.cost_usd || !out.tokens) continue;`) — so a partially-written or truncated JSONL
degrades to *lower* reported spend with no error. There is no fsync, no checksum, and no
sequence number.

### RUF-737 — INFO — retry / fallback / failure / cancellation semantics are undefined at the accounting layer

Because there is no reservation and no per-call ledger, none of these has an accounting
behaviour to test:

| Event | Ruflo behaviour | Tailered requirement |
| --- | --- | --- |
| Retry | `task retry` re-runs a task; no cost record is created or amended | each attempt is a separate reserved+settled call; `attempts` escalates tier |
| Fallback to another model | router picks a different tier; nothing records that both were paid for | both calls settle independently |
| Process failure | command exits nonzero; nothing settles | `settleProjection()` — settle at the reserved ceiling, never discard |
| Cancellation | `task cancel` flips a status field | unsettled reservation must fail `assertSettled()` |
| Concurrency | no shared accounting state exists | reservations are serialised through one budget object |

Every row is `UNKNOWN` at the model-spend level and would remain so even with credentials,
because the record type does not exist.

### RUF-738 — INFO (positive) — no lost updates under concurrency

A specific concern was that `task-tools.js` uses read-modify-`writeFileSync` on
`.claude-flow/tasks/store.json` with no obvious lock. Tested at a clean path with a fresh
`$HOME`:

- 8 concurrent `task create` → **8/8 persisted**, 0 errors.
- 16 concurrent `task create` → **16/16 persisted**, 0 errors.

INFERRED: the policy transaction lock in `withPolicyTransaction` serialises the MCP tool path.
No lost-update defect was reproduced. Evidence: `evidence/conc4.out`, `evidence/final.out`.

### RUF-739 — MEDIUM — the daemon can be armed to spend money autonomously

`.claude-flow/daemon-state.json` (written into the repository) declares nine background
workers. `aiWorkersEnabled: false` is the default and the daemon log confirms
*"AI workers disabled (default) - all workers run local-only."*

Three switches flip that: `daemon start --headless`, `daemon.aiWorkers.enabled=true`, or the
`RUFLO_DAEMON_AI_WORKERS=1` environment variable. Once flipped, workers including `audit`
(every 600 s), `optimize` (900 s), `testgaps` (1200 s), and `harness`
(21600 s, "opt-in `RUFLO_HARNESS_LOOP`, $0-default") run on timers with **no operator present
and no budget in the path**, because RUF-730 shows no budget is in any path. An environment
variable is the entire distance between a quiet install and unattended metered spend.

## Verdict

> "Ruflo cost tracking may only ADVISE — prove whether Tailered reserve-and-settle can remain
> authoritative on top of it."

**Tailered reserve-and-settle can remain authoritative, and it must, because Ruflo contributes
nothing to it.** There is no competing authority to reconcile with — there is an absence.

The correct architecture is unambiguous:

1. **Tailered reserves before every model call.** Ruflo is never consulted. Ruflo's
   `estimatedCost` is not admissible as `AgentProjection.maxCostUsd` (RUF-734).
2. **Ruflo runs as a subordinate process whose entire model spend is bounded by the Tailered
   reservation held around it** — the reservation must cover the whole Ruflo invocation, because
   Ruflo will not stop itself.
3. **Ruflo cost output, if read at all, is quantised to micros and stored as an advisory
   attachment**, never as the settled amount. Under-reporting (RUF-735, RUF-736) means it may
   only ever *lower* confidence, never *release* reserved budget.
4. **`policy budget` must not be represented to anyone as a spend control.** It is inert
   (RUF-730), its administration gate is bypassable (RUF-732), and arming it risks the permanent
   path-collision lockout (RUF-731).
5. **`RUFLO_DAEMON_AI_WORKERS` and `--headless` must be treated as prohibited configuration**
   (RUF-739).

## What could not be determined without credentials

- The actual precision, cadence, and completeness of `.swarm/model-router-trajectories.jsonl`
  entries. The file was never created. **UNKNOWN.**
- Whether a credentialed call path performs any check before spending. No such check exists in
  the dist tree, but the credentialed executor (`claude -p` / Claude Code Agent tool) was not
  observable. **UNKNOWN — and the executor is where the spend actually happens.**
- Whether `policy budget` metering works when a matching allow rule *is* authored. Rule
  authoring is behind the same interactive gate; `usage` remained empty in every reachable
  configuration. **UNKNOWN.**
- Real end-to-end cost of a swarm run. **UNKNOWN.**
