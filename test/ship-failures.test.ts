import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { installBarrier } from "../src/barrier.js";
import { mintCompany, renderAdr } from "../src/company.js";
import type { EvalRow, GateLabel } from "../src/contracts.js";
import { TodoDemoAgent } from "../src/demo-agent.js";
import { readJsonLines, writeNewFile } from "../src/files.js";
import { CompanyLedger, LedgerIntegrityError } from "../src/ledger.js";
import { LockOwnershipError, lockPathFor } from "../src/lock.js";
import { recoverCompany } from "../src/recover.js";
import { FixedGate, taileredShip } from "../src/ship.js";
import { validateCompany } from "../src/validate.js";

async function makeCompany(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "p0b-shipfail-"));
  await mintCompany(root, {
    what: "We are building a fixture company that proves finalization failure semantics.",
    forWhom: "It serves one auditor who needs every failure path to leave an honest state.",
    winningLooksLike: "Winning means no failure produces a false success or a lost record.",
    constraints: "The fixture stays disposable, makes zero model calls, and spends nothing.",
  });
  return root;
}

const GATE = new FixedGate({
  verdict: "approve",
  reasonText: "All generated checks passed and the artifact matches the constitution.",
});
const SPEC = "Build the single-user todo gating demonstration.";

function label(id: string, note: string): GateLabel {
  return {
    id,
    run_id: "RUN-RETRY-TEST",
    spec_id: "SPEC-RETRY",
    artifact_hash: "b".repeat(64),
    verdict: "approve",
    reason_text: note,
    context_snapshot: "{}",
    created_at: "2026-08-12T00:00:00.000Z",
    caused_by: ["SPEC-RETRY"],
  };
}

function evalRow(id: string, runId: string, note: string): EvalRow {
  return {
    id,
    run_id: runId,
    spec_id: "SPEC-RETRY",
    outcome: "halted_attempts",
    tests_passed: [],
    tests_total: 0,
    tokens_by_tier: { frontier: 0, mid: 0, cheap: 0 },
    wall_time_ms: 1,
    cost_usd: 0,
    adr_id: "ADR-001",
    blocker: note,
    created_at: "2026-08-12T00:00:00.000Z",
    caused_by: ["ADR-001", "SPEC-RETRY"],
  };
}

// -------------------------------------------------- remaining retry families

test("ledger: label exact retry is a no-op; conflicting label retry is a typed error", async () => {
  const root = await makeCompany();
  const ledger = new CompanyLedger(root);
  const row = label("LABEL-000001", "original");
  assert.equal(
    await ledger.transact({ operation: "t" }, (tx) => tx.appendGateLabel(row)),
    "appended",
  );
  assert.equal(
    await ledger.transact({ operation: "t" }, (tx) => tx.appendGateLabel({ ...row })),
    "already-present",
  );
  await assert.rejects(
    () =>
      ledger.transact({ operation: "t" }, (tx) =>
        tx.appendGateLabel(label("LABEL-000001", "DIFFERENT")),
      ),
    LedgerIntegrityError,
  );
  assert.equal((await ledger.labels()).length, 1);
  await rm(root, { recursive: true, force: true });
});

test("ledger: eval exact retry is a no-op; conflicting eval retry is a typed error", async () => {
  const root = await makeCompany();
  const ledger = new CompanyLedger(root);
  const row = evalRow("EVAL-000001", "RUN-RETRY-TEST", "original");
  assert.equal(
    await ledger.transact({ operation: "t" }, (tx) => tx.appendTerminalEval(row)),
    "appended",
  );
  assert.equal(
    await ledger.transact({ operation: "t" }, (tx) => tx.appendTerminalEval({ ...row })),
    "already-present",
  );
  await assert.rejects(
    () =>
      ledger.transact({ operation: "t" }, (tx) =>
        tx.appendTerminalEval(evalRow("EVAL-000002", "RUN-RETRY-TEST", "DIFFERENT")),
      ),
    LedgerIntegrityError,
    "a second terminal row for the same run must be refused",
  );
  assert.equal((await ledger.evals()).length, 1);
  await rm(root, { recursive: true, force: true });
});

test("ledger: losing the lock between the uniqueness check and the append fails closed", async () => {
  // Failure mechanism: this is the exact boundary the pre-fix code lost on. The barrier sits
  // after the uniqueness re-check; destroying ownership there must stop the append.
  const root = await makeCompany();
  const ledger = new CompanyLedger(root);
  const uninstall = installBarrier("append:after-uniqueness", async () => {
    await rm(join(lockPathFor(root), "owner.json"), { force: true });
  });
  try {
    await assert.rejects(
      () =>
        ledger.transact({ operation: "t" }, (tx) =>
          tx.appendGateLabel(label("LABEL-000001", "after lock loss")),
        ),
      (error: unknown) => {
        const inner = error instanceof AggregateError ? error.errors[0] : error;
        assert.ok(inner instanceof LockOwnershipError);
        return true;
      },
    );
    assert.equal((await ledger.labels()).length, 0, "nothing may be appended after lock loss");
  } finally {
    uninstall();
  }
  await rm(root, { recursive: true, force: true });
});

// ------------------------------------------- finalization failure semantics --

test("ship: a budget-assertion failure is folded into the terminal blocker, never shipped", async () => {
  // Failure mechanism: an error between reserve and settle leaves the reservation open, so
  // budget.assertSettled() throws at finalization. Pre-fix that throw escaped the finally and
  // destroyed the terminal record. Now it downgrades the outcome and lands in the blocker.
  //
  // A first version seeded a conflicting call-start file at CALL-000001 — and the run SHIPPED,
  // because the allocator's reservation scan honored the seeded file and allocated
  // CALL-000002. The system absorbed the fault by design, so the fault moved to the sanctioned
  // in-process seam: the allocation barrier throws once, after the budget reservation was
  // taken and before any call-start evidence exists.
  const root = await makeCompany();
  const runId = "RUN-20260812000000000-budget01";
  let fired = 0;
  const uninstall = installBarrier("allocate:after-read", () => {
    fired += 1;
    if (fired === 1) throw new Error("injected allocator I/O fault");
  });
  let receipt;
  try {
    receipt = await taileredShip({
      root,
      runId,
      specText: SPEC,
      agent: new TodoDemoAgent(),
      gate: GATE,
    });
  } finally {
    uninstall();
  }
  assert.notEqual(receipt.outcome, "shipped");
  assert.match(receipt.blocker ?? "", /accounting invariant failed/u);
  const rows = await readJsonLines<EvalRow>(join(root, "evals/ledger.jsonl"));
  assert.equal(rows.filter((row) => row.run_id === runId).length, 1);
  await validateCompany(root);
  await rm(root, { recursive: true, force: true });
});

test("ship: a terminal-ADR write failure leaves a recoverable state that recovery QUARANTINES on conflict", async () => {
  // Failure mechanism: something already owns the reserved ADR path with different content.
  // A-02 forbids substituting a fallback; the run must fail recoverable, and replaying against
  // the conflicting file must quarantine, never overwrite.
  const root = await makeCompany();
  const runId = "RUN-20260812000000000-adrfail1";
  const uninstall = installBarrier("adr:before-create", async (context) => {
    await writeNewFile(
      join(root, "decisions", `${context.label ?? "ADR-XXX"}.md`),
      renderAdr({
        id: context.label ?? "ADR-XXX",
        title: "An imposter decision occupying the reserved identifier",
        context: "A different writer created this file at the reserved ADR path first.",
        decision: "Occupy the identifier with different content.",
        alternatives_rejected: ["Leave the path free."],
        consequences: ["The reserved create must fail and never overwrite."],
        status: "accepted",
        caused_by: ["ADR-001"],
      }),
    );
  });
  try {
    await assert.rejects(
      () => taileredShip({ root, runId, specText: SPEC, agent: new TodoDemoAgent(), gate: GATE }),
      LedgerIntegrityError,
    );
  } finally {
    uninstall();
  }
  // Recoverable state: intent present, no terminal row, no marker.
  const rows = await readJsonLines<EvalRow>(join(root, "evals/ledger.jsonl"));
  assert.equal(rows.some((row) => row.run_id === runId), false);
  await assert.rejects(() => validateCompany(root), /Unresolved finalization intent/u);

  const report = await recoverCompany(root, { runId });
  assert.equal(report.results[0]?.action, "QUARANTINED");
  const record = JSON.parse(
    await readFile(join(root, ".tailered/quarantine", `${runId}.json`), "utf8"),
  ) as { reason_code: string };
  assert.equal(record.reason_code, "CONFLICTING_REPLAY");
  await rm(root, { recursive: true, force: true });
});

test("ship: an intent write failure halts before any canonical mutation", async () => {
  const root = await makeCompany();
  const runId = "RUN-20260812000000000-intfail1";
  await writeNewFile(
    join(root, "evals/runs", runId, "finalization-intent.json"),
    JSON.stringify({ schema_version: 1, seeded: true }),
  );
  const before = await readJsonLines<EvalRow>(join(root, "evals/ledger.jsonl"));
  await assert.rejects(
    () => taileredShip({ root, runId, specText: SPEC, agent: new TodoDemoAgent(), gate: GATE }),
    /already exists with different content/u,
  );
  const after = await readJsonLines<EvalRow>(join(root, "evals/ledger.jsonl"));
  assert.equal(after.length, before.length, "no canonical row may exist without a durable intent");
  await rm(root, { recursive: true, force: true });
});

test("ship: a marker write failure leaves the row and ADR intact and is quarantined honestly", async () => {
  const root = await makeCompany();
  const runId = "RUN-20260812000000000-mkfail01";
  await writeNewFile(
    join(root, "evals/runs", runId, "finalized.json"),
    JSON.stringify({ schema_version: 2, run_id: runId, eval_id: "EVAL-999999", adr_id: "ADR-999", outcome: "shipped", caused_by: ["seeded"] }),
  );
  await assert.rejects(
    () => taileredShip({ root, runId, specText: SPEC, agent: new TodoDemoAgent(), gate: GATE }),
    /already exists with different content/u,
  );
  // The canonical writes landed; only the marker is wrong, and it was never overwritten.
  const rows = await readJsonLines<EvalRow>(join(root, "evals/ledger.jsonl"));
  assert.equal(rows.filter((row) => row.run_id === runId).length, 1);
  await assert.rejects(() => validateCompany(root), /Finalized marker for/u);

  const report = await recoverCompany(root, { runId });
  assert.equal(report.results[0]?.action, "QUARANTINED");
  await rm(root, { recursive: true, force: true });
});

test("sequence: an interrupted bootstrap (marker without state) refuses to allocate", async () => {
  const root = await makeCompany();
  await mkdir(join(root, ".tailered"), { recursive: true });
  await writeFile(
    join(root, ".tailered/ledger-sequence.bootstrap.json"),
    JSON.stringify({ schema_version: 2, bootstrapped_at: "2026-08-12T00:00:00.000Z", canonical_at_bootstrap: { ROUTE_CALL: 0, LABEL: 0, EVAL: 0, ADR: 1 }, note: "seeded interrupted bootstrap" }),
  );
  const ledger = new CompanyLedger(root);
  await assert.rejects(
    () => ledger.transact({ operation: "t" }, (tx) => tx.allocate({ EVAL: 1 })),
    /Allocator state has been lost|missing_after_bootstrap|bootstrapped its allocator/u,
  );
  await rm(root, { recursive: true, force: true });
});
