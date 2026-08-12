# Recovery runbook — `tailered recover`

**Command:** `node dist/src/cli.js recover --repo <path> [--run <run-id>] [--dry-run]`
**Exit codes:** 0 = every result in {NO_ACTION, RECOVERED, ALREADY_FINALIZED}; 2 = at least one
QUARANTINED; 1 = REFUSED_LIVE_OWNER, FAILED, or a thrown error.

`validate` observes and never repairs. `recover` repairs, explicitly, and records what it did.
Run `--dry-run` first: it mutates zero bytes (tree-hash proven by test) and reports the planned
action per run.

## When to run it

Run recovery when `validate` reports any of: an unmatched run start, an unresolved finalization
intent, a stale repository lock, or after any process running a ship loop was killed.

## What it does, per observed state

| Observed state | Action |
| --- | --- |
| Lock held by a verified live same-host process | **Refuse.** Nothing runs concurrently with a live owner. |
| Lock owner provably dead on this host (`ESRCH`) | Reclaim the lock, then proceed. |
| Lock owned by a foreign host, or corrupt owner metadata | **Quarantine.** Cross-host liveness cannot be probed. |
| No `started.json` | `NO_ACTION`. Nothing was begun. |
| `finalized.json` present and consistent | `ALREADY_FINALIZED`. |
| FinalizationIntentV2 present, terminal row absent | Verify both payload hashes, the own-ADR reference, and the identifier reservations; then replay **exactly**: ADR first, the evaluation second, the marker last. Any drift → quarantine. |
| Terminal row present, marker absent, row equals intent | Complete the marker only. |
| `started.json` present, no intent (abandoned before finalization) | Settle completed calls at recorded usage and interrupted calls at their recorded hard ceilings — **never zero, never `shipped`** — then finalize with a new abandonment ADR and terminal row through the normal intent discipline. An existing `spec.json` is authoritative; it is reconstructed from the start record only when absent. |
| Conflicting terminal row, broken hash, unknown intent schema, irreconcilable accounting | **Quarantine.** |

## What it never does

Recovery never invokes an agent, calls a model, runs a test command, deploys a preview, opens a
socket, repeats a charge, or recreates any completed external effect. The module's import
surface proves it structurally (`test/recover.test.ts`).

## Quarantine

Records live at `.tailered/quarantine/<run-id>.json`, are `wx`-created, and are never deleted or
overwritten. Each carries the run, a reason code, the observed state, ownership evidence,
conflicting identifiers, hashes, timestamps, and the exact operator action required. `validate`
treats an unresolved quarantine as non-green. To resolve one: perform the named operator action,
then write `.tailered/quarantine/<run-id>.resolved.json` describing what was done. Never edit or
remove the original record.

## Idempotence

Replays are byte-exact and re-runnable: an identical replay is a no-op, a second `recover` on a
completed run reports `ALREADY_FINALIZED` and changes nothing (tree-hash proven by test).

## Assurance boundary

VERIFIED: tested process-crash and `SIGKILL` recovery (`evidence/crash-matrix.json`).
NOT VERIFIED: sudden power loss, kernel panic, or storage-device loss.
