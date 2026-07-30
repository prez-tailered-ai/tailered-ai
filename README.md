# Tailered AI

Tailered AI mints AI-native companies as plain files in a Git repository. v1 contains one complete loop: charter, company repo, bounded implementation, constitutional critique, human deployment gate, preview, decision record, and terminal evaluation.

The platform keeps no parallel company state. Product code, decisions, policies, labels, routes, and run accounting stay in the company repository.

## Requirements

- Node.js 24 or newer
- npm 11 or newer
- A process agent for non-demo ship runs

## Verify v1

```bash
npm ci
npm test
npm run validate
npm run demo
```

`npm run demo` mints a company in a temporary directory, ships the gating single-user todo app, asserts the executable definition of done, and writes a read-only dashboard. The command prints the exact company, preview, eval, label, ADR, and dashboard paths.

## Commands

```bash
# Mint from an interactive four-question charter interview.
node dist/src/cli.js init --target ../my-company

# Mint non-interactively.
node dist/src/cli.js init \
  --target ../my-company \
  --answers ./charter.json

# Run the ship loop with an external process agent and interactive gate.
node dist/src/cli.js ship \
  --repo ../my-company \
  --spec-file ./spec.md \
  --agent-config ./agent.json \
  --allow-local-execution

# Render current repository state. No dashboard database is created.
node dist/src/cli.js dashboard \
  --repo ../my-company \
  --output ../my-company-dashboard.html

# Run the non-gating auth benchmark with the same ship loop.
node dist/src/cli.js benchmark \
  --name todo-auth \
  --repo ../my-company \
  --agent-config ./agent.json \
  --allow-local-execution
```

Run `npm run build` once before invoking `dist/src/cli.js` directly.

Process-agent runs execute generated acceptance checks. `--allow-local-execution` is an explicit trust-boundary acknowledgment, not a sandbox. Run production agents inside an isolated, disposable worker with scoped credentials. The deterministic built-in demo does not invoke an external process agent.

## Runtime contract

- Every started ship run writes exactly one terminal `EvalRow`.
- `EvalRow.outcome` is `shipped`, `halted_attempts`, `halted_budget`, or `rejected`.
- `GateLabel` exists only after a human gate occurred.
- The next agent call reserves a hard cost ceiling before execution. A projected total greater than or equal to $5.00 is refused. The call settles actual usage afterward.
- The router is stateless. `route(taskKind, { attempts })` maps the third code-generation attempt to the frontier tier and leaves every decision measurable in `evals/routes.jsonl`.
- Accepted ADR files are never edited. A new ADR uses `supersedes` and includes the replaced ADR in `caused_by`; dashboard rendering derives the old ADR's `superseded` state.

See [docs/v1-contract.md](docs/v1-contract.md) for the complete scope ruling and [docs/agent-protocol.md](docs/agent-protocol.md) for the vendor-neutral process boundary.

## Repository format

```text
product/             shippable artifact
decisions/           append-only ADRs
loops/               closed-loop definitions
seats/               human and agent accountabilities
evals/ledger.jsonl   one terminal row per run
evals/routes.jsonl   measured model allocation
evals/runs/          specs and generated acceptance tests
labels/ledger.jsonl  human gate preference labels
policies/            irreversible-action gates
AGENTS.md            machine-checkable company constitution
```

The format is intentionally plain. Removing Tailered does not remove the company.
