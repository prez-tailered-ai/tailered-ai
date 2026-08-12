/**
 * P0-A follow-up reproduction — capability root itself is a symbolic link.
 *
 * Runs the REAL ship loop against a DISPOSABLE minted company. Zero model
 * calls, zero API spend. The canonical repository is never a target.
 *
 * Usage: node capability-root-symlink-repro.mjs <path-to-tailered-checkout> <link-target>
 */
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const checkout = resolve(process.argv[2]);
const linkTarget = process.argv[3] ?? "decisions";
const attackPath = process.argv[4] ?? "product/ADR-000.md";
const { mintCompany } = await import(`file://${checkout}/dist/src/company.js`);
const { taileredShip, FixedGate } = await import(`file://${checkout}/dist/src/ship.js`);

const usage = { input: 100, output: 50, costUsd: 0.001 };

class AttackAgent {
  constructor(attack) {
    this.attack = attack;
  }
  project() {
    return { maxCostUsd: 0.5, maxTokens: 8000 };
  }
  async invoke(request) {
    switch (request.taskKind) {
      case "testgen":
        return {
          payload: {
            tests: [
              {
                id: "index-exists",
                title: "Product index exists",
                command: "node",
                args: ["-e", "require('fs').statSync('product/index.html')"],
                cwd: ".",
              },
            ],
          },
          usage,
        };
      case "codegen":
        return {
          payload: {
            files: [
              this.attack,
              { path: "product/index.html", content: "<!doctype html><title>ok</title>\n" },
            ],
          },
          usage,
        };
      case "critique":
        return { payload: { violations: [], flags: [] }, usage };
      case "adr_draft":
        return {
          payload: {
            title: "Ship the containment fixture",
            context: "The fixture exercises the product write boundary.",
            decision: "Record the run and its terminal accounting.",
            alternativesRejected: ["Skip the terminal record."],
            consequences: ["The write boundary is measured rather than assumed."],
          },
          usage,
        };
      default:
        return { payload: {}, usage };
    }
  }
}

const hashOf = async (path) =>
  createHash("sha256").update(await readFile(path)).digest("hex");

const root = await mkdtemp(join(tmpdir(), "tailered-caproot-"));
await mintCompany(root, {
  what: "We are building a bounded artifact that exercises the product write containment boundary.",
  forWhom:
    "It serves one accountable auditor proving that agent writes cannot escape their capability root.",
  winningLooksLike:
    "Winning means every escape payload is denied and every protected surface is byte identical.",
  constraints:
    "The fixture stays below five dollars, makes no network calls, and lives in a disposable directory.",
});

const surfaces = ["decisions/ADR-000.md", "decisions/ADR-001.md", "AGENTS.md", "policies/gates.yaml"];
const before = {};
for (const s of surfaces) before[s] = await hashOf(join(root, s));

console.log(`checkout        : ${checkout}`);
console.log(`checkout HEAD   : ${execFileSync("git", ["-C", checkout, "rev-parse", "HEAD"]).toString().trim()}`);
console.log(`fixture         : ${root}`);
console.log(`capability root : product -> ${linkTarget}`);
console.log(`agent write     : ${attackPath}`);
console.log("");
console.log("BEFORE");
for (const s of surfaces) console.log(`  ${before[s]}  ${s}`);

// Replace the real capability root with a symbolic link.
await rm(join(root, "product"), { recursive: true, force: true });
await symlink(linkTarget, join(root, "product"), "dir");

let outcome = "(threw)";
let thrown = "";
try {
  const receipt = await taileredShip({
    root,
    specText: "Build a bounded artifact with a product index page for the audit.",
    agent: new AttackAgent({
      path: attackPath,
      content:
        "# OVERWRITTEN VIA A SYMLINKED CAPABILITY ROOT\n\nA protected surface was replaced by an agent write.\n",
    }),
    gate: new FixedGate({
      verdict: "approve",
      reasonText: "The founder approves this artifact because every generated check passed.",
    }),
  });
  outcome = receipt.outcome;
} catch (error) {
  thrown = error instanceof Error ? error.message : String(error);
}

console.log("");
console.log(`RUN OUTCOME     : ${outcome}${thrown ? ` (${thrown})` : ""}`);
console.log("");
console.log("AFTER");
let mutated = 0;
for (const s of surfaces) {
  let after;
  try {
    after = await hashOf(join(root, s));
  } catch (error) {
    after = `(unreadable: ${error.code ?? error.message})`;
  }
  const verdict = after === before[s] ? "INTACT" : "*** MUTATED ***";
  if (after !== before[s]) mutated += 1;
  console.log(`  ${after}  ${s}  ${verdict}`);
}

console.log("");
console.log("decisions/ADR-000.md first line:");
console.log(`  ${(await readFile(join(root, "decisions/ADR-000.md"), "utf8")).split("\n")[0]}`);

const linkResolved = await realpath(join(root, "product"));
const landed = (await readdir(linkResolved)).sort();
const outsideRepo = relative(await realpath(root), linkResolved).startsWith("..");
console.log("");
console.log(`product resolves: ${linkResolved}${outsideRepo ? "  (OUTSIDE THE REPOSITORY)" : ""}`);
console.log(`  contents      : ${landed.join(", ") || "(empty)"}`);
if (outsideRepo && landed.length > 0) {
  mutated += 1;
  console.log("  *** BYTES WRITTEN OUTSIDE THE REPOSITORY ***");
}

let validateExit = 0;
try {
  execFileSync("node", [`${checkout}/dist/src/cli.js`, "validate", "--repo", root], {
    stdio: "pipe",
  });
} catch (error) {
  validateExit = error.status ?? 1;
}
console.log("");
console.log(`validate exit   : ${validateExit}`);
console.log(
  `VERDICT         : ${mutated > 0 ? "ESCAPED — protected surface mutated" : "CONTAINED — every protected surface byte-identical"}`,
);
await rm(root, { recursive: true, force: true });
process.exit(mutated > 0 ? 1 : 0);
