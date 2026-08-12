# Subagent topology decision

## Measured basis

`03-benchmark-results.md` (modes), `06-token-context-report.md` (floor + packets). Exact lane
tokens; single-trial timings; warm-coordinator bias declared.

## The selected default: **M0 with escalation rules** ("M0+")

One coordinator, no subagents, is the default operating mode. Escalate deliberately:

| Trigger | Escalate to | Why (measured) |
|---|---|---|
| Bounded question, sources known | stay M0 | 0 agent tokens; repair-loop discipline covers the proxy-error risk (M0's grep miscount) |
| Work exceeds the ~17.7k-token lane floor AND lanes are disjoint | M1-shape (2–3 lanes, tight packets) | lanes were correct, fresh, and more precise; packets cut lane tool-uses 19→12 |
| A claim can drift during execution, gates a merge, or carries security/data-integrity weight | + one adversarial verifier (M2's only earning component) | the verifier made the run's sole catch: a temporally stale "highest ADR" claim |
| Open-ended discovery | M1-shape WITHOUT packets | packets risk silent omission on discovery (frozen rule, `06` §Findings 5) |

## Routing rules (validated by this run)

1. One coordinator for small, linear tasks — parallelism must earn itself.
2. Specialized parallel readers for broad, disjoint research; smallest lane count that covers
   the surface; stop each lane at its exact deliverable (lanes here stopped in 15–30s).
3. One independent adversarial verifier for security, integrity, merge, and drift-prone
   claims — not for re-confirming static facts.
4. Never two writers in one worktree; the coordinator is the only writer, always.
5. Never duplicate low-risk analysis; duplication is reserved for the verifier lane.
6. Minimal context packets for bounded lanes; generated packets tie hand-curated ones at
   1/1000th the human cost (62 ms).
7. Below the lane floor (~17.7k tokens), inline the work in the coordinator.
8. Measure tokens per verified conclusion, not per response.

## Anti-patterns observed

- **Biggest-mode-by-default:** M2's four lanes added nothing over M1's three on static facts;
  only the verifier earned M2's marginal cost, and only on drift-prone claims.
- **Proxy instruments in fast paths:** M0's `grep -c` undercounted generated tests; the
  runner is the instrument of record. Fast is fine; unverified fast is not.
- **Trusting lane answers across time:** a lane's answer is a claim about the repository AT
  READ TIME; anything that can change before use needs late verification.
