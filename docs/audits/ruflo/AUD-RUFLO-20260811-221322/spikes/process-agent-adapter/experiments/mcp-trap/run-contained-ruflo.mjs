#!/usr/bin/env node
// AUD-RUFLO-20260811-221322 / lane AUD-L7a
//
// The containment demonstration. Same command that added 309 paths to the
// company repository in CWD-4 (`ruflo init`), now routed through the adapter.
// Postcondition checked independently: repo hash before/after, and a file
// inventory of the adapter's sandbox showing where the writes actually landed.

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const TAILERED = process.env.TAILERED_DIST ?? "/tailered/dist/src";
const SPIKE = process.env.SPIKE_DIR ?? "/spike";
const REPO = process.env.REPO_DIR ?? "/repo";
const OUT = process.env.OUT_DIR ?? "/out";
const SANDBOXES = join(OUT, "sandboxes");
const NODE = process.execPath;

const { ProcessAgent } = await import(join(TAILERED, "agent.js"));
const { hashDirectory } = await import(join(TAILERED, "files.js"));

mkdirSync(SANDBOXES, { recursive: true });

function inventory(root) {
  const found = [];
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { found.push(relative(root, full) + "/"); walk(full); }
      else found.push(relative(root, full));
    }
  };
  walk(root);
  return found;
}

const hashBefore = await hashDirectory(REPO);
const cwdBefore = process.cwd();
process.chdir(REPO);

const agent = new ProcessAgent({
  command: NODE,
  args: [
    join(SPIKE, "adapter.mjs"),
    "--engine-module=./lib/ruflo-engine.mjs",
    `--sandbox-root=${SANDBOXES}`,
    "--keep-sandbox",
    "--deadline-ms=90000",
  ],
  timeoutMs: 150_000,
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
    runId: "RUN-20260811T232500000Z-contain1",
    taskKind: "critique",
    model: "mid-available",
    tier: "mid",
    signals: { attempts: 0 },
    spec: "Critique the product against the constitution.",
    contextSnapshot: JSON.stringify({
      repoHash: "0".repeat(64),
      files: [{ path: "AGENTS.md", content: "# constitution\n" }],
    }),
  }) };
} catch (error) {
  outcome = {
    ok: false,
    error_name: error?.constructor?.name ?? "unknown",
    error_message: (error instanceof Error ? error.message : String(error)).slice(0, 1500),
  };
}
const elapsed = Date.now() - startedAt;
process.chdir(cwdBefore);
const hashAfter = await hashDirectory(REPO);

const sandboxDirs = readdirSync(SANDBOXES, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => join(SANDBOXES, d.name));
const sandboxContents = sandboxDirs.map((dir) => {
  const entries = inventory(dir);
  return {
    sandbox: dir,
    entry_count: entries.length,
    top_level: [...new Set(entries.map((e) => e.split("/")[0]))].sort(),
    sample: entries.slice(0, 30),
  };
});

let ps = "";
try { ps = execFileSync("ps", ["-eo", "pid,ppid,pgid,stat,etime,args"], { encoding: "utf8" }); } catch { /* ignore */ }

const result = {
  id: "CONTAIN-1-ruflo-init-through-adapter",
  elapsed_ms: elapsed,
  outcome_ok: outcome.ok,
  usage: outcome.ok ? outcome.response.usage : null,
  ruflo_observation: outcome.ok ? outcome.response.payload.__ruflo_observation : null,
  containment: outcome.ok ? outcome.response.payload.__containment : null,
  provenance: outcome.ok ? outcome.response.payload.__provenance : null,
  error: outcome.ok ? null : outcome,
  repo_hash_before: hashBefore,
  repo_hash_after: hashAfter,
  repo_mutated: hashBefore !== hashAfter,
  sandbox_contents: sandboxContents,
  residual_processes: ps.split("\n").filter((l) => /ruflo|claude-flow|adapter/u.test(l)),
};

writeFileSync(join(OUT, "contained-ruflo-results.json"), JSON.stringify(result, null, 2) + "\n");
console.error(
  `elapsed=${elapsed}ms ok=${outcome.ok} repo_mutated=${result.repo_mutated} ` +
  `sandbox_entries=${sandboxContents.map((s) => s.entry_count).join(",")}`,
);
process.exit(0);
