# Agent-platform foundation

Three scopes, one directional dependency, three founder gates. Every scope closes a defect
found by **executing** Tailered AI, not by reading it.

```text
SCOPE 1  P0-B Ledger Concurrency and Crash-Safe Finalization
             │  makes the repository's records trustworthy under concurrency
             ▼
        PREZ MERGE GATE
             │
             ▼
SCOPE 2  ADR-004 Formal Ruflo Rejection
             │  records the founder's decision on the trustworthy foundation
             ▼
        PREZ FOUNDER-DECISION GATE
             │
             ▼
SCOPE 3  Process-Agent Environment and Workspace Isolation
             │  implements the execution boundary that decision requires
             ▼
        PREZ MERGE GATE  →  FOUNDATION MILESTONE COMPLETE
```

No scope may begin from an unmerged branch belonging to the previous scope.

## Repository and authority lock

This program applies **only** to `prez-tailered-ai/tailered-ai`. That repository is the sole
location for source changes, tests, foundation documentation, execution ledgers, evidence,
ADRs, branches, commits, pull requests, agent definitions, and future deployment controls.

Ruflo is a **rejected, read-only external reference**. It must not be installed, added as a
dependency, or treated as an implementation task.

## The operating rule

> A success response is only a claim. Tailered must independently verify the resulting state
> before recording success.

This is not a stylistic preference. It is the direct consequence of audit
`AUD-RUFLO-20260811-221322`, which found false-success failures in an external system's
verification, persistence, coordination, and cleanup paths — and of P0-A and P0-B, both of
which closed defects in Tailered where the system reported success while the underlying
guarantee failed.

## Layout

```text
docs/foundation/agent-platform-foundation/
├── README.md                     this file
├── program-status.json           current scope, technical status, human gate
├── execution-event.schema.json   the shape of every ledger event
├── program-ledger.jsonl          append-only record of every executed step
├── gate-ledger.jsonl             append-only record of every founder gate decision
├── evidence-index.json           index of every evidence artifact, with hashes
└── handoffs/                     the merged-state assumptions each scope may rely on
```

Scope-specific evidence lives beside its scope:

```text
docs/foundation/p0-agent-safety/p0-b/                      Scope 1
docs/foundation/agent-platform-foundation/adr-004/         Scope 2
docs/foundation/agent-platform-foundation/process-agent-isolation/   Scope 3
```

P0-A evidence stays where it is, under `docs/foundation/p0-agent-safety/p0-a/`. It is
inherited, not moved and not rewritten.

## The two-event rule

Every step emits a `step_started` event before work begins and a `step_finished` event with a
terminal status after work ends. **An unmatched `step_started` means the work was interrupted
and must never be interpreted as success.** This mirrors, deliberately, the durable run-start
marker that Scope 1 introduces into the ship loop: a system that cannot tell "in progress"
from "abandoned" cannot report honestly.

## Status vocabulary

| Status | Exact meaning |
| --- | --- |
| `PASS` | The expected postcondition was independently verified and the evidence retained. |
| `FAIL` | The postcondition was false, a regression occurred, or evidence contradicted the claim. |
| `BLOCKED` | A required precondition or capability was unavailable. No result may be inferred. |
| `SKIP` | Genuinely inapplicable here. The reason and resulting limitation are recorded. |
| `NEEDS_PREZ` | The next action requires founder authority. Fable 5 stops. |
| `ABANDONED` | A step started but its actor terminated without recording a terminal result. |
| `SUPERSEDED` | A later attempt replaced this one after its limitation was documented. |

A skip is not a pass. A blocked test is not evidence of safety. Every retry gets a new attempt
number and states what changed.

## Recorded execution

`scripts/foundation/run-recorded.mjs` runs one command without a shell, captures stdout and
stderr separately, records the **true** exit code, hashes every artifact, refuses to overwrite
recorded evidence, records environment variable **names only**, redacts home and repository
paths, and returns the wrapped command's own exit code.

It exists because `cmd | tail` returns `tail`'s status and had already produced one false pass
in this program. Its own self-tests are recorded evidence: a success stays a success, a
command exiting 3 stays `FAIL` at exit 3, a `SIGKILL` is recorded as `exit_code: null` with
the signal named rather than flattened into a number the process never returned, and a second
attempt at an existing evidence path is refused.

## Conventions inherited from P0-A

Disposable fixtures only. Deterministic agents, zero model calls. Evidence before assertion.
Exit codes read directly, never through a pipe. One test per failure class. Hash-based
assertions on protected surfaces. Caveats recorded rather than hidden.

## Parallel work

When parallel investigation is required, each worker writes a separate lane artifact. **The
coordinator alone appends to the program ledger**, so concurrent sessions can never interleave
writes into the master record — which is precisely the class of defect Scope 1 exists to fix.
