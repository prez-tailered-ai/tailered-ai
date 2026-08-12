#!/usr/bin/env node
/**
 * P0-B concurrency harness.
 *
 * Mints one disposable company, launches N concurrent `ship` runs against it with a
 * deterministic agent that makes ZERO model calls, then reports ledger state and the TRUE
 * `validate` exit code.
 *
 * This is the POC-C harness from the concurrency remediation contract, promoted to reusable
 * tooling. It is used twice for opposite purposes:
 *   - against the pre-fix commit, to prove the defect reproduces (acceptance criterion A6);
 *   - against the fixed code, to prove N concurrent runs are clean (A1-A4, A7).
 *
 * A harness that has never been seen red proves nothing, so the report is written the same way
 * in both cases and the verdict is derived from the observed state, never from the exit codes
 * of the ship runs themselves.
 *
 * Zero runtime dependencies: Node built-ins only.
 *
 * Usage:
 *   node concurrency-harness.mjs --repo-dir <built-tailered-checkout> --n 3 \
 *     [--out report.json] [--keep]
 */

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
}
const has = (name) => process.argv.includes(name);

const repoDir = resolve(arg("--repo-dir") ?? ".");
const N = Number(arg("--n", "3"));
const outPath = arg("--out");
const keep = has("--keep");

const cli = join(repoDir, "dist/src/cli.js");
if (!existsSync(cli)) {
  process.stderr.write(`harness: built CLI not found at ${cli}. Run npm run build first.\n`);
  process.exit(64);
}

const work = mkdtempSync(join(tmpdir(), "p0b-conc-"));
const company = join(work, "company");

const AGENT = `#!/usr/bin/env node
// Deterministic conforming agent. Implements docs/agent-protocol.md. Zero model calls.
import { readFileSync } from "node:fs";
const request = JSON.parse(readFileSync(0, "utf8"));
const usage = { input: 100, output: 50, costUsd: 0.001 };
function payload(kind) {
  switch (kind) {
    case "testgen":
      return { tests: [{ id: "index-exists", title: "Product index exists",
        command: "node", args: ["-e", "require('fs').statSync('product/index.html')"], cwd: "." }] };
    case "codegen":
      return { files: [{ path: "product/index.html",
        content: "<!doctype html><title>ok</title>\\n" }] };
    case "critique":
      return { violations: [], flags: [] };
    case "adr_draft":
      return { title: "Ship the concurrency fixture",
        context: "The fixture exercises concurrent ledger finalization.",
        decision: "Record the run and its terminal accounting.",
        alternativesRejected: ["Skip the terminal record."],
        consequences: ["Concurrent finalization is measured rather than assumed."] };
    default: return {};
  }
}
process.stdout.write(JSON.stringify({ payload: payload(request.taskKind), usage }));
`;

const agentPath = join(work, "agent.mjs");
writeFileSync(agentPath, AGENT, { mode: 0o755 });

writeFileSync(
  join(work, "agent.json"),
  JSON.stringify(
    {
      command: process.execPath,
      args: [agentPath],
      timeoutMs: 120000,
      projections: {
        frontier: { maxCostUsd: 1.5, maxTokens: 12000 },
        mid: { maxCostUsd: 0.5, maxTokens: 8000 },
        cheap: { maxCostUsd: 0.1, maxTokens: 4000 },
      },
    },
    null,
    2,
  ),
);

writeFileSync(
  join(work, "charter.json"),
  JSON.stringify(
    {
      // The CLI's answers file uses camelCase keys; the stored Charter record uses snake_case.
      what: "We are building a single-user todo application that proves the complete Tailered ship loop under concurrent execution.",
      forWhom: "One accountable founder operating a company with metered machine intelligence.",
      winningLooksLike: "Every started run leaves exactly one terminal evaluation, even when several runs finalize at the same moment.",
      constraints: "The demonstration excludes authentication, stays below five dollars, and completes within ten minutes.",
    },
    null,
    2,
  ),
);

function run(args, opts = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: opts.cwd ?? work,
    encoding: "utf8",
    env: { ...process.env },
  });
}

// ---- mint -----------------------------------------------------------------
const mint = run(["init", "--target", company, "--answers", join(work, "charter.json")]);
if (mint.status !== 0) {
  process.stderr.write(`harness: mint failed (${mint.status})\n${mint.stderr}\n`);
  process.exit(1);
}

const adrHashesBefore = hashAdrs();

// ---- N concurrent ship runs ----------------------------------------------
const started = Date.now();
const children = Array.from({ length: N }, (_, i) =>
  new Promise((res) => {
    const child = spawn(
      process.execPath,
      [
        cli, "ship",
        "--repo", company,
        "--spec", `Concurrent run ${i + 1}: render a single-user todo list at product/index.html.`,
        "--agent-config", join(work, "agent.json"),
        "--verdict", "approve",
        "--reason", "The concurrent fixture ships the required product index and records its accounting.",
        "--allow-local-execution",
      ],
      { cwd: work, encoding: "utf8" },
    );
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code, signal) =>
      res({ index: i + 1, code, signal, stdout: out, stderr: err }));
  }),
);
const results = await Promise.all(children);
const wallMs = Date.now() - started;

// ---- independent inspection ----------------------------------------------
function readJsonl(rel) {
  const p = join(company, rel);
  if (!existsSync(p)) return { rows: [], torn: 0, raw: "" };
  const raw = readFileSync(p, "utf8");
  const rows = [];
  let torn = 0;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { torn += 1; }
  }
  return { rows, torn, raw };
}

function hashAdrs() {
  const dir = join(company, "decisions");
  if (!existsSync(dir)) return {};
  const out = {};
  for (const f of readdirSync(dir).sort()) {
    out[f] = createHash("sha256")
      .update(readFileSync(join(dir, f)))
      .digest("hex");
  }
  return out;
}

const routes = readJsonl("evals/routes.jsonl");
const evals = readJsonl("evals/ledger.jsonl");
const labels = readJsonl("labels/ledger.jsonl");
const adrHashesAfter = hashAdrs();

const dupes = (ids) => ids.length - new Set(ids).size;
const routeIds = routes.rows.map((r) => r.id);
const callIds = routes.rows.map((r) => r.call_id);
const evalIds = evals.rows.map((r) => r.id);
const labelIds = labels.rows.map((r) => r.id);

const runsWithRoutes = new Set(routes.rows.map((r) => r.run_id));
const runsWithEvals = new Set(evals.rows.map((r) => r.run_id));

// Every launched run announces its own runId in its receipt. Deriving "started" from the
// route log alone is not enough: a run that dies before its first route append leaves no
// route row, so a route-only measure silently under-counts the lost runs. The original
// defect report contains exactly such a run — one that "crashed outside the run loop" with
// no receipt at all — so a run that produced NO receipt is tracked separately and is the
// worst case, not an absence of evidence.
const launchedRunIds = [];
let receiptlessRuns = 0;
for (const r of results) {
  const m = /"runId":\s*"(RUN-[^"]+)"/.exec(r.stdout);
  if (m) launchedRunIds.push(m[1]);
  else receiptlessRuns += 1;
}
const startedNoTerminal = launchedRunIds.filter((id) => !runsWithEvals.has(id));

// The TRUE validate exit code. Read directly from the process — never through a pipe.
const validate = run(["validate", "--repo", company]);

const modifiedAdrs = Object.keys(adrHashesBefore).filter(
  (f) => adrHashesAfter[f] && adrHashesAfter[f] !== adrHashesBefore[f],
);

const report = {
  harness: "p0b-concurrency",
  repo_dir: repoDir,
  repo_head: spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf8" })
    .stdout.trim(),
  n: N,
  wall_ms: wallMs,
  generated_at: new Date().toISOString(),
  ship_runs: results.map((r) => ({
    index: r.index,
    exit_code: r.code,
    signal: r.signal,
    // Full-enough capture to attribute an early halt to its actual cause. A truncated
    // capture previously hid why two runs never reached the contended window.
    stdout: r.stdout.slice(0, 4000),
    stderr: r.stderr.slice(0, 4000),
  })),
  ledger: {
    route_rows: routes.rows.length,
    eval_rows: evals.rows.length,
    label_rows: labels.rows.length,
    torn_lines: routes.torn + evals.torn + labels.torn,
    duplicate_route_ids: dupes(routeIds),
    duplicate_call_ids: dupes(callIds),
    duplicate_eval_ids: dupes(evalIds),
    duplicate_label_ids: dupes(labelIds),
    route_ids: routeIds,
    eval_ids: evalIds,
  },
  exactly_once: {
    launched_runs: N,
    runs_that_announced_a_run_id: launchedRunIds.length,
    runs_with_no_receipt_at_all: receiptlessRuns,
    runs_with_route_logs: runsWithRoutes.size,
    runs_with_terminal_eval: runsWithEvals.size,
    started_runs_with_no_terminal_eval: startedNoTerminal,
  },
  adrs: {
    before: Object.keys(adrHashesBefore).length,
    after: Object.keys(adrHashesAfter).length,
    modified_accepted_adrs: modifiedAdrs,
  },
  validate: {
    exit_code: validate.status,
    stdout_tail: validate.stdout.split("\n").slice(-14).join("\n"),
    stderr_tail: validate.stderr.split("\n").slice(-14).join("\n"),
  },
  company_dir: keep ? company : "(removed)",
};

// Race A has TWO manifestations and the harness must catch both.
//
//   severe  — the interleave slips past the uniqueness check: duplicate rows persist, or a
//             started run loses its terminal EvalRow entirely.
//   detected — the uniqueness check catches the collision and the run dies with an
//             "already exists" blocker. The ledger stays valid, but a run that did real work
//             is destroyed by contention alone.
//
// An earlier version of this harness scored only the severe form and reported `all_clean:
// true` for a trial in which two of three runs had been killed by an identifier collision.
// That was a false green produced by asking the wrong question, which is the exact failure
// class this program exists to remove. Both forms are now failures.
const collisionHalts = results
  .map((r) => {
    const m = /"blocker":\s*"([^"]*already exists[^"]*)"/.exec(r.stdout);
    return m ? { run: r.index, blocker: m[1] } : null;
  })
  .filter(Boolean);

const shippedRuns = results.filter((r) => r.code === 0).length;

report.identifier_contention = {
  collision_halts: collisionHalts,
  collision_halt_count: collisionHalts.length,
  runs_that_shipped: shippedRuns,
};

report.verdict = {
  A1_exactly_n_terminal_evals: evals.rows.length === N,
  A2_zero_duplicate_ids:
    report.ledger.duplicate_route_ids === 0 &&
    report.ledger.duplicate_call_ids === 0 &&
    report.ledger.duplicate_eval_ids === 0 &&
    report.ledger.duplicate_label_ids === 0,
  A3_validate_exit_zero: validate.status === 0,
  A4_no_accepted_adr_modified: modifiedAdrs.length === 0,
  no_started_run_lost: startedNoTerminal.length === 0 && receiptlessRuns === 0,
  no_torn_lines: report.ledger.torn_lines === 0,
  no_identifier_collision_halts: collisionHalts.length === 0,
  every_run_shipped: shippedRuns === N,
};
report.verdict.all_clean = Object.values(report.verdict).every(Boolean);
report.defect_reproduced = !report.verdict.all_clean;

const text = JSON.stringify(report, null, 2);
if (outPath) writeFileSync(resolve(outPath), `${text}\n`);
process.stdout.write(`${text}\n`);

if (!keep) rmSync(work, { recursive: true, force: true });

// The harness itself always exits 0 when it completed its measurement. The verdict lives in
// the report, so a red reproduction is a successful measurement rather than a harness failure.
process.exit(0);
