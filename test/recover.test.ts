import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { mintCompany } from "../src/company.js";
import type { EvalRow } from "../src/contracts.js";
import { TodoDemoAgent } from "../src/demo-agent.js";
import { hashDirectory, readJsonLines } from "../src/files.js";
import { acquireCompanyLock, lockPathFor, releaseCompanyLock } from "../src/lock.js";
import { recoverCompany } from "../src/recover.js";
import { FixedGate, taileredShip } from "../src/ship.js";
import { validateCompany } from "../src/validate.js";

/**
 * One finalized company, built once and copied per test. Every test operates on a disposable
 * copy, simulating crash states by editing the copy's files — the same states a SIGKILL
 * produces, constructed deterministically.
 */
let template: string;
let templateRunId: string;

test.before(async () => {
  template = await mkdtemp(join(tmpdir(), "p0b-recover-template-"));
  await mintCompany(template, {
    what: "We are building a fixture company that proves recovery semantics.",
    forWhom: "It serves one auditor who needs interrupted runs completed deterministically.",
    winningLooksLike: "Winning means every crash state recovers or quarantines, never guesses.",
    constraints: "The fixture stays disposable, makes zero model calls, and spends nothing.",
  });
  const receipt = await taileredShip({
    root: template,
    specText: "Build the single-user todo gating demonstration.",
    agent: new TodoDemoAgent(),
    gate: new FixedGate({
      verdict: "approve",
      reasonText: "All generated checks passed and the artifact matches the constitution.",
    }),
  });
  templateRunId = receipt.runId;
});

test.after(async () => {
  await rm(template, { recursive: true, force: true });
});

async function copyFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "p0b-recover-"));
  await cp(template, root, { recursive: true });
  return root;
}

function deadOwner(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schema_version: 1,
    token: "stale",
    pid: 2147483646,
    host: hostname(),
    acquired_at: new Date(Date.now() - 3_600_000).toISOString(),
    deadline_at: new Date(Date.now() - 3_500_000).toISOString(),
    operation: "abandoned",
    run_id: null,
    ...overrides,
  });
}

// ------------------------------------------------------------- ownership ----

test("recover: a verified live owner is refused", async () => {
  const root = await copyFixture();
  const handle = await acquireCompanyLock(root, { operation: "live-run" });
  const report = await recoverCompany(root);
  assert.equal(report.results[0]?.action, "REFUSED_LIVE_OWNER");
  await releaseCompanyLock(handle);
  await rm(root, { recursive: true, force: true });
});

test("recover: a provably dead same-host owner is reclaimed and runs verify", async () => {
  const root = await copyFixture();
  await mkdir(lockPathFor(root), { recursive: true });
  await writeFile(join(lockPathFor(root), "owner.json"), deadOwner());
  const report = await recoverCompany(root);
  assert.match(report.lock, /reclaimed provably dead owner/u);
  assert.equal(report.results[0]?.action, "ALREADY_FINALIZED");
  await validateCompany(root); // no stale-lock error remains
  await rm(root, { recursive: true, force: true });
});

test("recover: a foreign-host owner is quarantined, never guessed dead", async () => {
  const root = await copyFixture();
  await mkdir(lockPathFor(root), { recursive: true });
  await writeFile(
    join(lockPathFor(root), "owner.json"),
    deadOwner({ host: `${hostname()}-elsewhere`, run_id: "RUN-FOREIGN" }),
  );
  const report = await recoverCompany(root);
  assert.equal(report.results[0]?.action, "QUARANTINED");
  const record = JSON.parse(
    await readFile(join(root, ".tailered/quarantine/RUN-FOREIGN.json"), "utf8"),
  ) as { reason_code: string };
  assert.equal(record.reason_code, "AMBIGUOUS_FOREIGN_LOCK");
  await rm(root, { recursive: true, force: true });
});

test("recover: corrupt lock ownership is quarantined", async () => {
  const root = await copyFixture();
  await mkdir(lockPathFor(root), { recursive: true });
  await writeFile(join(lockPathFor(root), "owner.json"), "{ not json");
  const report = await recoverCompany(root);
  assert.equal(report.results[0]?.action, "QUARANTINED");
  assert.match(report.results[0]?.detail ?? "", /CORRUPT_LOCK_OWNERSHIP/u);
  await rm(root, { recursive: true, force: true });
});

// ---------------------------------------------------------- intent replay ---

/** Simulate a kill between the intent and the canonical writes (KP5/KP6). */
async function makeReplayState(root: string): Promise<EvalRow> {
  const rows = await readJsonLines<EvalRow>(join(root, "evals/ledger.jsonl"));
  const row = rows.find((candidate) => candidate.run_id === templateRunId);
  assert.ok(row);
  const remaining = rows.filter((candidate) => candidate.run_id !== templateRunId);
  await writeFile(
    join(root, "evals/ledger.jsonl"),
    remaining.map((candidate) => `${JSON.stringify(candidate)}\n`).join(""),
  );
  await rm(join(root, "decisions", `${row.adr_id}.md`), { force: true });
  await rm(join(root, "evals/runs", templateRunId, "finalized.json"), { force: true });
  return row;
}

test("recover: replays a recorded intent exactly - ADR, row, marker - and validates green", async () => {
  const root = await copyFixture();
  const original = await makeReplayState(root);

  // Pre-recovery validation must identify the incomplete state, not pass it.
  await assert.rejects(() => validateCompany(root), /Unresolved finalization intent/u);

  const report = await recoverCompany(root);
  assert.equal(report.results[0]?.action, "RECOVERED");

  const rows = await readJsonLines<EvalRow>(join(root, "evals/ledger.jsonl"));
  const replayed = rows.find((candidate) => candidate.run_id === templateRunId);
  assert.deepEqual(replayed, original, "the replayed row must be byte-equal to the intended one");
  await validateCompany(root);
  await rm(root, { recursive: true, force: true });
});

test("recover: double recovery is idempotent", async () => {
  const root = await copyFixture();
  await makeReplayState(root);
  await recoverCompany(root);
  const before = await hashDirectory(root, { excludeTopLevel: [".tailered"] });
  const second = await recoverCompany(root);
  assert.equal(second.results[0]?.action, "ALREADY_FINALIZED");
  const after = await hashDirectory(root, { excludeTopLevel: [".tailered"] });
  assert.equal(before, after, "a second recovery must change nothing");
  await rm(root, { recursive: true, force: true });
});

test("recover: marker-only completion when the row and ADR already exist", async () => {
  const root = await copyFixture();
  await rm(join(root, "evals/runs", templateRunId, "finalized.json"), { force: true });
  const report = await recoverCompany(root);
  assert.equal(report.results[0]?.action, "RECOVERED");
  assert.match(report.results[0]?.detail ?? "", /marker was completed/u);
  await validateCompany(root);
  await rm(root, { recursive: true, force: true });
});

test("recover: a broken intent hash quarantines instead of replaying", async () => {
  const root = await copyFixture();
  await makeReplayState(root);
  const intentPath = join(root, "evals/runs", templateRunId, "finalization-intent.json");
  const intent = JSON.parse(await readFile(intentPath, "utf8")) as {
    payload_sha256: { eval: string };
  };
  intent.payload_sha256.eval = "0".repeat(64);
  await writeFile(intentPath, JSON.stringify(intent, null, 2));

  const report = await recoverCompany(root);
  assert.equal(report.results[0]?.action, "QUARANTINED");
  const record = JSON.parse(
    await readFile(join(root, ".tailered/quarantine", `${templateRunId}.json`), "utf8"),
  ) as { reason_code: string };
  assert.equal(record.reason_code, "INTENT_DRIFT");
  // No replay happened: the ledger still lacks the row.
  const rows = await readJsonLines<EvalRow>(join(root, "evals/ledger.jsonl"));
  assert.equal(rows.some((row) => row.run_id === templateRunId), false);
  await rm(root, { recursive: true, force: true });
});

test("recover: a conflicting terminal row quarantines and preserves exactly-one", async () => {
  const root = await copyFixture();
  const original = await makeReplayState(root);
  const conflicting: EvalRow = { ...original, cost_usd: original.cost_usd + 1, blocker: "forged" };
  await writeFile(
    join(root, "evals/ledger.jsonl"),
    (await readFile(join(root, "evals/ledger.jsonl"), "utf8")) +
      `${JSON.stringify(conflicting)}\n`,
  );
  const report = await recoverCompany(root);
  assert.equal(report.results[0]?.action, "QUARANTINED");
  const rows = await readJsonLines<EvalRow>(join(root, "evals/ledger.jsonl"));
  assert.equal(rows.filter((row) => row.run_id === templateRunId).length, 1);
  await rm(root, { recursive: true, force: true });
});

test("recover: quarantine records are never overwritten", async () => {
  const root = await copyFixture();
  await makeReplayState(root);
  const intentPath = join(root, "evals/runs", templateRunId, "finalization-intent.json");
  const intent = JSON.parse(await readFile(intentPath, "utf8")) as {
    payload_sha256: { eval: string };
  };
  intent.payload_sha256.eval = "0".repeat(64);
  await writeFile(intentPath, JSON.stringify(intent, null, 2));

  await recoverCompany(root);
  const recordPath = join(root, ".tailered/quarantine", `${templateRunId}.json`);
  const first = await readFile(recordPath, "utf8");
  const second = await recoverCompany(root);
  assert.match(second.results[0]?.detail ?? "", /prior quarantine record exists/u);
  assert.equal(await readFile(recordPath, "utf8"), first, "the record must be byte-identical");
  await rm(root, { recursive: true, force: true });
});

// -------------------------------------------------- abandoned-run recovery --

test("recover: start-without-intent settles conservatively at ceilings, never zero", async () => {
  const root = await copyFixture();
  const runId = "RUN-20260812000000000-abandon1";
  const runDir = join(root, "evals/runs", runId);
  await mkdir(join(runDir, "calls"), { recursive: true });
  await writeFile(
    join(runDir, "started.json"),
    JSON.stringify({
      schema_version: 1,
      run_id: runId,
      spec_id: "SPEC-ABANDON1",
      task: "abandoned fixture",
      hard_cost_ceiling_usd: 5,
      owner: { pid: 999999, host: "gone" },
      started_at: new Date().toISOString(),
      caused_by: ["ADR-001"],
    }),
  );
  await writeFile(
    join(runDir, "calls/CALL-000031.started.json"),
    JSON.stringify({
      schema_version: 1,
      run_id: runId,
      call_id: "CALL-000031",
      route_id: "ROUTE-000031",
      spec_id: "SPEC-ABANDON1",
      task_kind: "codegen",
      model: "registry-mid",
      tier: "mid",
      hard_cost_ceiling_usd: 0.5,
      hard_token_ceiling: 8000,
      reservation_id: "r-1",
      started_at: new Date().toISOString(),
      caused_by: ["ROUTE-000031", "SPEC-ABANDON1"],
    }),
  );

  await assert.rejects(() => validateCompany(root), /Unmatched run start/u);

  const report = await recoverCompany(root);
  const result = report.results.find((entry) => entry.run_id === runId);
  assert.equal(result?.action, "RECOVERED");

  const rows = await readJsonLines<EvalRow>(join(root, "evals/ledger.jsonl"));
  const row = rows.find((candidate) => candidate.run_id === runId);
  assert.ok(row);
  assert.equal(row.outcome, "halted_attempts");
  assert.equal(row.cost_usd, 0.5, "the interrupted call settles at its ceiling, never zero");
  assert.equal(row.tokens_by_tier.mid, 8000);
  assert.match(row.blocker ?? "", /settled conservatively at their recorded hard ceilings/u);
  assert.match(row.adr_id, /^ADR-\d{3,}$/u, "the run received its OWN terminal ADR");
  await validateCompany(root);
  await rm(root, { recursive: true, force: true });
});

// ------------------------------------------------------------ purity --------

test("recover: --dry-run changes zero bytes", async () => {
  const root = await copyFixture();
  await makeReplayState(root);
  const before = await hashDirectory(root);
  const report = await recoverCompany(root, { dryRun: true });
  const after = await hashDirectory(root);
  assert.equal(before, after, "a dry run must not mutate anything");
  assert.equal(report.results[0]?.action, "RECOVERED");
  assert.equal(report.results[0]?.planned, true);
  await rm(root, { recursive: true, force: true });
});

test("recover: the module performs no external side effects, structurally", async () => {
  // Failure mechanism: recovery that can reach an agent, a process, or the network can repeat
  // an external side effect. The module's import surface is the proof: no child_process, no
  // net, no http, no agent module.
  const source = await readFile(new URL("../src/recover.js", import.meta.url), "utf8");
  for (const forbidden of ["child_process", "node:net", "node:http", "agent.js", "fetch("]) {
    assert.ok(
      !source.includes(forbidden),
      `recover.js must not reference ${forbidden}`,
    );
  }
});
