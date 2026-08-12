#!/usr/bin/env node
// AUD-RUFLO-20260811-221322 / lane AUD-L7a — DECISIVE EXPERIMENT 2
//
// Question: what happens if a naive integration points
// ProcessAgentConfig.command at the ruflo binary?
//
// ruflo@3.37.0 bin/ruflo.js:55
//   const isMCPMode = !process.stdin.isTTY && (process.argv.length === 2 || isExplicitMCP);
//
// Tailered's ProcessAgent spawns with stdio ["pipe","pipe","pipe"], so
// process.stdin.isTTY is undefined in EVERY Tailered-spawned agent. The TTY
// term can never save the integration; only argv can.
//
// Measured here: elapsed time vs timeoutMs, the raw stdout bytes ruflo emits,
// whether the company repository is mutated, and what is left running.

import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TAILERED = process.env.TAILERED_DIST ?? "/tailered/dist/src";
const RUFLO_BIN = process.env.RUFLO_BIN ?? "/rf/node_modules/ruflo/bin/ruflo.js";
const REPO = process.env.REPO_DIR ?? "/repo";
const OUT = process.env.OUT_DIR ?? "/out";
const NODE = process.execPath;

const { ProcessAgent } = await import(join(TAILERED, "agent.js"));
const { hashDirectory } = await import(join(TAILERED, "files.js"));
const { isMcpModeUnderPipedStdin, safeRufloArgv } = await import(
  join(process.env.SPIKE_DIR ?? "/spike", "lib", "ruflo-argv.mjs")
);

mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ps() {
  try {
    return execFileSync("ps", ["-eo", "pid,ppid,pgid,stat,etime,args"], { encoding: "utf8" });
  } catch (error) {
    return `ps failed: ${String(error)}`;
  }
}

const request = {
  runId: "RUN-20260811T231000000Z-mcptrap",
  taskKind: "codegen",
  model: "mid-available",
  tier: "mid",
  signals: { attempts: 0 },
  spec: "Implement the product so the acceptance tests pass.",
  contextSnapshot: JSON.stringify({ repoHash: "0".repeat(64), files: [] }),
};

function config(args, timeoutMs) {
  return {
    command: NODE,
    args: [RUFLO_BIN, ...args],
    timeoutMs,
    projections: {
      frontier: { maxCostUsd: 0.5, maxTokens: 40_000 },
      mid: { maxCostUsd: 0.1, maxTokens: 20_000 },
      cheap: { maxCostUsd: 0.02, maxTokens: 8_000 },
    },
  };
}

const findings = [];

async function viaProcessAgent(id, args, timeoutMs, note) {
  const before = await hashDirectory(REPO);
  const cwdBefore = process.cwd();
  process.chdir(REPO);
  const agent = new ProcessAgent(config(args, timeoutMs));
  const startedAt = Date.now();
  let outcome;
  try {
    outcome = { ok: true, response: await agent.invoke(request) };
  } catch (error) {
    outcome = {
      ok: false,
      error_name: error?.constructor?.name ?? "unknown",
      error_message: (error instanceof Error ? error.message : String(error)).slice(0, 600),
    };
  }
  const elapsed = Date.now() - startedAt;
  process.chdir(cwdBefore);
  await sleep(1500);
  const after = await hashDirectory(REPO);
  const table = ps();
  findings.push({
    id,
    argv_after_binary: args,
    predicted_mcp_mode: isMcpModeUnderPipedStdin(args),
    timeout_ms: timeoutMs,
    elapsed_ms: elapsed,
    consumed_full_timeout: elapsed >= timeoutMs - 200,
    outcome,
    repo_hash_before: before,
    repo_hash_after: after,
    repo_mutated: before !== after,
    residual_ruflo_processes: table.split("\n").filter((l) => /ruflo|claude-flow/u.test(l)),
    note,
  });
  console.error(`${id}: mcp=${isMcpModeUnderPipedStdin(args)} elapsed=${elapsed}ms mutated=${before !== after}`);
}

/** Raw capture so we can see the bytes ProcessAgent would have thrown away. */
async function rawCapture(id, args, waitMs) {
  const startedAt = Date.now();
  const capture = await new Promise((done) => {
    const child = spawn(NODE, [RUFLO_BIN, ...args], {
      cwd: REPO,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
    });
    const out = [];
    const err = [];
    let settled = false;
    const finish = (how, code) => {
      if (settled) return;
      settled = true;
      try { process.kill(-child.pid, "SIGKILL"); } catch { /* gone */ }
      done({
        how,
        exit_code: code ?? null,
        elapsed_ms: Date.now() - startedAt,
        stdout_bytes: Buffer.concat(out).byteLength,
        stdout_head: Buffer.concat(out).toString("utf8").slice(0, 900),
        stderr_head: Buffer.concat(err).toString("utf8").slice(0, 900),
      });
    };
    child.stdout.on("data", (c) => out.push(c));
    child.stderr.on("data", (c) => err.push(c));
    child.on("close", (code) => finish("exited", code));
    child.on("error", () => finish("spawn-error", null));
    setTimeout(() => finish("still-running-when-sampled", null), waitMs);
    child.stdin.write(JSON.stringify(request) + "\n");
  });
  findings.push({ id, argv_after_binary: args, raw_capture: capture });
  console.error(`${id}: ${capture.how} after ${capture.elapsed_ms}ms, stdout ${capture.stdout_bytes}B`);
}

// M1 — the naive integration: command = ruflo, args = [].
await viaProcessAgent(
  "MCP-TRAP-1-no-args",
  [],
  15_000,
  "the exact shape of a naive ProcessAgentConfig pointed at the ruflo binary",
);

// M2 — the documented MCP invocation the generated .mcp.json uses.
await viaProcessAgent("MCP-TRAP-2-mcp-start", ["mcp", "start"], 15_000, "same trap, explicitly");

// M3 — any non-mcp argv takes the CLI branch, which calls process.exit(0).
await viaProcessAgent(
  "MCP-TRAP-3-explicit-subcommand",
  ["--version"],
  15_000,
  "fast path in bin/ruflo.js:16-27; proves the branch, not the workload",
);

// M4 — raw byte capture of what the MCP server actually says to a Tailered request.
await rawCapture("MCP-TRAP-4-raw-bytes-no-args", [], 20_000);
await rawCapture("MCP-TRAP-5-raw-bytes-help", ["--help"], 30_000);

// M6 — the adapter's refusal to build a trapping argv.
let refusal = null;
try {
  safeRufloArgv("mcp", ["start"]);
} catch (error) {
  refusal = error.message;
}
findings.push({
  id: "MCP-TRAP-6-adapter-refuses-trap-argv",
  refusal,
  safe_example: safeRufloArgv("swarm", ["run", "--json"]),
});

writeFileSync(join(OUT, "mcp-trap-results.json"), JSON.stringify(findings, null, 2) + "\n");
writeFileSync(join(OUT, "ps-after-mcp-trap.txt"), ps());
process.exit(0);
