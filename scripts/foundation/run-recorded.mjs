#!/usr/bin/env node
/**
 * run-recorded.mjs — recorded command execution for the agent-platform foundation program.
 *
 * Runs one command without a shell, captures stdout and stderr separately, records the TRUE
 * exit code, hashes every retained artifact, and appends a matched pair of `step_started` /
 * `step_finished` events to the program ledger.
 *
 * The exit code of this wrapper is the exit code of the wrapped command. A failing command
 * stays failing — that property is the reason this tool exists, because `cmd | tail` returns
 * `tail`'s status and has already produced one false pass in this program.
 *
 * A command killed by a signal is reported as `exit_code: null` with `signal` populated. It is
 * never flattened into a success, and never invented as a numeric code the process never had.
 *
 * Zero runtime dependencies: Node built-ins only.
 *
 * Usage:
 *   node scripts/foundation/run-recorded.mjs \
 *     --scope P0-B --step P0B-04 --attempt 1 \
 *     --objective "freeze the baseline" \
 *     --expected "npm test exits 0" \
 *     --evidence docs/foundation/p0-agent-safety/p0-b/evidence/baseline-test \
 *     [--cwd <dir>] [--allow-failure] [--verification "<method>"] \
 *     [--ledger <path>] [--caused-by <id>]... \
 *     -- npm test
 */

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { homedir } from "node:os";

const DEFAULT_LEDGER =
  "docs/foundation/agent-platform-foundation/program-ledger.jsonl";

const EX_USAGE = 64;
const EX_SOFTWARE = 70;
const EX_SPAWN_FAILED = 127;
const EX_SIGNALLED = 137; // wrapper-level only; the event records exit_code null + signal

function fail(message) {
  process.stderr.write(`run-recorded: ${message}\n`);
  process.exit(EX_USAGE);
}

function parseArgs(argv) {
  const separator = argv.indexOf("--");
  if (separator === -1) fail("Missing `--` separator before the command to run.");
  const flags = argv.slice(0, separator);
  const command = argv.slice(separator + 1);
  if (command.length === 0) fail("No command supplied after `--`.");

  const options = {
    scope: null,
    step: null,
    attempt: 1,
    objective: null,
    expected: null,
    evidence: null,
    cwd: process.cwd(),
    ledger: DEFAULT_LEDGER,
    allowFailure: false,
    verification: null,
    independentChecker: null,
    causedBy: [],
    shell: false,
  };

  for (let i = 0; i < flags.length; i += 1) {
    const flag = flags[i];
    const next = () => {
      const value = flags[i + 1];
      if (value === undefined) fail(`Flag ${flag} requires a value.`);
      i += 1;
      return value;
    };
    switch (flag) {
      case "--scope": options.scope = next(); break;
      case "--step": options.step = next(); break;
      case "--attempt": options.attempt = Number(next()); break;
      case "--objective": options.objective = next(); break;
      case "--expected": options.expected = next(); break;
      case "--evidence": options.evidence = next(); break;
      case "--cwd": options.cwd = resolve(next()); break;
      case "--ledger": options.ledger = next(); break;
      case "--verification": options.verification = next(); break;
      case "--independent-checker": options.independentChecker = next(); break;
      case "--caused-by": options.causedBy.push(next()); break;
      case "--allow-failure": options.allowFailure = true; break;
      case "--shell": options.shell = true; break;
      default: fail(`Unknown flag: ${flag}`);
    }
  }

  for (const required of ["scope", "step", "objective", "expected", "evidence"]) {
    if (!options[required]) fail(`Missing required flag --${required}.`);
  }
  if (!Number.isSafeInteger(options.attempt) || options.attempt < 1) {
    fail("--attempt must be a positive integer.");
  }
  return { options, command };
}

/** Replace machine-specific and credential-shaped text so evidence is portable. */
function redact(text, repoRoot) {
  if (typeof text !== "string") return text;
  let out = text;
  const home = homedir();
  for (const root of [repoRoot, `/private${repoRoot}`]) {
    if (root) out = out.split(root).join("<REPO>");
  }
  for (const h of [home, `/private${home}`]) {
    if (h) out = out.split(h).join("<HOME>");
  }
  out = out.replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "<REDACTED-TOKEN>");
  out = out.replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "<REDACTED-KEY>");
  out = out.replace(/\bAKIA[0-9A-Z]{16}\b/g, "<REDACTED-AWS-KEY>");
  out = out.replace(
    /((?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*)["']?[A-Za-z0-9/+=_-]{12,}["']?/gi,
    "$1<REDACTED>",
  );
  return out;
}

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function repoRelative(root, path) {
  const abs = isAbsolute(path) ? path : resolve(root, path);
  const rel = relative(root, abs);
  return rel.startsWith("..") ? path : rel;
}

async function main() {
  const { options, command } = parseArgs(process.argv.slice(2));
  const repoRoot = git(["rev-parse", "--show-toplevel"], options.cwd) ?? options.cwd;

  // Evidence paths carry the attempt number, so a rerun can never overwrite a prior artifact.
  const base = isAbsolute(options.evidence)
    ? options.evidence
    : resolve(repoRoot, options.evidence);
  const suffix = `.attempt${options.attempt}`;
  const outPath = `${base}${suffix}.out.txt`;
  const errPath = `${base}${suffix}.err.txt`;
  const metaPath = `${base}${suffix}.meta.json`;

  for (const path of [outPath, errPath, metaPath]) {
    if (existsSync(path)) {
      fail(
        `Evidence artifact already exists: ${repoRelative(repoRoot, path)}. ` +
          `Use a new --attempt number; recorded evidence is never overwritten.`,
      );
    }
  }
  mkdirSync(dirname(outPath), { recursive: true });

  const ledgerPath = isAbsolute(options.ledger)
    ? options.ledger
    : resolve(repoRoot, options.ledger);
  mkdirSync(dirname(ledgerPath), { recursive: true });

  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], options.cwd);
  const headBefore = git(["rev-parse", "HEAD"], options.cwd);
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const eventBase = `FND-${options.scope}-${options.step}-A${options.attempt}`;

  const startEvent = {
    event_id: `${eventBase}-START`,
    event_type: "step_started",
    scope: options.scope,
    step_id: options.step,
    attempt: options.attempt,
    actor: "Fable 5",
    status: null,
    repo: "prez-tailered-ai/tailered-ai",
    branch,
    head_before: headBefore,
    head_after: null,
    started_at: startedAt,
    finished_at: null,
    duration_ms: null,
    objective: options.objective,
    preconditions: [],
    command_or_action: command.join(" "),
    cwd: repoRelative(repoRoot, options.cwd) || ".",
    expected: options.expected,
    actual: null,
    exit_code: null,
    signal: null,
    files_touched: [],
    evidence_refs: [],
    evidence_sha256: {},
    caused_by: options.causedBy,
    verification: {
      method: options.verification,
      independent_checker: options.independentChecker,
    },
    blocker: null,
    caveats: [],
    next_action: null,
    human_action_required: null,
    // Names only. Values are never recorded.
    environment_variable_names: Object.keys(process.env).sort(),
  };
  appendFileSync(ledgerPath, `${JSON.stringify(startEvent)}\n`, "utf8");

  const child = spawn(command[0], command.slice(1), {
    cwd: options.cwd,
    shell: options.shell,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stdoutChunks = [];
  const stderrChunks = [];
  child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
  child.stderr.on("data", (chunk) => stderrChunks.push(chunk));

  const outcome = await new Promise((settle) => {
    let settled = false;
    const once = (value) => {
      if (!settled) {
        settled = true;
        settle(value);
      }
    };
    child.on("error", (error) => once({ code: null, signal: null, spawnError: error }));
    child.on("close", (code, signal) => once({ code, signal, spawnError: null }));
  });

  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - startedMs;
  const headAfter = git(["rev-parse", "HEAD"], options.cwd);

  const outText = redact(Buffer.concat(stdoutChunks).toString("utf8"), repoRoot);
  const errText = redact(Buffer.concat(stderrChunks).toString("utf8"), repoRoot);
  writeFileSync(outPath, outText, "utf8");
  writeFileSync(errPath, errText, "utf8");

  const succeeded = outcome.spawnError === null &&
    outcome.signal === null &&
    outcome.code === 0;
  const status = succeeded ? "PASS" : options.allowFailure ? "PASS" : "FAIL";

  const meta = {
    event_id: `${eventBase}-FINISH`,
    scope: options.scope,
    step_id: options.step,
    attempt: options.attempt,
    command,
    cwd: repoRelative(repoRoot, options.cwd) || ".",
    started_at: startedAt,
    finished_at: finishedAt,
    duration_ms: durationMs,
    exit_code: outcome.code,
    signal: outcome.signal,
    spawn_error: outcome.spawnError ? String(outcome.spawnError.message) : null,
    allow_failure: options.allowFailure,
    status,
    stdout_bytes: Buffer.byteLength(outText),
    stderr_bytes: Buffer.byteLength(errText),
    stdout_sha256: sha256(outText),
    stderr_sha256: sha256(errText),
  };
  writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");

  const evidenceRefs = [outPath, errPath, metaPath].map((p) => repoRelative(repoRoot, p));
  const finishEvent = {
    ...startEvent,
    event_id: `${eventBase}-FINISH`,
    event_type: "step_finished",
    status,
    head_after: headAfter,
    finished_at: finishedAt,
    duration_ms: durationMs,
    actual: outcome.spawnError
      ? `spawn failed: ${outcome.spawnError.message}`
      : outcome.signal
        ? `terminated by signal ${outcome.signal}`
        : `exit ${outcome.code}`,
    exit_code: outcome.code,
    signal: outcome.signal,
    evidence_refs: evidenceRefs,
    evidence_sha256: {
      [evidenceRefs[0]]: meta.stdout_sha256,
      [evidenceRefs[1]]: meta.stderr_sha256,
    },
    blocker: status === "FAIL"
      ? (outcome.spawnError
          ? `spawn failed: ${outcome.spawnError.message}`
          : outcome.signal
            ? `terminated by signal ${outcome.signal}`
            : `command exited ${outcome.code}`)
      : null,
  };
  delete finishEvent.environment_variable_names;
  appendFileSync(ledgerPath, `${JSON.stringify(finishEvent)}\n`, "utf8");

  process.stderr.write(
    `run-recorded: ${options.step} attempt ${options.attempt} -> ${status} ` +
      `(exit ${outcome.code}, signal ${outcome.signal}, ${durationMs}ms) -> ${evidenceRefs[0]}\n`,
  );

  // Return the wrapped command's true exit code, never a rewritten one.
  if (outcome.spawnError) process.exit(EX_SPAWN_FAILED);
  if (outcome.signal) process.exit(EX_SIGNALLED);
  process.exit(outcome.code ?? 1);
}

main().catch((error) => {
  process.stderr.write(`run-recorded: internal failure: ${error?.stack ?? error}\n`);
  process.exit(EX_SOFTWARE);
});
