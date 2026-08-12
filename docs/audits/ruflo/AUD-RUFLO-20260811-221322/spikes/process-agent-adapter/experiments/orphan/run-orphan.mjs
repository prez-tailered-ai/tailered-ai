#!/usr/bin/env node
// AUD-RUFLO-20260811-221322 / lane AUD-L7a — DECISIVE EXPERIMENT 1
//
// Question: ProcessAgent kills only the DIRECT child. If a process agent
// starts a worker (a Ruflo swarm agent, an MCP daemon, an ONNX worker), does
// that worker survive the Tailered timeout path?
//
// Method: heartbeat timestamps written by the grandchild to a probe file,
// compared against the instant ProcessAgent's promise rejected. A heartbeat
// AFTER the rejection is direct evidence of survival — independent of any
// exit code, log line, or self-report.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TAILERED = process.env.TAILERED_DIST ?? "/tailered/dist/src";
const SPIKE = process.env.SPIKE_DIR ?? "/spike";
const OUT = process.env.OUT_DIR ?? "/out";
const NODE = process.execPath;

const { ProcessAgent } = await import(join(TAILERED, "agent.js"));

mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ps() {
  try {
    return execFileSync("ps", ["-eo", "pid,ppid,pgid,stat,etime,args"], { encoding: "utf8" });
  } catch (error) {
    return `ps failed: ${String(error)}`;
  }
}

function readProbe(path) {
  try {
    return readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

function config(command, args, timeoutMs) {
  return {
    command, args, timeoutMs,
    projections: {
      frontier: { maxCostUsd: 0.5, maxTokens: 40_000 },
      mid: { maxCostUsd: 0.1, maxTokens: 20_000 },
      cheap: { maxCostUsd: 0.02, maxTokens: 8_000 },
    },
  };
}

const request = {
  runId: "RUN-20260811T230500000Z-orphan01",
  taskKind: "critique",
  model: "mid-available",
  tier: "mid",
  signals: { attempts: 0 },
  spec: "Critique the product against the constitution.",
  contextSnapshot: JSON.stringify({ repoHash: "0".repeat(64), files: [] }),
};

const findings = [];

// --------------------------------------------------------------- scenario 1
// Naive agent starts a detached worker, then hangs. Tailered times out.
{
  const probe = join(OUT, "orphan-naive.jsonl");
  writeFileSync(probe, "");
  process.env.PROBE_FILE = probe;
  const agent = new ProcessAgent(
    config(NODE, [join(SPIKE, "experiments/orphan/orphan-agent-naive.mjs")], 2500),
  );
  let outcome;
  const startedAt = Date.now();
  try {
    outcome = { ok: true, response: await agent.invoke(request) };
  } catch (error) {
    outcome = { ok: false, error: error instanceof Error ? error.message : String(error), error_name: error?.constructor?.name };
  }
  const rejectedAt = Date.now();
  await sleep(5000);
  const beats = readProbe(probe);
  const after = beats.filter((b) => b.at > rejectedAt + 500);
  findings.push({
    id: "ORPHAN-1-naive-worker",
    question: "does a detached worker survive the Tailered timeout abort?",
    invoke_outcome: outcome,
    invoke_elapsed_ms: rejectedAt - startedAt,
    grandchild_pid: beats[0]?.pid ?? null,
    heartbeats_total: beats.length,
    heartbeats_after_rejection: after.length,
    last_heartbeat_ms_after_rejection: after.length ? after.at(-1).at - rejectedAt : 0,
    got_sigterm: beats.some((b) => b.kind === "sigterm"),
    survived: after.length > 0,
    ps_after: ps().split("\n").filter((l) => /grandchild|orphan-agent/u.test(l)),
  });
  // Reap it ourselves so the audit leaves nothing running.
  for (const beat of beats.slice(0, 1)) {
    try { process.kill(beat.pid, "SIGKILL"); } catch { /* already gone */ }
  }
}

// --------------------------------------------------------------- scenario 2
// Agent answers correctly and exits 0, but the worker inherited fd 1.
{
  const probe = join(OUT, "orphan-stdout-holder.jsonl");
  writeFileSync(probe, "");
  process.env.PROBE_FILE = probe;
  const agent = new ProcessAgent(
    config(NODE, [join(SPIKE, "experiments/orphan/orphan-agent-holds-stdout.mjs")], 4000),
  );
  const startedAt = Date.now();
  let outcome;
  try {
    outcome = { ok: true, response: await agent.invoke(request) };
  } catch (error) {
    outcome = { ok: false, error: error instanceof Error ? error.message : String(error), error_name: error?.constructor?.name };
  }
  const settledAt = Date.now();
  const beats = readProbe(probe);
  findings.push({
    id: "ORPHAN-2-worker-holds-stdout",
    question: "if a surviving worker holds the stdout pipe, does a CORRECT response still reach Tailered?",
    invoke_outcome: outcome,
    invoke_elapsed_ms: settledAt - startedAt,
    note: "the agent wrote a valid response and exited 0 within milliseconds; any elapsed time near timeoutMs means the response was lost to the pipe still being open",
    grandchild_pid: beats[0]?.pid ?? null,
    heartbeats_total: beats.length,
  });
  for (const beat of beats.slice(0, 1)) {
    try { process.kill(beat.pid, "SIGKILL"); } catch { /* already gone */ }
  }
}

// --------------------------------------------------------------- scenario 3
// The spike adapter runs the same worker and must reap it on its own deadline.
{
  const probe = join(OUT, "orphan-adapter-guarded.jsonl");
  writeFileSync(probe, "");
  process.env.PROBE_FILE = probe;
  const agent = new ProcessAgent(
    config(
      NODE,
      [
        join(SPIKE, "adapter.mjs"),
        "--engine-module=./experiments/orphan/engine-grandchild.mjs",
        "--deadline-ms=2500",
      ],
      20_000,
    ),
  );
  const startedAt = Date.now();
  let outcome;
  try {
    outcome = { ok: true, response: await agent.invoke(request) };
  } catch (error) {
    outcome = { ok: false, error: error instanceof Error ? error.message : String(error), error_name: error?.constructor?.name };
  }
  const rejectedAt = Date.now();
  await sleep(5000);
  const beats = readProbe(probe);
  const after = beats.filter((b) => b.at > rejectedAt + 500);
  findings.push({
    id: "ORPHAN-3-adapter-reaps-its-group",
    question: "does the adapter's process-group reaper kill the worker where Tailered cannot?",
    invoke_outcome: outcome,
    invoke_elapsed_ms: rejectedAt - startedAt,
    grandchild_pid: beats[0]?.pid ?? null,
    heartbeats_total: beats.length,
    heartbeats_after_adapter_deadline: after.length,
    survived: after.length > 0,
    ps_after: ps().split("\n").filter((l) => /grandchild|adapter\.mjs/u.test(l)),
  });
  for (const beat of beats.slice(0, 1)) {
    try { process.kill(beat.pid, "SIGKILL"); } catch { /* already gone */ }
  }
}

writeFileSync(join(OUT, "orphan-results.json"), JSON.stringify(findings, null, 2) + "\n");
writeFileSync(join(OUT, "ps-after-orphan.txt"), ps());
for (const finding of findings) {
  console.error(`${finding.id}: survived=${finding.survived ?? "n/a"} elapsed=${finding.invoke_elapsed_ms}ms`);
}
process.exit(0);
