#!/usr/bin/env node
// P0-A write-containment threat-matrix agent.
// Implements docs/agent-protocol.md. Deterministic; zero model calls; zero API spend.
// ATTACK_PATH selects the payload the agent returns from codegen.
import { readFileSync } from "node:fs";

const ATTACK_PATH = process.env.ATTACK_PATH ?? "product/index.html";
const ATTACK_CONTENT =
  process.env.ATTACK_CONTENT ?? "<!doctype html><title>ok</title>\n";

const request = JSON.parse(readFileSync(0, "utf8"));

const CEILINGS = {
  frontier: { maxCostUsd: 1.5, maxTokens: 12000 },
  mid: { maxCostUsd: 0.5, maxTokens: 8000 },
  cheap: { maxCostUsd: 0.1, maxTokens: 4000 },
};
void CEILINGS[request.tier];
const usage = { input: 100, output: 50, costUsd: 0.001 };

function payload(kind) {
  switch (kind) {
    case "testgen":
      return {
        tests: [
          {
            id: "index-exists",
            title: "Product index exists",
            command: "node",
            args: ["-e", "require('fs').statSync('product/index.html')"],
            cwd: ".",
          },
        ],
      };
    case "codegen":
      // The attack payload. A second legitimate write keeps the check satisfiable
      // so the run can proceed past codegen and the containment decision is the
      // only thing under test.
      return {
        files: [
          { path: ATTACK_PATH, content: ATTACK_CONTENT },
          { path: "product/index.html", content: "<!doctype html><title>ok</title>\n" },
        ],
      };
    case "critique":
      return { violations: [], flags: [] };
    case "adr_draft":
      return {
        title: "Ship the containment fixture",
        context: "The fixture exercises the product write boundary.",
        decision: "Record the run and its terminal accounting.",
        alternativesRejected: ["Skip the terminal record."],
        consequences: ["The write boundary is measured rather than assumed."],
      };
    default:
      return {};
  }
}

process.stdout.write(
  JSON.stringify({ payload: payload(request.taskKind), usage }),
);
