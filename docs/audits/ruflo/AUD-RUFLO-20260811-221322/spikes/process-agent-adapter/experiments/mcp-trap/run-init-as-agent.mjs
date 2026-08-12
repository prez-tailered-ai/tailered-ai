#!/usr/bin/env node
// AUD-RUFLO-20260811-221322 / lane AUD-L7a
//
// The strongest form of the CWD hazard: `ruflo init` invoked AS A TAILERED
// AGENT. ProcessAgent passes no `cwd`, so ruflo initialises the company
// repository itself. Measured by file-level diff of the repo, not by trusting
// ruflo's own "Files: 111 created" self-report (which is already known false).

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
      else { found.add(relative(root, full)); }
    }
  };
  walk(root);
  return found;
}

const before = inventory(REPO);
const hashBefore = await hashDirectory(REPO);
const cwdBefore = process.cwd();
process.chdir(REPO);

const agent = new ProcessAgent({
  command: NODE,
  args: [RUFLO_BIN, "init"],
  timeoutMs: 240_000,
  projections: {
    frontier: { maxCostUsd: 0.5, maxTokens: 40_000 },
    mid: { maxCostUsd: 0.1, maxTokens: 20_000 },
    cheap: { maxCostUsd: 0.02, maxTokens: 8_000 },
  },
});

const startedAt = Date.now();
let outcome;
try {
  outcome = { ok: true, response: await agent.invoke({
    runId: "RUN-20260811T232000000Z-init01",
    taskKind: "codegen",
    model: "mid-available",
    tier: "mid",
    signals: { attempts: 0 },
    spec: "Implement the product.",
    contextSnapshot: JSON.stringify({ repoHash: "0".repeat(64), files: [] }),
  }) };
} catch (error) {
  outcome = {
    ok: false,
    error_name: error?.constructor?.name ?? "unknown",
    error_message: (error instanceof Error ? error.message : String(error)).slice(0, 1200),
  };
}
const elapsed = Date.now() - startedAt;
process.chdir(cwdBefore);

const after = inventory(REPO);
const hashAfter = await hashDirectory(REPO);
const added = [...after].filter((entry) => !before.has(entry)).sort();

let ps = "";
try { ps = execFileSync("ps", ["-eo", "pid,ppid,pgid,stat,etime,args"], { encoding: "utf8" }); } catch { /* ignore */ }

const result = {
  id: "CWD-4-ruflo-init-as-tailered-agent",
  elapsed_ms: elapsed,
  outcome,
  repo_hash_before: hashBefore,
  repo_hash_after: hashAfter,
  repo_mutated: hashBefore !== hashAfter,
  paths_added_count: added.length,
  paths_added_top_level: [...new Set(added.map((p) => p.split("/")[0]))].sort(),
  paths_added_sample: added.slice(0, 40),
  binary_artifacts: added
    .filter((p) => /\.db$|\.sqlite|\.wasm|\.onnx/u.test(p))
    .map((p) => { try { return { path: p, bytes: statSync(join(REPO, p)).size }; } catch { return { path: p, bytes: null }; } }),
  residual_processes: ps.split("\n").filter((l) => /ruflo|claude-flow/u.test(l)),
};

writeFileSync(join(OUT, "init-as-agent-results.json"), JSON.stringify(result, null, 2) + "\n");
console.error(`elapsed=${elapsed}ms mutated=${result.repo_mutated} added=${added.length}`);
process.exit(0);
