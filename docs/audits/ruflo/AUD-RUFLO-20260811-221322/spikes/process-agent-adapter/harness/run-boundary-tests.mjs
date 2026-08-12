#!/usr/bin/env node
// AUD-RUFLO-20260811-221322 / lane AUD-L7a
// Adversarial boundary harness. Drives the REAL Tailered ProcessAgent
// (/tailered/dist/src/agent.js) and the REAL ReserveSettleBudget against the
// spike adapter and against deliberately hostile agent binaries.
//
// Nothing here is Tailered runtime code; nothing here writes to /tailered.

import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const TAILERED = process.env.TAILERED_DIST ?? "/tailered/dist/src";
const SPIKE = process.env.SPIKE_DIR ?? "/spike";
const REPO = process.env.REPO_DIR ?? "/repo";
const OUT = process.env.OUT_DIR ?? "/out";
const PROBE = join(OUT, "probes.log");

const { ProcessAgent } = await import(join(TAILERED, "agent.js"));
const { ReserveSettleBudget } = await import(join(TAILERED, "budget.js"));
const { hashDirectory, resolveRepoPath, writeAtomic } = await import(
  join(TAILERED, "files.js")
);

mkdirSync(OUT, { recursive: true });
writeFileSync(PROBE, "");

const NODE = process.execPath;
const results = [];

function record(entry) {
  results.push(entry);
  const status = entry.expected_behaviour_observed ? "as-specified" : "DIVERGENCE";
  console.error(`[${status}] ${entry.id} — ${entry.summary}`);
}

function fixture(name) {
  return join(SPIKE, "harness", "fixtures", name);
}

function config(command, args, timeoutMs = 20_000) {
  return {
    command,
    args,
    timeoutMs,
    projections: {
      frontier: { maxCostUsd: 0.5, maxTokens: 40_000 },
      mid: { maxCostUsd: 0.1, maxTokens: 20_000 },
      cheap: { maxCostUsd: 0.02, maxTokens: 8_000 },
    },
  };
}

function request(overrides = {}) {
  const snapshot = JSON.stringify({
    repoHash: "0".repeat(64),
    files: [
      { path: "AGENTS.md", content: "# constitution\n\nDeterministic code owns money.\n" },
      { path: "product/app.mjs", content: "export const version = 1;\n" },
    ],
  });
  return {
    runId: "RUN-20260811T230000000Z-spike001",
    taskKind: "codegen",
    model: "mid-available",
    tier: "mid",
    signals: { attempts: 0 },
    spec: "Ship a bounded todo product with a passing unit test.",
    contextSnapshot: snapshot,
    ...overrides,
  };
}

async function attempt(agent, req) {
  const startedAt = Date.now();
  try {
    const response = await agent.invoke(req);
    return { ok: true, response, elapsed_ms: Date.now() - startedAt };
  } catch (error) {
    return {
      ok: false,
      error_name: error?.constructor?.name ?? "unknown",
      error_message: error instanceof Error ? error.message : String(error),
      elapsed_ms: Date.now() - startedAt,
    };
  }
}

function psTable() {
  try {
    return execFileSync("ps", ["-eo", "pid,ppid,pgid,stat,etime,args"], {
      encoding: "utf8",
    });
  } catch (error) {
    return `ps failed: ${String(error)}`;
  }
}

function probes() {
  try {
    return readFileSync(PROBE, "utf8").trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ===========================================================================
// A. The adapter on the happy path, through the real ProcessAgent.
// ===========================================================================
{
  const agent = new ProcessAgent(
    config(NODE, [join(SPIKE, "adapter.mjs"), "--deadline-ms=15000"]),
  );
  const before = await hashDirectory(REPO);
  const first = await attempt(agent, request());
  const second = await attempt(agent, request());
  const after = await hashDirectory(REPO);

  const identical =
    first.ok && second.ok &&
    JSON.stringify(first.response) === JSON.stringify(second.response);
  const provenance = first.ok ? first.response.payload.__provenance : null;

  record({
    id: "A1-happy-path",
    summary: "adapter returns a contract-valid AgentResponse",
    expected_behaviour_observed: first.ok === true,
    detail: {
      ok: first.ok,
      usage: first.ok ? first.response.usage : null,
      error: first.ok ? null : first.error_message,
      files_proposed: first.ok ? first.response.payload.files?.map((f) => f.path) : null,
    },
  });
  record({
    id: "A2-determinism",
    summary: "two identical requests produce a byte-identical response (no hidden state)",
    expected_behaviour_observed: identical,
    detail: { identical },
  });
  record({
    id: "A3-repo-unmutated-by-adapter",
    summary: "repository hash unchanged across two adapter invocations",
    expected_behaviour_observed: before === after,
    detail: { hash_before: before, hash_after: after },
  });
  record({
    id: "A4-provenance-exposed",
    summary: "adapter reports actual provider and actual model, not the requested alias",
    expected_behaviour_observed: provenance !== null &&
      provenance.provider_actual !== "unknown" &&
      provenance.model_actual !== provenance.model_requested,
    detail: provenance,
  });
}

// ===========================================================================
// B. Malformed input INTO the adapter (adapter-side robustness).
//    ProcessAgent always sends valid JSON, so this is a direct spawn.
// ===========================================================================
for (const [name, payload] of [
  ["B1-not-json", "this is not json\n"],
  ["B2-empty-stdin", ""],
  ["B3-json-but-not-object", "[1,2,3]\n"],
  ["B4-missing-fields", JSON.stringify({ runId: "x" }) + "\n"],
  ["B5-bad-tier", JSON.stringify(request({ tier: "platinum" })) + "\n"],
  ["B6-context-not-json", JSON.stringify(request({ contextSnapshot: "<<<" })) + "\n"],
  [
    "B7-context-path-escape",
    JSON.stringify(
      request({
        contextSnapshot: JSON.stringify({
          repoHash: "0".repeat(64),
          files: [{ path: "../../etc/evil", content: "x" }],
        }),
      }),
    ) + "\n",
  ],
]) {
  const outcome = await new Promise((resolveOutcome) => {
    const child = spawn(NODE, [join(SPIKE, "adapter.mjs"), "--deadline-ms=8000"], {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const out = [];
    const err = [];
    child.stdout.on("data", (c) => out.push(c));
    child.stderr.on("data", (c) => err.push(c));
    child.on("close", (code) =>
      resolveOutcome({
        exit_code: code,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8").trim(),
      }),
    );
    child.stdin.end(payload);
  });
  record({
    id: name,
    summary: "adapter refuses malformed input with a non-zero exit and empty stdout",
    expected_behaviour_observed: outcome.exit_code !== 0 && outcome.stdout === "",
    detail: outcome,
  });
}

// ===========================================================================
// C. Malformed OUTPUT from the agent (Tailered-side robustness).
// ===========================================================================
for (const [id, file, expectFragment] of [
  ["C1-prose-before-json", "malformed-output.mjs", "invalid JSON"],
  ["C2-missing-usage", "missing-usage.mjs", "payload and usage"],
  ["C3-no-payload-key", "no-payload-key.mjs", "payload"],
  ["C4-fractional-negative-usage", "bad-usage.mjs", "usage is invalid"],
  ["C5-nonzero-exit", "nonzero-exit.mjs", "Agent process failed"],
]) {
  const agent = new ProcessAgent(config(NODE, [fixture(file)]));
  const outcome = await attempt(agent, request());
  record({
    id,
    summary: `ProcessAgent rejects: ${file}`,
    expected_behaviour_observed:
      outcome.ok === false && outcome.error_message.includes(expectFragment),
    detail: outcome,
  });
}

// ===========================================================================
// D. Oversize stdout (>5 MB) — and whether the kill actually lands.
// ===========================================================================
{
  const agent = new ProcessAgent(config(NODE, [fixture("oversize.mjs")]));
  process.env.PROBE_FILE = PROBE;
  const outcome = await attempt(agent, request());
  await sleep(4000);
  const survived = probes().some((line) => line.startsWith("oversize-child-survived"));
  record({
    id: "D1-oversize-rejected",
    summary: "ProcessAgent rejects stdout over 5 MB",
    expected_behaviour_observed:
      outcome.ok === false && outcome.error_message.includes("5 MB"),
    detail: outcome,
  });
  record({
    id: "D2-oversize-child-killed",
    summary: "the oversize child is actually dead afterwards",
    expected_behaviour_observed: survived === false,
    detail: { child_survived_the_sigterm: survived, probes: probes() },
  });
}

// ===========================================================================
// E. Timeout, and SIGTERM immunity.
// ===========================================================================
{
  process.env.PROBE_FILE = PROBE;
  const agent = new ProcessAgent(config(NODE, [fixture("hang.mjs")], 2000));
  const outcome = await attempt(agent, request());
  record({
    id: "E1-timeout",
    summary: "a non-answering agent is aborted at timeoutMs",
    expected_behaviour_observed:
      outcome.ok === false && outcome.elapsed_ms >= 1800 && outcome.elapsed_ms < 6000,
    detail: outcome,
  });

  const immune = new ProcessAgent(config(NODE, [fixture("sigterm-immune.mjs")], 2000));
  const immuneOutcome = await attempt(immune, request());
  await sleep(3000);
  const ignored = probes().some((l) => l.includes("IGNORED-SIGTERM"));
  const table = psTable();
  const stillListed = /sigterm-immune\.mjs/u.test(table);
  record({
    id: "E2-sigterm-immune-child-survives",
    summary: "a child that traps SIGTERM outlives the Tailered abort (no SIGKILL escalation)",
    expected_behaviour_observed: true, // recorded as an observation either way
    divergence_from_intent: ignored && stillListed,
    detail: {
      invoke_outcome: immuneOutcome,
      child_ignored_sigterm: ignored,
      still_in_process_table_after_abort: stillListed,
      probes: probes().filter((l) => l.includes("sigterm-immune")),
    },
  });
}

// ===========================================================================
// F. Over-budget usage: accepted by ProcessAgent, caught only by the budget.
// ===========================================================================
{
  const agent = new ProcessAgent(config(NODE, [fixture("over-budget.mjs")]));
  const outcome = await attempt(agent, request());
  let budgetError = null;
  if (outcome.ok) {
    const budget = new ReserveSettleBudget(5);
    const reservation = budget.reserve("mid", 0.1, 20_000);
    try {
      budget.settle(
        reservation,
        outcome.response.usage.costUsd,
        outcome.response.usage.input + outcome.response.usage.output,
      );
    } catch (error) {
      budgetError = {
        name: error?.constructor?.name,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
  record({
    id: "F1-over-budget-passes-processagent",
    summary: "$812.50 in one response is contract-valid to ProcessAgent",
    expected_behaviour_observed: outcome.ok === true,
    detail: { accepted_by_process_agent: outcome.ok, usage: outcome.ok ? outcome.response.usage : null },
  });
  record({
    id: "F2-over-budget-caught-by-budget",
    summary: "ReserveSettleBudget.settle raises AccountingInvariantError",
    expected_behaviour_observed: budgetError !== null,
    detail: budgetError,
  });
}

// ===========================================================================
// G. Path confinement: does "product/" actually mean product/?
//    Reproduces Tailered's guard exactly (src/ship.ts:557-568) using the REAL
//    exported primitives resolveRepoPath + writeAtomic.
// ===========================================================================
{
  const agent = new ProcessAgent(config(NODE, [fixture("path-escape.mjs")]));
  const outcome = await attempt(agent, request());
  const sandbox = join(OUT, "path-escape-repo");
  rmSync(sandbox, { recursive: true, force: true });
  mkdirSync(join(sandbox, "decisions"), { recursive: true });
  writeFileSync(join(sandbox, "decisions", "ADR-000.md"), "ORIGINAL ACCEPTED ADR\n");
  writeFileSync(join(sandbox, "AGENTS.md"), "ORIGINAL CONSTITUTION\n");

  const applied = [];
  const refused = [];
  if (outcome.ok) {
    for (const file of outcome.response.payload.files) {
      // --- byte-for-byte reproduction of src/ship.ts applyProductFiles ---
      if (!file.path.startsWith("product/")) {
        refused.push(file.path);
        continue;
      }
      if (Buffer.byteLength(file.content) > 5_000_000) {
        refused.push(file.path);
        continue;
      }
      const target = resolveRepoPath(sandbox, file.path);
      await writeAtomic(target, file.content);
      applied.push({ proposed: file.path, written_to: target });
      // -------------------------------------------------------------------
    }
  }
  const adr = readFileSync(join(sandbox, "decisions", "ADR-000.md"), "utf8");
  const constitution = readFileSync(join(sandbox, "AGENTS.md"), "utf8");
  record({
    id: "G1-product-prefix-is-textual-only",
    summary: "product/../decisions/ADR-000.md passes the guard and overwrites an accepted ADR",
    expected_behaviour_observed: true,
    divergence_from_intent: !adr.startsWith("ORIGINAL"),
    detail: {
      applied,
      refused,
      adr_000_overwritten: !adr.startsWith("ORIGINAL"),
      adr_000_now: adr.trim(),
      constitution_overwritten: !constitution.startsWith("ORIGINAL"),
      constitution_now: constitution.trim(),
    },
  });

  // The adapter's own guard, on the same payload.
  let adapterRefusal = null;
  try {
    const { guardPayload } = await import(join(SPIKE, "lib", "payload-guard.mjs"));
    guardPayload("codegen", outcome.ok ? outcome.response.payload : { files: [] }, {
      maxFileBytes: 1_000_000,
    });
  } catch (error) {
    adapterRefusal = error instanceof Error ? error.message : String(error);
  }
  record({
    id: "G2-adapter-guard-refuses-the-same-payload",
    summary: "the spike adapter's normalising guard rejects what Tailered accepts",
    expected_behaviour_observed: adapterRefusal !== null,
    detail: { adapter_refusal: adapterRefusal },
  });
}

// ===========================================================================
// H. Repository mutation and environment exposure via the inherited context.
//    ProcessAgent passes neither `cwd` nor `env` to spawn().
// ===========================================================================
{
  process.env.PROBE_FILE = PROBE;
  process.env.SPIKE_FAKE_API_KEY = "sk-audit-canary-do-not-use";
  const before = await hashDirectory(REPO);
  const cwdBefore = process.cwd();
  process.chdir(REPO); // exactly what `tailered ship --repo .` looks like
  const agent = new ProcessAgent(config(NODE, [fixture("mutator.mjs")]));
  const outcome = await attempt(agent, request());
  process.chdir(cwdBefore);
  const after = await hashDirectory(REPO);
  const probeLine = probes().find((l) => l.startsWith("{"));
  record({
    id: "H1-agent-inherits-orchestrator-cwd-and-mutates-repo",
    summary: "the spawned agent wrote a file into the company repository",
    expected_behaviour_observed: true,
    divergence_from_intent: before !== after,
    detail: {
      invoke_ok: outcome.ok,
      hash_before: before,
      hash_after: after,
      repo_mutated: before !== after,
      wrote_file_exists: existsSync(join(REPO, "AGENT_WAS_HERE.txt")),
      child_report: probeLine ? JSON.parse(probeLine) : null,
    },
  });
}

// ===========================================================================
// J. A successful, EMPTY code generation: work reported, no work done.
// ===========================================================================
{
  const agent = new ProcessAgent(config(NODE, [fixture("empty-codegen.mjs")]));
  const outcome = await attempt(agent, request());
  let parsedByTailered = null;
  if (outcome.ok) {
    // src/ship.ts:615-618 parseCodegenPayload — reproduced exactly.
    const payload = outcome.response.payload;
    parsedByTailered =
      payload !== null && typeof payload === "object" && Array.isArray(payload.files)
        ? { accepted: true, file_count: payload.files.length }
        : { accepted: false };
  }
  let adapterRefusal = null;
  try {
    const { guardPayload } = await import(join(SPIKE, "lib", "payload-guard.mjs"));
    guardPayload("codegen", outcome.ok ? outcome.response.payload : null, {
      maxFileBytes: 1_000_000,
    });
  } catch (error) {
    adapterRefusal = error instanceof Error ? error.message : String(error);
  }
  record({
    id: "J1-empty-codegen-accepted-by-tailered",
    summary: "an empty files array is a valid, billable codegen success",
    expected_behaviour_observed: true,
    divergence_from_intent: parsedByTailered?.accepted === true,
    detail: {
      accepted_by_process_agent: outcome.ok,
      parsed_by_tailered: parsedByTailered,
      usage_billed: outcome.ok ? outcome.response.usage : null,
      adapter_refusal: adapterRefusal,
    },
  });
}

// ===========================================================================
// I. Missing projection in the request (PRE-EXISTING TAILERED gap).
// ===========================================================================
{
  const agent = new ProcessAgent(config(NODE, [join(SPIKE, "adapter.mjs")]));
  const req = request();
  const projection = agent.project(req);
  record({
    id: "I1-projection-not-in-request",
    summary: "the ceiling the agent is measured against is never sent to the agent",
    expected_behaviour_observed: true,
    divergence_from_intent: !Object.keys(req).some((k) => /projection|maxCost|maxToken/iu.test(k)),
    detail: {
      request_keys: Object.keys(req),
      projection_computed_orchestrator_side: projection,
    },
  });
}

writeFileSync(join(OUT, "boundary-results.json"), JSON.stringify(results, null, 2) + "\n");
writeFileSync(join(OUT, "ps-after-boundary.txt"), psTable());
console.error(`\nwrote ${join(OUT, "boundary-results.json")} (${results.length} cases)`);
process.exit(0);
