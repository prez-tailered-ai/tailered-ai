#!/usr/bin/env node
/**
 * crash-child.mjs — the process the P0-B crash matrix kills.
 *
 * Usage: node crash-child.mjs <repoDist> <companyDir> <point> <runId> <nonce>
 *
 * The child mints a disposable company, then ships one deterministic run. At the named kill
 * point it prints an authenticated sentinel and blocks forever, holding whatever state the
 * real runtime holds there — including the repository lock, when the point is inside a
 * critical section. The parent verifies the sentinel and sends SIGKILL.
 *
 * The pause is installed HERE, in test code running inside the process, through
 * `installBarrier`. No environment variable, file, socket, or external signal can install a
 * production barrier; that property is exactly what this driver preserves.
 *
 * `point` values: allocate:after-read | agent:during-invocation | append:after-uniqueness |
 * finalize:before-intent | adr:before-create | finalize:before-terminal-eval |
 * finalize:before-marker | none (the no-kill control: run to completion).
 */

import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const [, , repoDist, companyDir, point, runId, nonce] = process.argv;
if (!repoDist || !companyDir || !point || !runId || !nonce) {
  process.stderr.write("usage: crash-child.mjs <repoDist> <companyDir> <point> <runId> <nonce>\n");
  process.exit(64);
}

const load = (module) => import(pathToFileURL(resolve(repoDist, module)).href);
const { mintCompany } = await load("src/company.js");
const { installBarrier } = await load("src/barrier.js");
const { taileredShip, FixedGate } = await load("src/ship.js");
const { TodoDemoAgent } = await load("src/demo-agent.js");

await mintCompany(companyDir, {
  what: "We are building a disposable fixture that proves crash recovery semantics.",
  forWhom: "It serves one auditor who kills this process at an exact runtime boundary.",
  winningLooksLike: "Winning means the state left behind recovers or quarantines honestly.",
  constraints: "The fixture is disposable, makes zero model calls, and spends nothing.",
});
process.stdout.write(`MINTED:${companyDir}\n`);

let reached = false;
const holdForever = () => {
  // A pending promise alone does not keep Node alive; a live timer does.
  setInterval(() => {}, 1 << 30);
  return new Promise(() => {});
};
const announce = () => {
  reached = true;
  process.stdout.write(`AT:${point}:${process.pid}:${runId}:${nonce}\n`);
  return holdForever();
};

let agent = new TodoDemoAgent();
if (point === "agent:during-invocation") {
  const inner = agent;
  agent = {
    project: (request) => inner.project(request),
    invoke: async (request) => {
      if (!reached) return announce();
      return inner.invoke(request);
    },
  };
} else if (point !== "none") {
  installBarrier(point, () => {
    if (reached) return;
    return announce();
  });
}

const receipt = await taileredShip({
  root: companyDir,
  runId,
  specText: "Build the single-user todo gating demonstration.",
  agent,
  gate: new FixedGate({
    verdict: "approve",
    reasonText: "All generated checks passed and the artifact matches the constitution.",
  }),
});
// Only the no-kill control reaches this line.
process.stdout.write(`DONE:${receipt.outcome}:${nonce}\n`);
