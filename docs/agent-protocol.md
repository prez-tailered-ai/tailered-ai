# Process agent protocol

Tailered's orchestration is vendor-neutral. A process agent receives one JSON request on standard input and returns one JSON response on standard output. Standard error is diagnostic only. The process must not mutate the company repository; it returns complete `product/` file writes for the runtime to validate and apply.

Process-agent checks execute local product code. The CLI therefore requires `--allow-local-execution` for process-agent runs. This flag is an explicit acknowledgment, not a sandbox. Production use must place the entire Tailered worker in an isolated, disposable environment with no ambient credentials and only scoped network access.

## Configuration

```json
{
  "command": "/absolute/path/to/agent",
  "args": [],
  "timeoutMs": 120000,
  "projections": {
    "frontier": { "maxCostUsd": 1.5, "maxTokens": 12000 },
    "mid": { "maxCostUsd": 0.5, "maxTokens": 8000 },
    "cheap": { "maxCostUsd": 0.1, "maxTokens": 4000 }
  }
}
```

Each projection is a hard ceiling, not an average. Tailered reserves it before starting the process. The process must constrain its provider call so actual cost and total tokens cannot exceed the selected tier's ceiling.

## Request

```json
{
  "runId": "RUN-...",
  "taskKind": "codegen",
  "model": "mid-available",
  "tier": "mid",
  "signals": { "attempts": 1 },
  "spec": "Build ...",
  "contextSnapshot": "{\"repoHash\":\"...\",\"files\":[...]}",
  "failureOutput": "optional narrow-check output"
}
```

`taskKind` is `testgen`, `codegen`, `critique`, `adr_draft`, `narrate`, or `judge`. `contextSnapshot` contains bounded UTF-8 repository files and a deterministic hash. Ledgers, build output, caches, and Git internals are excluded.

## Response envelope

```json
{
  "payload": {},
  "usage": {
    "input": 1000,
    "output": 500,
    "costUsd": 0.012345
  }
}
```

Token counts are non-negative integers. `costUsd` is a non-negative finite number. Tailered converts money to integer micro-dollars before arithmetic.

## Task payloads

`testgen` returns structured commands without a shell:

```json
{
  "tests": [
    {
      "id": "unit",
      "title": "Unit suite passes",
      "command": "npm",
      "args": ["test"],
      "cwd": "product"
    }
  ]
}
```

`codegen` returns complete file replacements restricted to `product/`:

```json
{
  "files": [
    {
      "path": "product/index.html",
      "content": "<!doctype html>..."
    }
  ]
}
```

`critique` returns:

```json
{
  "violations": [],
  "flags": []
}
```

`adr_draft` returns:

```json
{
  "title": "Ship the feature",
  "context": "Why this decision exists.",
  "decision": "What the run decided.",
  "alternativesRejected": ["A rejected alternative."],
  "consequences": ["A consequence."]
}
```

Invalid output, timeout, non-zero process exit, or a response above its reservation halts and writes a terminal eval. No failed process call disappears from accounting.
