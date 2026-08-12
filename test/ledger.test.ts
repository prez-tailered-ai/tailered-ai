import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { mintCompany } from "../src/company.js";
import type { ADR, EvalRow, RouteLog } from "../src/contracts.js";
import { TodoDemoAgent } from "../src/demo-agent.js";
import { appendJsonLine, readJsonLines } from "../src/files.js";
import { CompanyLedger, LedgerIntegrityError, type LedgerTx } from "../src/ledger.js";
import { LockOwnershipError, lockPathFor } from "../src/lock.js";
import { FixedGate, taileredShip } from "../src/ship.js";

async function makeCompany(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "p0b-ledger-test-"));
  await mintCompany(root, {
    what: "We are building a fixture company that proves ledger transaction integrity.",
    forWhom: "It serves one auditor who needs canonical appends to be exactly-once.",
    winningLooksLike: "Winning means every retry is a no-op or a typed error, never a duplicate.",
    constraints: "The fixture stays disposable, makes zero model calls, and spends nothing.",
  });
  return root;
}

function routeRow(id: string, note: string): RouteLog {
  return {
    id,
    call_id: id.replace(/^ROUTE-/u, "CALL-"),
    run_id: "RUN-LEDGER-TEST",
    task_kind: "codegen",
    tier: "cheap",
    model: "registry-cheap",
    reason: note,
    attempts: 0,
    tokens: { input: 1, output: 1 },
    cost_usd: 0,
    status: "completed",
    context: {
      repo_hash: "a".repeat(64),
      snapshot_ref: "evals/runs/RUN-LEDGER-TEST/contexts/" + "a".repeat(64) + ".json",
      bytes: 2,
      cache_hit: false,
      assembly_ms: 1,
    },
    trace_ref: `evals/runs/RUN-LEDGER-TEST/calls/${id.replace(/^ROUTE-/u, "CALL-")}.json`,
    created_at: "2026-08-12T00:00:00.000Z",
    caused_by: ["SPEC-LEDGER-TEST"],
  };
}

// ---------------------------------------------------------- retry semantics --

test("ledger: an EXACT append retry is a no-op, never a duplicate row", async () => {
  // Failure mechanism (R3): a replayed interrupted run re-appends the same record. Without
  // idempotence the replay either duplicates the row or halts a recoverable run.
  const root = await makeCompany();
  const ledger = new CompanyLedger(root);
  const row = routeRow("ROUTE-000001", "first write");

  const first = await ledger.transact({ operation: "t" }, (tx) => tx.appendRouteLog(row));
  // The retry reorders keys to prove comparison is canonical, not byte-order sensitive.
  // (A first version used JSON.stringify(row, sortedKeys), but a replacer ARRAY is an
  // allow-list applied at every nesting level — it silently stripped the nested fields and
  // built a genuinely different row, which the ledger correctly refused.)
  const reordered = Object.fromEntries(
    Object.entries(row).reverse(),
  ) as unknown as RouteLog;
  const second = await ledger.transact({ operation: "t" }, (tx) =>
    tx.appendRouteLog(reordered),
  );

  assert.equal(first, "appended");
  assert.equal(second, "already-present", "an exact retry must be a detectable no-op");
  const rows = await ledger.routes();
  assert.equal(rows.length, 1, "the retry must not produce a second row");
  await rm(root, { recursive: true, force: true });
});

test("ledger: a CONFLICTING retry raises a typed integrity error, never a duplicate", async () => {
  const root = await makeCompany();
  const ledger = new CompanyLedger(root);
  await ledger.transact({ operation: "t" }, (tx) =>
    tx.appendRouteLog(routeRow("ROUTE-000001", "original")),
  );
  await assert.rejects(
    () =>
      ledger.transact({ operation: "t" }, (tx) =>
        tx.appendRouteLog(routeRow("ROUTE-000001", "DIFFERENT content")),
      ),
    LedgerIntegrityError,
  );
  assert.equal((await ledger.routes()).length, 1);
  await rm(root, { recursive: true, force: true });
});

test("ledger: an EXACT reserved-ADR retry is a no-op; a conflicting one is refused", async () => {
  const root = await makeCompany();
  const ledger = new CompanyLedger(root);
  const adr: ADR = {
    id: "ADR-002",
    title: "Terminal decision for the retry test",
    context: "A finalization was interrupted and replayed with identical content.",
    decision: "Accept the identical replay as the same decision.",
    alternatives_rejected: ["Treat an identical replay as a conflict."],
    consequences: ["Recovery can replay a recorded intent safely."],
    status: "accepted",
    caused_by: ["ADR-001"],
  };

  const first = await ledger.transact({ operation: "t" }, (tx) => tx.appendReservedAdr(adr));
  const second = await ledger.transact({ operation: "t" }, (tx) => tx.appendReservedAdr(adr));
  assert.equal(first.created, true);
  assert.equal(second.created, false, "an identical replay is the same decision");

  await assert.rejects(
    () =>
      ledger.transact({ operation: "t" }, (tx) =>
        tx.appendReservedAdr({ ...adr, decision: "A DIFFERENT decision." }),
      ),
    LedgerIntegrityError,
    "accepted ADRs are never edited",
  );
  await rm(root, { recursive: true, force: true });
});

// ------------------------------------------------------- lock re-proof -------

test("ledger: losing the lock mid-transaction fails the append closed", async () => {
  // Failure mechanism: a transaction is a claim about the past. If the lock is reclaimed or
  // destroyed while the transaction is live, continuing to append would be exactly the
  // unlocked mutation the lock exists to prevent.
  const root = await makeCompany();
  const ledger = new CompanyLedger(root);
  await assert.rejects(
    () =>
      ledger.transact({ operation: "t" }, async (tx) => {
        await rm(join(lockPathFor(root), "owner.json"), { force: true });
        return tx.appendRouteLog(routeRow("ROUTE-000001", "after lock loss"));
      }),
    (error: unknown) => {
      // The work fails with LockOwnershipError; release then also fails, so both surface.
      if (error instanceof AggregateError) {
        assert.ok(error.errors[0] instanceof LockOwnershipError);
        return true;
      }
      assert.ok(error instanceof LockOwnershipError);
      return true;
    },
  );
  assert.equal((await ledger.routes()).length, 0, "nothing may be appended after lock loss");
  await rm(root, { recursive: true, force: true });
});

test("ledger: a transaction that escaped its critical section cannot append", async () => {
  // Failure mechanism: the class is not exported and its constructor is private, so a caller
  // cannot fabricate one — but a captured reference outlives the lock. The moment-of-use
  // proof is what makes the escape harmless.
  const root = await makeCompany();
  const ledger = new CompanyLedger(root);
  let escaped: LedgerTx | null = null;
  await ledger.transact({ operation: "t" }, async (tx) => {
    escaped = tx;
  });
  assert.ok(escaped !== null);
  await assert.rejects(
    () => (escaped as LedgerTx).appendRouteLog(routeRow("ROUTE-000001", "escaped")),
    LockOwnershipError,
  );
  assert.equal((await ledger.routes()).length, 0);
  await rm(root, { recursive: true, force: true });
});

// ------------------------------------------- A-02: no fallback, recoverable --

test("ship: a finalization conflict leaves a RECOVERABLE run, never a fallback or duplicate", async () => {
  // Failure mechanism (A-02): the pre-hardening code substituted the causal ADR when the
  // terminal ADR failed, producing a structurally valid but semantically false row. Under
  // A-02 the failure propagates: the intent holds the exact intended payloads, no duplicate
  // terminal row exists, and no fallback reference is ever written.
  const root = await makeCompany();
  const runId = "RUN-20260812000000000-a02test1";

  // Seed a conflicting terminal row for the same run BEFORE the run finalizes.
  const conflicting: EvalRow = {
    id: "EVAL-999999",
    run_id: runId,
    spec_id: "SPEC-OTHER",
    outcome: "halted_attempts",
    tests_passed: [],
    tests_total: 0,
    tokens_by_tier: { frontier: 0, mid: 0, cheap: 0 },
    wall_time_ms: 1,
    cost_usd: 0,
    adr_id: "ADR-001",
    blocker: "seeded conflicting terminal row",
    created_at: "2026-08-12T00:00:00.000Z",
    caused_by: ["ADR-001"],
  };
  await appendJsonLine(join(root, "evals/ledger.jsonl"), conflicting);

  await assert.rejects(
    () =>
      taileredShip({
        root,
        runId,
        specText: "Build the single-user todo gating demonstration.",
        agent: new TodoDemoAgent(),
        gate: new FixedGate({
          verdict: "approve",
          reasonText: "All generated checks passed and the artifact matches the constitution.",
        }),
      }),
    LedgerIntegrityError,
    "a conflicting terminal row must fail the run, not fork the record",
  );

  // Exactly one terminal row for the run — the seeded one. No duplicate, no overwrite.
  const rows = await readJsonLines<EvalRow>(join(root, "evals/ledger.jsonl"));
  assert.equal(rows.filter((row) => row.run_id === runId).length, 1);

  // The run is detectable and deterministically completable: start record + full intent.
  const started = JSON.parse(
    await readFile(join(root, "evals/runs", runId, "started.json"), "utf8"),
  ) as { run_id: string };
  assert.equal(started.run_id, runId);

  const intent = JSON.parse(
    await readFile(join(root, "evals/runs", runId, "finalization-intent.json"), "utf8"),
  ) as {
    schema_version: number;
    adr: ADR;
    eval: EvalRow;
    payload_sha256: { adr: string; eval: string };
  };
  assert.equal(intent.schema_version, 2);
  assert.equal(intent.eval.run_id, runId);
  assert.equal(
    intent.eval.adr_id,
    intent.adr.id,
    "the intended row references the run's OWN terminal ADR — never a causal fallback",
  );
  assert.match(intent.payload_sha256.adr, /^[a-f0-9]{64}$/u);
  assert.match(intent.payload_sha256.eval, /^[a-f0-9]{64}$/u);

  // The marker must NOT exist: the run is recoverable, not finalized.
  await assert.rejects(
    () => readFile(join(root, "evals/runs", runId, "finalized.json"), "utf8"),
    /ENOENT/u,
  );
  await rm(root, { recursive: true, force: true });
});

test("ship: a clean run finalizes with its own terminal ADR, a v2 intent, and a v2 marker", async () => {
  const root = await makeCompany();
  const receipt = await taileredShip({
    root,
    specText: "Build the single-user todo gating demonstration.",
    agent: new TodoDemoAgent(),
    gate: new FixedGate({
      verdict: "approve",
      reasonText: "All generated checks passed and the artifact matches the constitution.",
    }),
  });

  const intent = JSON.parse(
    await readFile(join(root, "evals/runs", receipt.runId, "finalization-intent.json"), "utf8"),
  ) as { schema_version: number; adr: ADR; eval: EvalRow };
  const marker = JSON.parse(
    await readFile(join(root, "evals/runs", receipt.runId, "finalized.json"), "utf8"),
  ) as { schema_version: number; eval_id: string; adr_id: string; caused_by: string[] };

  assert.equal(intent.schema_version, 2);
  assert.equal(marker.schema_version, 2);
  assert.equal(receipt.adrId, intent.adr.id, "the receipt names the run's own terminal ADR");
  assert.equal(marker.adr_id, intent.adr.id);
  assert.equal(marker.eval_id, intent.eval.id);
  assert.ok(marker.caused_by.length >= 2, "the marker carries caused_by (AGENTS.md:32)");

  // The written EvalRow is byte-equivalent to the intended one: recovery could have replayed it.
  const rows = await readJsonLines<EvalRow>(join(root, "evals/ledger.jsonl"));
  const written = rows.find((row) => row.run_id === receipt.runId);
  assert.deepEqual(written, intent.eval, "intent and ledger must never drift");
  await rm(root, { recursive: true, force: true });
});
