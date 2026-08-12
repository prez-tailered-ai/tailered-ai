# Terminal ledger (committed pre-push; the PR number and CI run ids postdate this file by construction and are bound in the PR body)

| Item | Value |
|---|---|
| Overall status | NEEDS_PREZ |
| Base | main 0d55aa9e6fb774903355d8aea2ad40162cde0104 |
| Proposed ADR | decisions/ADR-005.md, status proposed |
| Ruflo runtime used | No |
| Runtime files changed | 0 (zero src/, test/, package*, tsconfig, CI, deployment paths) |
| Deployment | None |
| Modes | M0 first-pass 7/10 -> 10/10 after 1 repair; M1 10/10 (77,743 lane tokens); M2 10/10 + 1 temporal refutation caught (140,754 tokens) |
| Selected default topology | M0 with escalation rules (M0+) |
| Scenarios | A live PASS; D 6/6 + 2 live catches; E 6/6; F packets -35% tokens / -88% wall |
| Dimensions | 90/100, zero hard blockers |
| Next owner | PREZ |
