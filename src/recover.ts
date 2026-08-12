import { createHash } from "node:crypto";
import { readFile, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { ADR, EvalRow, ModelTier, RouteLog } from "./contracts.js";
import { isNodeError, writeNewFile } from "./files.js";
import { CompanyLedger, canonicalRecordJson, LedgerIntegrityError } from "./ledger.js";
import { renderAdr } from "./company.js";
import { assessCompanyLock, lockPathFor } from "./lock.js";
import { inspectSequence, SequenceStateError } from "./sequence.js";
import { writeRunArtifact } from "./ship.js";

/**
 * `tailered recover` — explicit, operator-invoked completion of interrupted runs.
 *
 * Recovery is the other half of the A-01/A-02 design (PREZ-ratified 2026-08-12,
 * `docs/foundation/agent-platform-foundation/gate-ledger.jsonl`): the runtime leaves an
 * interrupted run detectable and deterministically completable; this module completes it.
 *
 * Hard rules, enforced structurally:
 *   - `validate` observes and never repairs; THIS command repairs, explicitly, and records it.
 *   - No agent invocation, no model call, no deployment, no external side effect of any kind.
 *     This module imports no agent, spawns no process, and opens no socket.
 *   - A verified live owner is refused. Cross-host or corrupt ownership is quarantined,
 *     never guessed at.
 *   - Replay is byte-exact from FinalizationIntentV2 and idempotent. Any drift quarantines.
 *   - Interrupted calls settle at their recorded hard ceilings, never at zero: overstating
 *     spend is the safe direction under the exclusive budget cap.
 *   - A quarantine record is never deleted or overwritten.
 */

export const QUARANTINE_RELATIVE_DIR = ".tailered/quarantine";

export type RecoveryAction =
  | "NO_ACTION"
  | "REFUSED_LIVE_OWNER"
  | "RECOVERED"
  | "ALREADY_FINALIZED"
  | "QUARANTINED"
  | "FAILED";

export interface RunRecoveryResult {
  run_id: string;
  action: RecoveryAction;
  detail: string;
  /** True when --dry-run: the action is what WOULD happen; nothing was mutated. */
  planned?: boolean;
}

export interface RecoveryReport {
  schema_version: number;
  root: string;
  dry_run: boolean;
  started_at: string;
  finished_at: string;
  lock: string;
  results: RunRecoveryResult[];
}

interface StartedRecord {
  schema_version?: number;
  run_id?: string;
  spec_id?: string;
  task?: string;
  hard_cost_ceiling_usd?: number;
  caused_by?: string[];
}

interface CallStartRecord {
  call_id?: string;
  route_id?: string;
  tier?: string;
  hard_cost_ceiling_usd?: number;
  hard_token_ceiling?: number;
}

interface IntentV2 {
  schema_version?: number;
  run_id?: string;
  spec_id?: string;
  adr?: ADR;
  eval?: EvalRow;
  payload_sha256?: { adr?: string; eval?: string };
}

function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function readJsonFile<T>(path: string): Promise<T | "absent" | "unreadable"> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return "absent";
    return "unreadable";
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return "unreadable";
  }
}

/**
 * Write a quarantine record. `wx`-created: a prior record is never deleted or overwritten,
 * and re-quarantining an already-quarantined run reports the existing record instead.
 */
async function quarantine(
  root: string,
  mutate: boolean,
  input: {
    runId: string;
    reason_code: string;
    observed_state: unknown;
    ownership_evidence: unknown;
    conflicting_identifiers: string[];
    hashes: Record<string, string>;
    recovery_attempt: string;
    caused_by: string[];
    operator_action: string;
  },
): Promise<RunRecoveryResult> {
  const path = resolve(root, QUARANTINE_RELATIVE_DIR, `${input.runId}.json`);
  const record = {
    schema_version: 1,
    run_id: input.runId,
    reason_code: input.reason_code,
    observed_state: input.observed_state,
    ownership_evidence: input.ownership_evidence,
    conflicting_identifiers: input.conflicting_identifiers,
    hashes: input.hashes,
    quarantined_at: new Date().toISOString(),
    actor: "tailered-recover",
    recovery_attempt: input.recovery_attempt,
    caused_by: input.caused_by,
    operator_action_required: input.operator_action,
  };
  if (!mutate) {
    return {
      run_id: input.runId,
      action: "QUARANTINED",
      detail: `would quarantine: ${input.reason_code}`,
      planned: true,
    };
  }
  try {
    await writeNewFile(path, `${JSON.stringify(record, null, 2)}\n`);
    return { run_id: input.runId, action: "QUARANTINED", detail: input.reason_code };
  } catch (error) {
    if (isNodeError(error) && error.code === "EEXIST") {
      return {
        run_id: input.runId,
        action: "QUARANTINED",
        detail: `${input.reason_code} (a prior quarantine record exists and was preserved)`,
      };
    }
    throw error;
  }
}

/** The finalized marker recovery writes is byte-compatible with the one the ship loop writes. */
async function writeMarker(
  root: string,
  runId: string,
  evalRow: EvalRow,
): Promise<void> {
  await writeRunArtifact(root, runId, "finalized.json", {
    schema_version: 2,
    run_id: runId,
    eval_id: evalRow.id,
    adr_id: evalRow.adr_id,
    ...(evalRow.gate_label_id ? { gate_label_id: evalRow.gate_label_id } : {}),
    outcome: evalRow.outcome,
    finalized_at: new Date().toISOString(),
    caused_by: [evalRow.id, evalRow.adr_id, evalRow.spec_id],
  });
}

export async function recoverCompany(
  root: string,
  options: { runId?: string; dryRun?: boolean } = {},
): Promise<RecoveryReport> {
  const startedAt = new Date().toISOString();
  const mutate = options.dryRun !== true;
  const ledger = new CompanyLedger(root);
  const results: RunRecoveryResult[] = [];

  // ---- ownership -----------------------------------------------------------
  const lock = await assessCompanyLock(root);
  if (lock.state === "live") {
    return {
      schema_version: 1,
      root,
      dry_run: !mutate,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      lock: `live owner pid ${lock.owner.pid} on ${lock.owner.host} (${lock.owner.operation})`,
      results: [
        {
          run_id: options.runId ?? "*",
          action: "REFUSED_LIVE_OWNER",
          detail:
            "A verified live process holds the repository lock. Recovery never runs " +
            "concurrently with a live owner.",
        },
      ],
    };
  }
  if (lock.state === "foreign" || lock.state === "corrupt") {
    const detailText =
      lock.state === "foreign"
        ? `foreign-host owner pid ${lock.owner.pid} on "${lock.owner.host}" — liveness cannot be verified across hosts`
        : `corrupt lock ownership: ${lock.reason}`;
    const quarantineResult = await quarantine(root, mutate, {
      runId: lock.state === "foreign" ? (lock.owner.run_id ?? "LOCK") : "LOCK",
      reason_code: lock.state === "foreign" ? "AMBIGUOUS_FOREIGN_LOCK" : "CORRUPT_LOCK_OWNERSHIP",
      observed_state: lock,
      ownership_evidence: lock.state === "foreign" ? lock.owner : lock.reason,
      conflicting_identifiers: [],
      hashes: {},
      recovery_attempt: startedAt,
      caused_by: [],
      operator_action:
        "Confirm no Tailered process runs against this repository from any host, remove " +
        `${lockPathFor(root)} by hand, resolve the quarantine record, then re-run recover.`,
    });
    return {
      schema_version: 1,
      root,
      dry_run: !mutate,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      lock: detailText,
      results: [quarantineResult],
    };
  }
  if (lock.state === "dead") {
    // Provably dead same-host owner: reclaim under the existing lock contract.
    if (mutate) await rm(lockPathFor(root), { recursive: true, force: true });
  }

  // ---- run enumeration -----------------------------------------------------
  const runsRoot = resolve(root, "evals/runs");
  let runDirs: string[] = [];
  try {
    runDirs = (await readdir(runsRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") throw error;
  }
  if (options.runId !== undefined) {
    runDirs = runDirs.filter((name) => name === options.runId);
    if (runDirs.length === 0) {
      results.push({
        run_id: options.runId,
        action: "NO_ACTION",
        detail: "no run directory exists for this run id",
      });
    }
  }

  const evals = await ledger.evals();
  const routes = await ledger.routes();

  for (const runId of runDirs) {
    results.push(await recoverOneRun(root, ledger, runId, evals, routes, mutate));
  }

  return {
    schema_version: 1,
    root,
    dry_run: !mutate,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    lock: lock.state === "dead" ? `reclaimed provably dead owner pid ${lock.owner.pid}` : "none",
    results,
  };
}

async function recoverOneRun(
  root: string,
  ledger: CompanyLedger,
  runId: string,
  evals: EvalRow[],
  routes: RouteLog[],
  mutate: boolean,
): Promise<RunRecoveryResult> {
  const runDir = resolve(root, "evals/runs", runId);
  const started = await readJsonFile<StartedRecord>(resolve(runDir, "started.json"));
  const intent = await readJsonFile<IntentV2>(resolve(runDir, "finalization-intent.json"));
  const marker = await readJsonFile<Record<string, unknown>>(resolve(runDir, "finalized.json"));
  const evalRow = evals.find((row) => row.run_id === runId);

  if (started === "absent") {
    return {
      run_id: runId,
      action: "NO_ACTION",
      detail: "no start record; nothing was begun that recovery could complete",
    };
  }
  if (started === "unreadable") {
    return quarantine(root, mutate, {
      runId,
      reason_code: "UNREADABLE_START_RECORD",
      observed_state: { started: "unreadable" },
      ownership_evidence: null,
      conflicting_identifiers: [],
      hashes: {},
      recovery_attempt: new Date().toISOString(),
      caused_by: [],
      operator_action: "Inspect evals/runs/" + runId + "/started.json by hand.",
    });
  }

  // ---- already finalized ---------------------------------------------------
  if (marker !== "absent") {
    if (marker === "unreadable") {
      return quarantine(root, mutate, {
        runId,
        reason_code: "UNREADABLE_FINALIZED_MARKER",
        observed_state: { marker: "unreadable" },
        ownership_evidence: null,
        conflicting_identifiers: [],
        hashes: {},
        recovery_attempt: new Date().toISOString(),
        caused_by: [],
        operator_action: "Inspect evals/runs/" + runId + "/finalized.json by hand.",
      });
    }
    const markerEvalId = marker.eval_id;
    if (evalRow === undefined || evalRow.id !== markerEvalId) {
      return quarantine(root, mutate, {
        runId,
        reason_code: "MARKER_WITHOUT_MATCHING_EVAL",
        observed_state: { marker, have_eval: evalRow?.id ?? null },
        ownership_evidence: null,
        conflicting_identifiers: [String(markerEvalId)],
        hashes: {},
        recovery_attempt: new Date().toISOString(),
        caused_by: [],
        operator_action: "The finalized marker names artifacts that do not exist. Audit the run.",
      });
    }
    return {
      run_id: runId,
      action: "ALREADY_FINALIZED",
      detail: `marker, terminal eval ${evalRow.id}, and ADR ${evalRow.adr_id} verified present`,
    };
  }

  // ---- intent present ------------------------------------------------------
  if (intent !== "absent") {
    if (intent === "unreadable" || intent.schema_version !== 2) {
      return quarantine(root, mutate, {
        runId,
        reason_code: intent === "unreadable" ? "UNREADABLE_INTENT" : "UNKNOWN_INTENT_SCHEMA",
        observed_state: {
          intent: intent === "unreadable" ? "unreadable" : { schema_version: intent.schema_version },
        },
        ownership_evidence: null,
        conflicting_identifiers: [],
        hashes: {},
        recovery_attempt: new Date().toISOString(),
        caused_by: [],
        operator_action:
          "The finalization intent cannot be interpreted by this build. Do not guess; audit it.",
      });
    }
    const adr = intent.adr;
    const intended = intent.eval;
    if (adr === undefined || intended === undefined) {
      return quarantine(root, mutate, {
        runId,
        reason_code: "INCOMPLETE_INTENT",
        observed_state: { has_adr: adr !== undefined, has_eval: intended !== undefined },
        ownership_evidence: null,
        conflicting_identifiers: [],
        hashes: {},
        recovery_attempt: new Date().toISOString(),
        caused_by: [],
        operator_action: "The intent lacks a payload and cannot be replayed.",
      });
    }

    // Verify every recorded property before replaying anything.
    const adrHash = sha256Hex(canonicalRecordJson(adr));
    const evalHash = sha256Hex(canonicalRecordJson(intended));
    const drift: string[] = [];
    if (intent.payload_sha256?.adr !== adrHash) drift.push("adr payload hash");
    if (intent.payload_sha256?.eval !== evalHash) drift.push("eval payload hash");
    if (intended.adr_id !== adr.id) drift.push("eval does not reference the intended ADR");
    if (intended.run_id !== runId) drift.push("eval run_id mismatch");
    if (intent.run_id !== runId) drift.push("intent run_id mismatch");
    if (intended.spec_id !== intent.spec_id) drift.push("spec_id mismatch");
    if (!intended.caused_by.includes(adr.id)) drift.push("eval caused_by lacks the intended ADR");

    try {
      const sequence = await inspectSequence(root);
      const evalNumber = Number(/^EVAL-(\d+)$/u.exec(intended.id)?.[1] ?? Number.NaN);
      const adrNumber = Number(/^ADR-(\d+)$/u.exec(adr.id)?.[1] ?? Number.NaN);
      if (sequence.state === null) drift.push("allocator state missing while identifiers are reserved");
      else {
        if (!(sequence.state.issued.EVAL >= evalNumber)) drift.push("EVAL identifier no longer reserved");
        if (!(sequence.state.issued.ADR >= adrNumber)) drift.push("ADR identifier no longer reserved");
      }
    } catch (error) {
      if (error instanceof SequenceStateError) drift.push(`allocator: ${error.reason}`);
      else throw error;
    }

    if (drift.length > 0) {
      return quarantine(root, mutate, {
        runId,
        reason_code: "INTENT_DRIFT",
        observed_state: { drift },
        ownership_evidence: null,
        conflicting_identifiers: [adr.id, intended.id],
        hashes: { adr_expected: intent.payload_sha256?.adr ?? "", adr_actual: adrHash, eval_expected: intent.payload_sha256?.eval ?? "", eval_actual: evalHash },
        recovery_attempt: new Date().toISOString(),
        caused_by: [intent.spec_id ?? ""],
        operator_action: "The recorded intent disagrees with itself or with allocator state. Audit before any replay.",
      });
    }

    // If a terminal row already exists it must BE the intended row; then only the marker is owed.
    if (evalRow !== undefined) {
      if (canonicalRecordJson(evalRow) !== canonicalRecordJson(intended)) {
        return quarantine(root, mutate, {
          runId,
          reason_code: "CONFLICTING_TERMINAL_ROW",
          observed_state: { existing_eval: evalRow.id, intended_eval: intended.id },
          ownership_evidence: null,
          conflicting_identifiers: [evalRow.id, intended.id],
          hashes: { intended: evalHash, existing: sha256Hex(canonicalRecordJson(evalRow)) },
          recovery_attempt: new Date().toISOString(),
          caused_by: [intended.spec_id],
          operator_action:
            "A terminal row exists for this run and differs from the recorded intent. " +
            "Exactly-one is preserved; the divergence needs a human decision.",
        });
      }
      const adrOnDisk = await readJsonFileText(resolve(root, "decisions", `${adr.id}.md`));
      if (adrOnDisk === null || adrOnDisk !== renderAdr(adr)) {
        return quarantine(root, mutate, {
          runId,
          reason_code: "ADR_DRIFT_BEHIND_EXISTING_ROW",
          observed_state: { adr_present: adrOnDisk !== null },
          ownership_evidence: null,
          conflicting_identifiers: [adr.id],
          hashes: {},
          recovery_attempt: new Date().toISOString(),
          caused_by: [intended.spec_id],
          operator_action: "The terminal row exists but its ADR is absent or differs. Audit.",
        });
      }
      if (mutate) await writeMarker(root, runId, intended);
      return {
        run_id: runId,
        action: "RECOVERED",
        detail: "terminal row and ADR were already exact; the finalized marker was completed",
        ...(mutate ? {} : { planned: true }),
      };
    }

    // Full replay: ADR first, the evaluation that references it second, marker last.
    if (!mutate) {
      return {
        run_id: runId,
        action: "RECOVERED",
        detail: `would replay intent: ADR ${adr.id}, then eval ${intended.id}, then the marker`,
        planned: true,
      };
    }
    try {
      await ledger.transact({ operation: "recover-replay", runId }, async (tx) => {
        await tx.appendReservedAdr(adr);
        await tx.appendTerminalEval(intended);
      });
      await writeMarker(root, runId, intended);
    } catch (error) {
      if (error instanceof LedgerIntegrityError) {
        return quarantine(root, true, {
          runId,
          reason_code: "CONFLICTING_REPLAY",
          observed_state: { error: error.message },
          ownership_evidence: null,
          conflicting_identifiers: [adr.id, intended.id],
          hashes: { intended_eval: evalHash },
          recovery_attempt: new Date().toISOString(),
          caused_by: [intended.spec_id],
          operator_action: "Replaying the recorded intent conflicted with canonical state. Audit.",
        });
      }
      throw error;
    }
    return {
      run_id: runId,
      action: "RECOVERED",
      detail: `intent replayed exactly: ADR ${adr.id}, terminal eval ${intended.id}, marker written`,
    };
  }

  // ---- started, no intent: abandoned before finalization -------------------
  if (evalRow !== undefined) {
    // A terminal row with neither intent nor marker predates the A-02 discipline or was
    // written by something else. Recovery does not guess.
    return quarantine(root, mutate, {
      runId,
      reason_code: "ROW_WITHOUT_INTENT",
      observed_state: { eval: evalRow.id },
      ownership_evidence: null,
      conflicting_identifiers: [evalRow.id],
      hashes: {},
      recovery_attempt: new Date().toISOString(),
      caused_by: [evalRow.spec_id],
      operator_action: "A terminal row exists with no recorded intent. Audit its provenance.",
    });
  }

  const specId = started.spec_id;
  if (typeof specId !== "string" || specId === "") {
    return quarantine(root, mutate, {
      runId,
      reason_code: "START_RECORD_INCOMPLETE",
      observed_state: { started },
      ownership_evidence: null,
      conflicting_identifiers: [],
      hashes: {},
      recovery_attempt: new Date().toISOString(),
      caused_by: [],
      operator_action: "started.json lacks the fields conservative settlement needs.",
    });
  }

  // Conservative settlement: completed calls at recorded usage, interrupted calls at ceilings.
  const runRoutes = routes.filter((row) => row.run_id === runId);
  const completedCallIds = new Set(runRoutes.map((row) => row.call_id));
  const tokensByTier: Record<ModelTier, number> = { frontier: 0, mid: 0, cheap: 0 };
  let costUsd = 0;
  for (const row of runRoutes) {
    costUsd += row.cost_usd;
    tokensByTier[row.tier] += row.tokens.input + row.tokens.output;
  }

  let interrupted = 0;
  let callsDir: string[] = [];
  try {
    callsDir = (await readdir(resolve(runDir, "calls"))).filter((name) =>
      /^CALL-\d+\.started\.json$/u.test(name),
    );
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") throw error;
  }
  for (const name of callsDir) {
    const record = await readJsonFile<CallStartRecord>(resolve(runDir, "calls", name));
    if (record === "absent") continue;
    if (record === "unreadable") {
      return quarantine(root, mutate, {
        runId,
        reason_code: "UNREADABLE_CALL_START",
        observed_state: { file: name },
        ownership_evidence: null,
        conflicting_identifiers: [],
        hashes: {},
        recovery_attempt: new Date().toISOString(),
        caused_by: [specId],
        operator_action:
          "A call-start record cannot be read, so exact conservative settlement is impossible.",
      });
    }
    const callId = record.call_id ?? name.replace(/\.started\.json$/u, "");
    if (completedCallIds.has(callId)) continue;
    const ceilingCost = record.hard_cost_ceiling_usd;
    const ceilingTokens = record.hard_token_ceiling;
    const tier = record.tier;
    if (
      typeof ceilingCost !== "number" ||
      typeof ceilingTokens !== "number" ||
      (tier !== "frontier" && tier !== "mid" && tier !== "cheap")
    ) {
      return quarantine(root, mutate, {
        runId,
        reason_code: "CALL_START_MISSING_CEILINGS",
        observed_state: { file: name, record },
        ownership_evidence: null,
        conflicting_identifiers: [callId],
        hashes: {},
        recovery_attempt: new Date().toISOString(),
        caused_by: [specId],
        operator_action: "The call-start record lacks the ceilings conservative settlement needs.",
      });
    }
    interrupted += 1;
    costUsd += ceilingCost; // never zero: the ceiling is the safe overstatement
    tokensByTier[tier] += ceilingTokens;
  }

  const ceiling = typeof started.hard_cost_ceiling_usd === "number" ? started.hard_cost_ceiling_usd : Number.POSITIVE_INFINITY;
  const outcome: EvalRow["outcome"] = costUsd >= ceiling ? "halted_budget" : "halted_attempts";
  const blocker =
    `Run interrupted before finalization and completed by tailered recover. ` +
    `${runRoutes.length} completed call(s) settled at recorded usage; ${interrupted} ` +
    `interrupted call(s) settled conservatively at their recorded hard ceilings. ` +
    `Acceptance-test state at interruption is unknown and recorded as none passed.`;

  if (!mutate) {
    return {
      run_id: runId,
      action: "RECOVERED",
      detail: `would finalize abandonment: outcome ${outcome}, conservative cost ${costUsd.toFixed(3)}`,
      planned: true,
    };
  }

  // A run killed before its `finally` block never stored its replay spec; a run killed inside
  // finalization already has one, written by the ship loop with its full acceptance tests. An
  // existing spec is AUTHORITATIVE and is never touched — the first crash-matrix run proved
  // that reconstructing over it throws on the content difference. Reconstruction happens only
  // when the file is genuinely absent.
  const specPath = resolve(runDir, "spec.json");
  const existingSpec = await readJsonFileText(specPath);
  if (existingSpec === null) {
    await writeRunArtifact(root, runId, "spec.json", {
      id: specId,
      text: typeof started.task === "string" ? started.task : "(spec text was not recorded)",
      acceptance_tests: [],
      caused_by: Array.isArray(started.caused_by) && started.caused_by.length > 0 ? started.caused_by : [specId],
    });
  }

  await ledger.transact({ operation: "recover-abandoned", runId }, async (tx) => {
    const issued = await tx.allocate({ EVAL: 1, ADR: 1 });
    const evalId = issued.EVAL[0];
    const adrId = issued.ADR[0];
    if (evalId === undefined || adrId === undefined) {
      throw new LedgerIntegrityError("The allocator returned no identifiers for recovery.");
    }
    const createdAt = new Date().toISOString();
    const adr: ADR = {
      id: adrId,
      title: "Record an interrupted run through recovery",
      context: `Run ${runId} attempted spec ${specId} and its process terminated before finalization. Recovery reconstructed conservative terminal accounting from the durable start records.`,
      decision: `Record the run as ${outcome} with conservative ceiling-based settlement and preserve its causal links.`,
      alternatives_rejected: [
        "Settle interrupted calls at zero, which would understate spend under the exclusive cap.",
        "Discard the run, which would violate the one-terminal-row invariant.",
      ],
      consequences: [
        "The failure half of the tokens-per-outcome curve remains measurable.",
        "Recorded cost may overstate true spend; it never understates it.",
      ],
      status: "accepted",
      caused_by: [specId],
    };
    const row: EvalRow = {
      id: evalId,
      run_id: runId,
      spec_id: specId,
      outcome,
      tests_passed: [],
      tests_total: 0,
      tokens_by_tier: tokensByTier,
      wall_time_ms: 0,
      cost_usd: costUsd,
      adr_id: adrId,
      blocker,
      created_at: createdAt,
      caused_by: [adrId, specId],
    };
    // The same discipline the ship loop uses: complete intent, ADR, row, marker.
    await writeRunArtifact(root, runId, "finalization-intent.json", {
      schema_version: 2,
      run_id: runId,
      spec_id: specId,
      adr,
      eval: row,
      accounting: { settled_usd: costUsd, tokens_by_tier: tokensByTier },
      payload_sha256: {
        adr: sha256Hex(canonicalRecordJson(adr)),
        eval: sha256Hex(canonicalRecordJson(row)),
      },
      intent_written_at: createdAt,
      caused_by: [specId, adrId],
    });
    await tx.appendReservedAdr(adr);
    await tx.appendTerminalEval(row);
    await writeMarker(root, runId, row);
  });

  return {
    run_id: runId,
    action: "RECOVERED",
    detail: `abandonment finalized: outcome ${outcome}, ${runRoutes.length} completed + ${interrupted} interrupted call(s), conservative cost ${costUsd.toFixed(3)}`,
  };
}

async function readJsonFileText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return null;
    throw error;
  }
}
