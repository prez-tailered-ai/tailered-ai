# Risk register

| # | Risk | Class | Status | Mitigation |
|---|---|---|---|---|
| R1 | Warm-coordinator bias skews M0 wall-time comparisons | measurement | OPEN, declared | reported in `01-scope-and-method.md`; re-run modes cold before treating wall-time deltas as durable |
| R2 | Single-trial variance on mode timings | measurement | OPEN, declared | the token-floor finding replicated ×8; timings labeled single-sample |
| R3 | Coordinator tokens UNKNOWN → totals per mode are lower bounds | measurement | PERMANENT in this harness | proxies recorded; never estimated |
| R4 | Packet strategy can silently omit context on open-ended tasks | method | OPEN | rule frozen: packets for bounded questions only; discovery keeps repo access |
| R5 | `main` may advance again before merge (it advanced twice during this program) | process | LIVE | pre-commit fetch + `merge-tree` rule; compose by merge, never rebase |
| R6 | ADR-005 number could be taken by a decision landing before this PR merges | process | LOW | number re-verified at creation on `0d55aa9e`; PREZ re-checks at merge; a collision demands a renumbered commit, not a force-push |
| R7 | Benchmark scripts under `evidence/` could be mistaken for production automation | governance | GUARDED | `09-automation-readiness.md` states nothing is authorized by listing; no production automation shipped |
| R8 | Synthetic Scenario E repo may under-model real repo scale | method | DECLARED | two live composition events in this program confirm the mechanisms on the real repo |
| R9 | Subagent floor cost (~17.7k tokens) may change with harness versions | economics | DECLARED | re-measure per harness release before relying on the dispatch threshold |
| R10 | This scope writes to the merged audit directory (pointer 17) | governance | CONTAINED | pointer is append-only, renumbers nothing, alters no finding; permitted explicitly by the tasking scope |
