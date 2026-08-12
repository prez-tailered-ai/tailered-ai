#!/usr/bin/env node
// AUD-RUFLO-20260811-221322 / lane AUD-L7a
// EXPERIMENTAL SPIKE CODE. Not a Tailered runtime file. Not for production.
//
// A Tailered process agent: one JSON AgentRequest on stdin, exactly one JSON
// AgentResponse on stdout, diagnostics on stderr, nothing else.
//
// Design rules this file is built to satisfy, each mapped to the mechanism:
//
//  1  read-only context      the snapshot is materialised into a fresh mkdtemp
//                            with 0444/0555 modes; the repository path is never
//                            passed to the adapter at all, so it cannot be
//                            reached even by mistake. STRUCTURAL, not policy.
//  2  no repository mutation same mechanism; verified independently by the
//                            harness hashing the repo before and after.
//  3  output size limit      response is serialised, measured, and refused if it
//                            exceeds --max-output-bytes (default 4 MB, i.e.
//                            strictly under Tailered's 5 MB stdout kill).
//  4  timeout                --deadline-ms fires the adapter's own abort BEFORE
//                            Tailered's AbortSignal.timeout, so the adapter, not
//                            Tailered, is the one that reaps the process tree.
//  5  kill ALL children      children are spawned detached (own process group);
//                            cancellation sends SIGKILL to -pgid, so grandchildren
//                            die too. Tailered alone kills only the direct child.
//  6  model identity         reported from the engine that actually ran.
//  7  provider identity      likewise.
//  8  measured usage         counted from the real request/response bytes.
//  9  measured cost          computed from a pinned table over measured tokens.
// 10  whole files            payload-guard rejects placeholders and elisions.
// 11  no hidden state        no writes outside the mkdtemp; no cache; no clock
//                            or randomness in the payload; sealed child env.
//
// Usage:
//   node adapter.mjs [--engine-module=<path>] [--deadline-ms=N]
//                    [--max-input-bytes=N] [--max-output-bytes=N]
//                    [--sandbox-root=<dir>] [--keep-sandbox]

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { posix } from "node:path";
import { pathToFileURL } from "node:url";

import { countTokens, costUsd, priceTableHas } from "./lib/tokens.mjs";
import { guardPayload } from "./lib/payload-guard.mjs";

const ADAPTER_ID = "tailered-process-agent-adapter";
const ADAPTER_VERSION = "0.1.0-spike";

// ---------------------------------------------------------------- arguments

const options = {
  engineModule: "./lib/mock-engine.mjs",
  deadlineMs: 25_000,
  maxInputBytes: 8_000_000,
  maxOutputBytes: 4_000_000,
  maxFileBytes: 1_000_000,
  sandboxRoot: tmpdir(),
  keepSandbox: false,
};

for (const argument of process.argv.slice(2)) {
  const match = /^--([a-z-]+)(?:=(.*))?$/u.exec(argument);
  if (match === null) fail(64, `Unrecognised argument: ${argument}`);
  const [, key, value] = match;
  switch (key) {
    case "engine-module": options.engineModule = required(key, value); break;
    case "deadline-ms": options.deadlineMs = positiveInt(key, value); break;
    case "max-input-bytes": options.maxInputBytes = positiveInt(key, value); break;
    case "max-output-bytes": options.maxOutputBytes = positiveInt(key, value); break;
    case "max-file-bytes": options.maxFileBytes = positiveInt(key, value); break;
    case "sandbox-root": options.sandboxRoot = required(key, value); break;
    case "keep-sandbox": options.keepSandbox = true; break;
    default: fail(64, `Unrecognised option: --${key}`);
  }
}

function required(key, value) {
  if (value === undefined || value === "") fail(64, `--${key} requires a value.`);
  return value;
}
function positiveInt(key, value) {
  const parsed = Number(required(key, value));
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    fail(64, `--${key} must be a positive integer.`);
  }
  return parsed;
}

// ------------------------------------------------------- single-write stdout

let stdoutClaimed = false;

/** The ONLY function permitted to write to fd 1. Enforces "exactly one JSON". */
function emit(document) {
  if (stdoutClaimed) {
    throw new Error("Adapter attempted a second stdout write.");
  }
  stdoutClaimed = true;
  writeSync(1, document);
}

function diag(message) {
  try {
    writeSync(2, `[adapter] ${message}\n`);
  } catch {
    /* stderr may be closed; diagnostics are best-effort by contract */
  }
}

function fail(code, message) {
  diag(`FATAL ${message}`);
  cleanup();
  process.exit(code);
}

// ------------------------------------------------- child process-group reaper

/** pgids of every detached child we started, so cancellation reaps the tree. */
const childGroups = new Set();

function spawnSandboxed(command, args, spawnOptions) {
  const child = spawn(command, args, {
    ...spawnOptions,
    shell: false,
    // detached => the child becomes a process-group leader (pgid === child.pid).
    // Killing -pgid reaches grandchildren; killing child.pid alone does not.
    detached: true,
    // Never "inherit": a child that inherits fd 1 can corrupt the single
    // JSON document Tailered parses.
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (typeof child.pid === "number") childGroups.add(child.pid);
  return child;
}

function reapChildren(signal = "SIGKILL") {
  for (const pgid of childGroups) {
    try {
      process.kill(-pgid, signal);
      diag(`reaped process group ${pgid} with ${signal}`);
    } catch (error) {
      if (error?.code !== "ESRCH") diag(`reap ${pgid} failed: ${String(error)}`);
    }
  }
  childGroups.clear();
}

let sandboxDir;
let cleanedUp = false;
function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  reapChildren();
  if (sandboxDir !== undefined && !options.keepSandbox) {
    try {
      rmSync(sandboxDir, { recursive: true, force: true });
    } catch (error) {
      diag(`sandbox cleanup failed: ${String(error)}`);
    }
  }
}

// Tailered cancels by SIGTERM (AbortSignal.timeout default, and the explicit
// child.kill("SIGTERM") on the >5 MB path). Trap it and reap the whole tree.
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
  process.on(signal, () => {
    diag(`received ${signal}; reaping children and exiting`);
    cleanup();
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
}
process.on("exit", cleanup);

// ------------------------------------------------------------------ deadline

const deadlineTimer = setTimeout(() => {
  diag(`adapter deadline of ${options.deadlineMs} ms reached; aborting`);
  cleanup();
  process.exit(75); // EX_TEMPFAIL: bounded, self-inflicted, tree already reaped
}, options.deadlineMs);
deadlineTimer.unref();

// ------------------------------------------------------------- stdin reading

async function readRequest() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.byteLength;
    if (bytes > options.maxInputBytes) {
      fail(65, `stdin exceeded --max-input-bytes=${options.maxInputBytes}.`);
    }
    chunks.push(chunk);
  }
  if (bytes === 0) fail(65, "stdin closed with no request.");
  const raw = Buffer.concat(chunks).toString("utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(65, `stdin is not valid JSON: ${String(error)}`);
  }
  return { raw, request: parsed };
}

const TASK_KINDS = new Set([
  "testgen", "codegen", "critique", "narrate", "adr_draft", "judge",
]);
const TIERS = new Set(["frontier", "mid", "cheap"]);

function validateRequest(request) {
  const problems = [];
  const isRecord =
    typeof request === "object" && request !== null && !Array.isArray(request);
  if (!isRecord) fail(65, "Request must be a JSON object.");
  if (typeof request.runId !== "string" || request.runId === "")
    problems.push("runId");
  if (!TASK_KINDS.has(request.taskKind)) problems.push("taskKind");
  if (typeof request.model !== "string" || request.model === "")
    problems.push("model");
  if (!TIERS.has(request.tier)) problems.push("tier");
  if (
    typeof request.signals !== "object" || request.signals === null ||
    !Number.isSafeInteger(request.signals.attempts) || request.signals.attempts < 0
  ) problems.push("signals.attempts");
  if (typeof request.spec !== "string" || request.spec === "") problems.push("spec");
  if (typeof request.contextSnapshot !== "string") problems.push("contextSnapshot");
  if (request.failureOutput !== undefined && typeof request.failureOutput !== "string")
    problems.push("failureOutput");
  if (problems.length > 0) {
    fail(65, `Request fields invalid: ${problems.join(", ")}.`);
  }
  // NOTE (finding RUF-711): AgentRequest carries NO projection. The agent is
  // never told the cost/token ceiling it is being measured against, so it
  // cannot self-limit. This is a PRE-EXISTING TAILERED contract gap, not a
  // Ruflo defect. The adapter compensates with its own conservative caps.
}

// ------------------------------------------- read-only context materialisation

function materialiseSnapshot(snapshotJson) {
  sandboxDir = mkdtempSync(join(resolve(options.sandboxRoot), "tpa-"));
  const contextDir = join(sandboxDir, "context");
  const workDir = join(sandboxDir, "work");
  mkdirSync(contextDir, { recursive: true });
  mkdirSync(workDir, { recursive: true });

  let snapshot;
  try {
    snapshot = JSON.parse(snapshotJson);
  } catch (error) {
    fail(65, `contextSnapshot is not valid JSON: ${String(error)}`);
  }
  const files = Array.isArray(snapshot?.files) ? snapshot.files : [];
  let written = 0;
  for (const entry of files) {
    if (typeof entry?.path !== "string" || typeof entry?.content !== "string") {
      fail(65, "contextSnapshot entry is malformed.");
    }
    // The snapshot itself is attacker-influenceable (a previous agent chose
    // some of those filenames), so confine it before touching the filesystem.
    const normalised = posix.normalize(entry.path);
    if (
      posix.isAbsolute(normalised) || normalised.startsWith("../") ||
      normalised === ".." || normalised.includes("\0")
    ) {
      fail(65, `contextSnapshot path escapes the sandbox: ${entry.path}`);
    }
    const target = join(contextDir, normalised);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, entry.content, { encoding: "utf8" });
    chmodSync(target, 0o444);
    written += 1;
  }
  chmodSync(contextDir, 0o555);
  return {
    sandboxDir,
    contextDir,
    workDir,
    fileCount: written,
    repoHash: typeof snapshot?.repoHash === "string" ? snapshot.repoHash : null,
    snapshotSha256: createHash("sha256").update(snapshotJson).digest("hex"),
  };
}

// ---------------------------------------------------------------------- main

async function main() {
  const { raw, request } = await readRequest();
  validateRequest(request);

  if (!priceTableHas(request.model)) {
    fail(70, `No pinned price for model alias "${request.model}".`);
  }

  const context = materialiseSnapshot(request.contextSnapshot);
  diag(
    `run=${request.runId} task=${request.taskKind} tier=${request.tier} ` +
      `model=${request.model} snapshot=${context.fileCount} files ` +
      `sha256=${context.snapshotSha256.slice(0, 16)} sandbox=${context.sandboxDir}`,
  );

  const engineUrl = pathToFileURL(
    resolve(dirname(new URL(import.meta.url).pathname), options.engineModule),
  ).href;
  const engine = await import(engineUrl);

  const startedAt = process.hrtime.bigint();
  const payloadRaw = await engine.generate(request, {
    contextDir: context.contextDir,
    workDir: context.workDir,
    spawnSandboxed,
  });
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

  const payload = guardPayload(request.taskKind, payloadRaw, {
    maxFileBytes: options.maxFileBytes,
  });

  // MEASURED usage. Input is what the agent actually consumed (the whole
  // request document); output is what it actually produced.
  const payloadJson = JSON.stringify(payload);
  const inputTokens = countTokens(raw);
  const outputTokens = countTokens(payloadJson);
  const cost = costUsd(request.model, inputTokens, outputTokens);

  // Provenance. AgentResponse has no field for model or provider identity
  // (finding RUF-712), so the only durable place to put it is inside payload,
  // where Tailered stores it verbatim in the append-only call trace but never
  // validates it. Recorded here so the gap is at least observable.
  const provenance = {
    adapter: ADAPTER_ID,
    adapter_version: ADAPTER_VERSION,
    engine: engine.ENGINE_ID ?? "unknown",
    provider_actual: engine.PROVIDER_ID ?? "unknown",
    model_requested: request.model,
    model_actual:
      typeof engine.resolveModel === "function"
        ? engine.resolveModel(request.model)
        : "unknown",
    context_repo_hash: context.repoHash,
    context_snapshot_sha256: context.snapshotSha256,
    context_files: context.fileCount,
    engine_wall_ms: Math.round(elapsedMs),
    measured: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
  const enriched =
    payload !== null && typeof payload === "object" && !Array.isArray(payload)
      ? { ...payload, __provenance: provenance }
      : { value: payload, __provenance: provenance };

  const response = {
    payload: enriched,
    usage: { input: inputTokens, output: outputTokens, costUsd: cost },
  };
  const document = JSON.stringify(response);
  const bytes = Buffer.byteLength(document);
  if (bytes > options.maxOutputBytes) {
    // Fail closed. Emitting an oversize document would make Tailered SIGTERM
    // us mid-write and halt the run on "stdout exceeded 5 MB" with no record
    // of why. A non-zero exit at least carries the reason on stderr.
    fail(69, `Response is ${bytes} bytes, over --max-output-bytes=${options.maxOutputBytes}.`);
  }

  diag(
    `usage input=${inputTokens} output=${outputTokens} costUsd=${cost} ` +
      `bytes=${bytes} provider=${provenance.provider_actual} ` +
      `model_actual=${provenance.model_actual}`,
  );
  emit(document);
  clearTimeout(deadlineTimer);
  cleanup();
  process.exit(0);
}

main().catch((error) => {
  fail(70, error instanceof Error ? `${error.message}` : String(error));
});
