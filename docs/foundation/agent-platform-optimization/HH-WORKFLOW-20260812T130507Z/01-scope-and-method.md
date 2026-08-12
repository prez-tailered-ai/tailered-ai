# 01 — Scope and method

## Scope

Two objectives. First: verify that the Hermes-Honcho audit closure, ADR-004, the erratum,
the P0-B remediation, R-01 closure, and branch protection are canonical on live `main`.
Second: measure how efficiently and safely this repository's agent workflow executes, and
select a default topology.

Out of scope, prohibited, and untouched: Hermes and Honcho runtimes (reference-only under
ADR-004), `src/`, `test/`, dependency manifests, `tsconfig.json`, `.github/`, accepted
ADRs, historical audit text, deployment, and every other repository.

## Method

- **Live-state freeze.** All hints in the tasking were re-resolved against origin and the
  GitHub API before use. One hint was stale: `EXPECTED_MAIN_HINT = 81bdfd7a` predates the
  PR #8 reconciliation merge; live main at freeze was `0d55aa9e`. Live evidence governs.
- **Deterministic packet.** Ten questions about committed state, each with a single
  machine-checkable answer, frozen with an answer key
  (`evidence/packet-answer-key.json`) before any trial ran. Trials are graded against the
  key, never against each other.
- **Modes.** M0 = one solo worker answers all ten. M1 = three read-only lanes
  (repo / audit / p0b) + coordinator union-synthesis. M2 = four read-only lanes
  (repo / audit / p0b / ledger) + one adversarial verifier that must re-derive every
  answer and refute wrong ones. Three trials per mode (the packet is deterministic).
- **Measurement.** Per agent: exact token count, tool-call count, and wall duration from
  the harness usage report (token_source = "harness usage report", exact). Trial wall time
  = slowest lane (+ verifier serially for M2). Coordinator tokens are not separately
  meterable in this harness: recorded as null, token_source UNKNOWN, with synthesis
  labor described qualitatively.
- **Proxy honesty rule.** file_reads/commands inside agents are self-reported by the
  agents and are labeled `token_proxy` quality, never mixed with exact fields.
- **Scenario harnesses** (A, D, F, G) ran only in disposable clones under a scratch fake
  origin — a bare repository seeded with exactly `0d55aa9e` — so no synthetic edit,
  branch, or advance could reach the real remote. Scenario E (one-shot GitHub cycle) and
  Scenario I (evidence lifecycle) are measured on this session's real, authorized run.
- **Concurrency cap.** At most 5 subagents ran at any moment (§7 ownership rule),
  enforced by wave scheduling. The coordinator is the only writer throughout.
- **Node discipline.** Shell default node is v22 (below the `>=24` engine floor); every
  npm gate ran on `/usr/local/bin/node` v24.11.1 and recorded its version. A run below
  the floor is INVALID by rule; none occurred in this run.

## Limits

- Qualitative comparisons (H context experiment) ran one trial each and are labeled so.
- Model variance across trials is captured only by the three-trial spread; no
  temperature control exists in this harness.
- Coordinator-side token use is UNKNOWN by instrumentation limits; all subagent token
  numbers are exact.
- The packet's difficulty is bounded; results generalize to committed-state verification
  tasks, not to open-ended design work.
