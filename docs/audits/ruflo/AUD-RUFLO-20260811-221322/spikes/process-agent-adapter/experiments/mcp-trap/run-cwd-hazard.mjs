#!/usr/bin/env node
// AUD-RUFLO-20260811-221322 / lane AUD-L7a
//
// Follow-on to the MCP trap: ProcessAgent passes NO `cwd` to spawn(), so a
// ruflo subcommand invoked as a Tailered agent runs with the orchestrator's
// working directory — the company repository. This measures which subcommands
// write there, by file-level diff, not by reading ruflo's own output.

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const TAILERED = process.env.TAILERED_DIST ?? "/tailered/dist/src";
const RUFLO_BIN = process.env.RUFLO_BIN ?? "/rf/node_modules/ruflo/bin/ruflo.js";
const REPO = process.env.REPO_DIR ?? "/repo";
const OUT = process.env.OUT_DIR ?? "/out";
const NODE = process.execPath;

const { ProcessAgent } = await import(join(TAILERED, "agent.js"));
const { hashDirectory } = await import(join(TAILERED, "files.js"));

mkdirSync(OUT, { recursive: true });

function inventory(root) {
  const found = new Set();
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { found.add(relative(root, full) + "/"); walk(full); }
      else { found.add(`${relative(root, full)}#${statSync(full).size}`); }
    }
  };
  walk(root);
  return found;
}

function ps() {
  try { return execFileSync("ps", ["-eo", "pid,ppid,pgid,stat,etime,args"], { encoding: "utf8" }); }
  catch (error) { return `ps failed: ${String(error)}`; }
}

const request = {
  runId: "RUN-20260811T231500000Z-cwd01",
  taskKind: "codegen",
  model: "mid-available",
  tier: "mid",
  signals: { attempts: 0 },
  spec: "Implement the product.",
  contextSnapshot: JSON.stringify({ repoHash: "0".repeat(64), files: [] }),
};

const results = [];

for (const [id, args, timeoutMs] of [
  ["CWD-1-status", ["status"], 60_000],
  ["CWD-2-memory-store", ["memory", "store", "audit-key", "audit-value"], 60_000],
  ["CWD-3-swarm-status", ["swarm", "status"], 60_000],
]) {
  const before = inventory(REPO);
  const hashBefore = await hashDirectory(REPO);
  const cwdBefore = process.cwd();
  process.chdir(REPO);
  const agent = new ProcessAgent({
    command: NODE,
    args: [RUFLO_BIN, ...args],
    timeoutMs,
    projections: {
      frontier: { maxCostUsd: 0.5, maxTokens: 40_000 },
      mid: { maxCostUsd: 0.1, maxTokens: 20_000 },
      cheap: { maxCostUsd: 0.02, maxTokens: 8_000 },
    },
  });
  const startedAt = Date.now();
  let outcome;
  try {
    outcome = { ok: true, response: await agent.invoke(request) };
  } catch (error) {
    outcome = {
      ok: false,
      error_name: error?.constructor?.name ?? "unknown",
      error_message: (error instanceof Error ? error.message : String(error)).slice(0, 400),
    };
  }
  const elapsed = Date.now() - startedAt;
  process.chdir(cwdBefore);
  const after = inventory(REPO);
  const hashAfter = await hashDirectory(REPO);
  const added = [...after].filter((entry) => !before.has(entry));
  const removed = [...before].filter((entry) => !after.has(entry));
  results.push({
    id,
    argv_after_binary: args,
    timeout_ms: timeoutMs,
    elapsed_ms: elapsed,
    outcome,
    repo_hash_before: hashBefore,
    repo_hash_after: hashAfter,
    repo_mutated: hashBefore !== hashAfter,
    paths_added_to_company_repo: added,
    paths_removed_from_company_repo: removed,
    residual_processes: ps().split("\n").filter((l) => /ruflo|claude-flow/u.test(l)),
  });
  console.error(`${id}: elapsed=${elapsed}ms mutated=${hashBefore !== hashAfter} added=${added.length}`);
}

writeFileSync(join(OUT, "cwd-hazard-results.json"), JSON.stringify(results, null, 2) + "\n");
writeFileSync(join(OUT, "ps-after-cwd-hazard.txt"), ps());
process.exit(0);
