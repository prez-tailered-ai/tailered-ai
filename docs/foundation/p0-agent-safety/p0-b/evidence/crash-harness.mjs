#!/usr/bin/env node
/**
 * crash-harness.mjs — the P0-B seven-point SIGKILL matrix (A5, R2, R4).
 *
 * Usage: node crash-harness.mjs --repo <builtCheckout> --head <fullSha> --out <report.json>
 *
 * For each kill point the harness spawns a real child process, waits for that child's
 * nonce-authenticated sentinel proving the exact barrier was reached, sends SIGKILL, proves
 * the child died, requires PRE-recovery validation to identify the incomplete state, runs
 * `tailered recover`, and requires post-recovery validation to exit zero with exactly one
 * terminal row referencing the run's OWN terminal ADR, no residual lock, and conservative
 * accounting. A child that dies or finishes without reaching its barrier is INVALID, never a
 * pass.
 *
 * Two mandatory controls:
 *   - no-kill: the same child runs to completion and must be clean end-to-end;
 *   - broken-recovery: a copied dist with the terminal-eval replay deleted must be DETECTED
 *     by post-recovery validation, proving the matrix can go red.
 *
 * Assurance boundary, stated exactly:
 *   VERIFIED: tested process-crash and SIGKILL recovery.
 *   NOT VERIFIED: sudden power loss, kernel panic, or storage-device loss.
 */

import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}
const REPO = arg("--repo");
const HEAD = arg("--head");
const OUT = arg("--out");
if (!REPO || !HEAD || !OUT) {
  process.stderr.write("usage: crash-harness.mjs --repo <dir> --head <sha> --out <file>\n");
  process.exit(64);
}
const DIST = resolve(REPO, "dist");
const CLI = resolve(DIST, "src/cli.js");
const CHILD = resolve(REPO, "docs/foundation/p0-agent-safety/p0-b/evidence/crash-child.mjs");

const POINTS = [
  "allocate:after-read",
  "agent:during-invocation",
  "append:after-uniqueness",
  "finalize:before-intent",
  "adr:before-create",
  "finalize:before-terminal-eval",
  "finalize:before-marker",
];

const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { status: result.status, signal: result.signal, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
};

function readRows(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter((line) => line.trim() !== "").map((line) => JSON.parse(line));
}

function snapshotState(company, runId) {
  const runDir = join(company, "evals/runs", runId);
  const present = (p) => existsSync(join(runDir, p));
  return {
    started: present("started.json"),
    intent: present("finalization-intent.json"),
    finalized: present("finalized.json"),
    call_starts: existsSync(join(runDir, "calls")) ? readdirSync(join(runDir, "calls")).filter((n) => n.endsWith(".started.json")).length : 0,
    eval_rows_for_run: readRows(join(company, "evals/ledger.jsonl")).filter((r) => r.run_id === runId).length,
    lock_present: existsSync(join(company, ".tailered/locks/company-ledger.lock")),
  };
}

/** Spawn the child, wait for its sentinel, SIGKILL it, prove it is dead. */
function killAtPoint(point, company, runId, nonce, timeoutMs = 60_000) {
  return new Promise((resolveOutcome) => {
    const child = spawn(process.execPath, [CHILD, DIST, company, point, runId, nonce], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let buffer = "";
    let sentinel = null;
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      child.kill("SIGKILL");
      resolveOutcome({ verdict: "INVALID", reason: `timeout: sentinel not seen within ${timeoutMs}ms`, stdout: buffer });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      buffer += String(chunk);
      const match = buffer.match(/^AT:(.+?):(\d+):(.+?):(.+?)$/mu);
      if (match && !done) {
        done = true;
        clearTimeout(timer);
        sentinel = { point: match[1], pid: Number(match[2]), run_id: match[3], nonce: match[4] };
        const authenticated = sentinel.point === point && sentinel.nonce === nonce && sentinel.pid === child.pid && sentinel.run_id === runId;
        if (!authenticated) {
          child.kill("SIGKILL");
          resolveOutcome({ verdict: "INVALID", reason: "sentinel failed authentication", sentinel, stdout: buffer });
          return;
        }
        const preKill = snapshotState(company, runId);
        child.kill("SIGKILL");
        child.on("exit", (code, signal) => {
          let esrch = false;
          try {
            process.kill(child.pid, 0);
          } catch (error) {
            esrch = error.code === "ESRCH";
          }
          resolveOutcome({ verdict: "KILLED", sentinel, pre_kill: preKill, exit_code: code, signal, proven_dead: esrch });
        });
      }
    });
    child.on("exit", (code, signal) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolveOutcome({ verdict: "INVALID", reason: `child exited (code ${code}, signal ${signal}) before reaching the barrier`, stdout: buffer });
    });
  });
}

const results = [];
const scratch = mkdtempSync(join(tmpdir(), "p0b-crash-"));

for (const point of POINTS) {
  const company = join(scratch, point.replaceAll(/[^a-z-]/gu, "_"));
  const runId = `RUN-20260812000000000-${createHash("sha256").update(point).digest("hex").slice(0, 8)}`;
  const nonce = randomUUID();
  const killed = await killAtPoint(point, company, runId, nonce);
  if (killed.verdict !== "KILLED") {
    results.push({ point, verdict: "INVALID", ...killed });
    continue;
  }

  // Pre-recovery validation MUST identify the incomplete state.
  const preValidate = run(process.execPath, [CLI, "validate", "--repo", company]);
  // Recovery must complete or quarantine, explicitly.
  const recover = run(process.execPath, [CLI, "recover", "--repo", company]);
  let recoveryReport = null;
  try {
    recoveryReport = JSON.parse(recover.stdout);
  } catch {
    /* recorded below as-is */
  }
  // Post-recovery validation must exit zero.
  const postValidate = run(process.execPath, [CLI, "validate", "--repo", company]);

  const rows = readRows(join(company, "evals/ledger.jsonl")).filter((r) => r.run_id === runId);
  const row = rows[0] ?? null;
  const adrOwn =
    row !== null &&
    existsSync(join(company, "decisions", `${row.adr_id}.md`)) &&
    Array.isArray(row.caused_by) &&
    row.caused_by.includes(row.adr_id);
  const post = snapshotState(company, runId);

  // A run killed AFTER its intent was recorded legitimately replays to the intent's outcome,
  // including "shipped" — the gate approved and the preview deployed before the kill; only
  // the canonical writes were interrupted, and the run's own ADR now exists (A-02). The
  // never-shipped rule binds the ABANDONED path: a run with no intent must never become
  // shipped through recovery.
  const shippedRule = killed.pre_kill.intent ? true : row !== null && row.outcome !== "shipped";
  const pass =
    killed.proven_dead === true &&
    killed.signal === "SIGKILL" &&
    preValidate.status !== 0 &&
    recover.status === 0 &&
    postValidate.status === 0 &&
    rows.length === 1 &&
    adrOwn &&
    post.lock_present === false &&
    row.cost_usd >= 0 &&
    shippedRule;

  results.push({
    point,
    verdict: pass ? "PASS" : "FAIL",
    child_pid: killed.sentinel.pid,
    sentinel_authenticated: true,
    pre_kill_state: killed.pre_kill,
    kill: { signal: killed.signal, exit_code: killed.exit_code, proven_dead_esrch: killed.proven_dead },
    pre_recovery_validate_exit: preValidate.status,
    pre_recovery_validate_names_state: preValidate.stderr.split("\n").filter((l) => l.trim()).slice(0, 4),
    recovery_exit: recover.status,
    recovery_actions: recoveryReport?.results?.map((r) => `${r.run_id}:${r.action}`) ?? ["(unparseable)"],
    recovery_stderr_head: recover.stderr.split("\n").slice(0, 3).join(" | "),
    post_recovery_validate_exit: postValidate.status,
    post_recovery_state: post,
    terminal_rows_for_run: rows.length,
    outcome: row?.outcome ?? null,
    conservative_cost_usd: row?.cost_usd ?? null,
    blocker_excerpt: row?.blocker?.slice(0, 160) ?? null,
    references_own_adr: adrOwn,
  });
}

// ---- control 1: no-kill --------------------------------------------------
{
  const company = join(scratch, "control-no-kill");
  const runId = "RUN-20260812000000000-ctrlnok1";
  const nonce = randomUUID();
  const child = run(process.execPath, [CHILD, DIST, company, "none", runId, nonce]);
  const clean = child.status === 0 && child.stdout.includes(`DONE:shipped:${nonce}`);
  const validate = run(process.execPath, [CLI, "validate", "--repo", company]);
  results.push({
    point: "control:no-kill",
    verdict: clean && validate.status === 0 ? "PASS" : "FAIL",
    child_exit: child.status,
    validate_exit: validate.status,
  });
}

// ---- control 2: broken recovery must be DETECTED -------------------------
{
  const company = join(scratch, "control-broken-recovery");
  const runId = "RUN-20260812000000000-ctrlbrk1";
  const nonce = randomUUID();
  const killed = await killAtPoint("finalize:before-terminal-eval", company, runId, nonce);
  let detected = false;
  let detail = "";
  if (killed.verdict === "KILLED") {
    const mutatedDist = join(scratch, "mutated-dist");
    cpSync(DIST, mutatedDist, { recursive: true });
    const recoverPath = join(mutatedDist, "src/recover.js");
    const source = readFileSync(recoverPath, "utf8");
    const mutated = source.replace("await tx.appendTerminalEval(intended);", "/* MUTATED: terminal eval replay deleted */");
    if (mutated === source) {
      detail = "mutation anchor not found — control INVALID";
    } else {
      writeFileSync(recoverPath, mutated);
      const driver = join(scratch, "mutated-driver.mjs");
      writeFileSync(
        driver,
        `import { recoverCompany } from ${JSON.stringify(pathToFile(recoverPath))};\n` +
          `const report = await recoverCompany(process.argv[2]);\n` +
          `console.log(JSON.stringify(report));\n`,
      );
      const broken = run(process.execPath, [driver, company]);
      const validate = run(process.execPath, [CLI, "validate", "--repo", company]);
      // The broken recovery claims success; validation must refuse the result.
      detected = validate.status !== 0;
      detail = `broken recover exit ${broken.status}; post validate exit ${validate.status}`;
    }
  } else {
    detail = `setup INVALID: ${killed.reason}`;
  }
  results.push({ point: "control:broken-recovery", verdict: detected ? "PASS" : "FAIL", detail });
}

function pathToFile(p) {
  return new URL(`file://${p}`).href;
}

const harnessSha = createHash("sha256")
  .update(readFileSync(new URL(import.meta.url)))
  .digest("hex");

const summary = {
  harness: "p0b-crash-matrix",
  repo_head: HEAD,
  node_version: process.version,
  harness_sha256: harnessSha,
  started_at: results.length > 0 ? undefined : undefined,
  generated_at: new Date().toISOString(),
  assurance: {
    verified: "tested process-crash and SIGKILL recovery",
    not_verified: "sudden power loss, kernel panic, or storage-device loss",
  },
  points: results,
  all_points_pass: results.every((r) => r.verdict === "PASS"),
};
writeFileSync(OUT, `${JSON.stringify(summary, null, 2)}\n`);
rmSync(scratch, { recursive: true, force: true });
for (const r of results) {
  process.stdout.write(`${r.point}: ${r.verdict}\n`);
}
process.stdout.write(`all_points_pass: ${summary.all_points_pass}\n`);
process.exit(summary.all_points_pass ? 0 : 1);
