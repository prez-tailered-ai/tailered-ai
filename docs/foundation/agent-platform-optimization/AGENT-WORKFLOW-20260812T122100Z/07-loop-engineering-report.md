# Repair-loop engineering report (Scenario D + live events)

**Evidence:** `evidence/scenD-*.txt`; disposable clone in the session scratchpad; all failed
attempts retained.

## Injected fault classes

| Class | Detection | Repair | Attempts | Verdict |
|---|---|---|---|---|
| D1 word-splitting | rc=127, "command not found: echo injected-args" | forced split (`${=C}`) | 2 | VERIFIED |
| D2 seeded failing test | runner exit 1 naming the seeded test | remove seed; narrow rerun; dependent rerun | 2 valid (+1 INVALID env attempt) | VERIFIED |
| D3 false-green wrapper | exit 0 over a failed inner command; independent check flags it | `pipefail` + propagate | 2 | VERIFIED |
| D4 invalid mutation | anchor matched 0 times, expected exactly 1 | none needed — verdict INVALID, never CAUGHT | 1 | VERIFIED |
| D5 stale-main base | behind-count 2 on fetch | normal merge, ancestor preserved, no rebase | 1 | VERIFIED |
| D6 contradictory lane claims | direct coordinator read (5 ADRs) | refute one lane with evidence | 1 | VERIFIED |

## The two unplanned catches — the most valuable data in this scenario

1. **D2 attempt 1 was INVALID, not a detection.** The fresh clone had no `node_modules`, so
   `npm test` exited 127 on `tsc: not found`. A nonzero exit for the WRONG reason must never
   count as fault detection; the attempt is retained as INVALID and the environment was
   repaired first. This is the false-green class in its subtlest form: a red that lies.
2. **The narrow rerun lied; the dependent rerun caught it.** `tsc` does not delete outputs, so
   the compiled seed survived in `dist/` after the source was removed. The narrow single-suite
   rerun was green; the dependent full rerun failed 143/1. Rule extracted: a narrow rerun
   closes a failure only together with its dependent rerun — for this repository, any
   source-file REMOVAL requires a clean of the matching `dist/` artifact or a fresh build
   directory, or the glob resurrects the ghost.

## Live (non-injected) instances from this same session

- Closing-regression attempts 1–6 in P0-B failed on the same D1 word-splitting class in my own
  driver loop; the recorded wrapper reported the truth and the six FAILs are committed evidence.
- The threat-matrix false green (exit 0 with 18/18 `MINT_FAILED`) was caught only by inspecting
  the verdict column — the script's own exit code is not a valid oracle.

## Three-attempt discipline

No class needed a third attempt. The rule held: retain, name the direct cause, smallest
in-scope fix, new attempt number, narrow rerun, then dependent rerun.
