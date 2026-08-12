import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Agent } from "../src/agent.js";
import { mintCompany } from "../src/company.js";
import type {
  AgentProjection,
  AgentRequest,
  AgentResponse,
  FileWrite,
} from "../src/contracts.js";
import { FixedGate, taileredShip } from "../src/ship.js";

/**
 * P0-A — agent write containment.
 *
 * Invariant under test: an agent or human gate granted authority to write
 * `product/` may mutate only the canonical filesystem subtree belonging to
 * `product/`. No lexical traversal, symlink, canonical-path redirection, or
 * malformed path may cause a write outside that capability root.
 *
 * Each escape class is a separate test so a future regression names its exact
 * mechanism. Every test asserts protected-surface hashes are byte-identical,
 * not merely that "an error occurred".
 */

const REASON =
  "The founder approves this artifact because every generated check passed.";

// --- helpers ---------------------------------------------------------------

async function makeCompany(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tailered-containment-"));
  await mintCompany(root, {
    what: "We are building a bounded artifact that exercises the product write containment boundary.",
    forWhom:
      "It serves one accountable auditor proving that agent writes cannot escape their capability root.",
    winningLooksLike:
      "Winning means every escape payload is denied and every protected surface is byte identical.",
    constraints:
      "The fixture stays below five dollars, makes no network calls, and lives in a disposable directory.",
  });
  return root;
}

async function hashOf(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

interface ProtectedSnapshot {
  charter: string;
  mintAdr: string;
  constitution: string;
  gates: string;
}

async function snapshotProtected(root: string): Promise<ProtectedSnapshot> {
  return {
    charter: await hashOf(join(root, "decisions/ADR-000.md")),
    mintAdr: await hashOf(join(root, "decisions/ADR-001.md")),
    constitution: await hashOf(join(root, "AGENTS.md")),
    gates: await hashOf(join(root, "policies/gates.yaml")),
  };
}

/**
 * Asserts that every pre-existing accepted decision and governing surface is
 * byte-identical. A run may legitimately APPEND a new terminal ADR; it may
 * never modify one that already existed.
 */
async function assertProtectedIntact(
  root: string,
  before: ProtectedSnapshot,
): Promise<void> {
  const after = await snapshotProtected(root);
  assert.equal(after.charter, before.charter, "ADR-000 was modified");
  assert.equal(after.mintAdr, before.mintAdr, "ADR-001 was modified");
  assert.equal(after.constitution, before.constitution, "AGENTS.md was modified");
  assert.equal(after.gates, before.gates, "policies/gates.yaml was modified");
}

/** Deterministic agent that returns one attack payload plus a legitimate write. */
class EscapeAgent implements Agent {
  constructor(private readonly attack: FileWrite) {}

  project(): AgentProjection {
    return { maxCostUsd: 0.5, maxTokens: 8000 };
  }

  async invoke(request: AgentRequest): Promise<AgentResponse> {
    const usage = { input: 100, output: 50, costUsd: 0.001 };
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
              {
                path: "product/index.html",
                content: "<!doctype html><title>ok</title>\n",
              },
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

/** Runs one escape payload through the agent codegen path. */
async function attemptAgentEscape(
  root: string,
  attack: FileWrite,
): Promise<string> {
  const receipt = await taileredShip({
    root,
    specText: "Build a bounded artifact with a product index page for the audit.",
    agent: new EscapeAgent(attack),
    gate: new FixedGate({ verdict: "approve", reasonText: REASON }),
  });
  return receipt.outcome;
}

// --- escape classes --------------------------------------------------------

test("containment: legitimate product write still succeeds", async () => {
  const root = await makeCompany();
  const before = await snapshotProtected(root);
  const outcome = await attemptAgentEscape(root, {
    path: "product/about.html",
    content: "<!doctype html><title>about</title>\n",
  });
  assert.equal(outcome, "shipped");
  await assertProtectedIntact(root, before);
  assert.equal(
    await readFile(join(root, "product/about.html"), "utf8"),
    "<!doctype html><title>about</title>\n",
  );
});

test("containment: nested legitimate product subdirectory write still succeeds", async () => {
  const root = await makeCompany();
  const before = await snapshotProtected(root);
  const outcome = await attemptAgentEscape(root, {
    path: "product/assets/deep/style.css",
    content: "body{}\n",
  });
  assert.equal(outcome, "shipped");
  await assertProtectedIntact(root, before);
  assert.equal(await readFile(join(root, "product/assets/deep/style.css"), "utf8"), "body{}\n");
});

test("containment: direct write to a protected path is denied", async () => {
  const root = await makeCompany();
  const before = await snapshotProtected(root);
  const outcome = await attemptAgentEscape(root, {
    path: "decisions/ADR-000.md",
    content: "OVERWRITTEN\n",
  });
  assert.notEqual(outcome, "shipped");
  await assertProtectedIntact(root, before);
});

test("containment: in-repository traversal out of product/ is denied", async () => {
  const root = await makeCompany();
  const before = await snapshotProtected(root);
  const outcome = await attemptAgentEscape(root, {
    path: "product/../decisions/ADR-000.md",
    content: "OVERWRITTEN\n",
  });
  assert.notEqual(outcome, "shipped");
  await assertProtectedIntact(root, before);
});

test("containment: nested traversal out of product/ is denied", async () => {
  const root = await makeCompany();
  const before = await snapshotProtected(root);
  const outcome = await attemptAgentEscape(root, {
    path: "product/a/../../decisions/ADR-000.md",
    content: "OVERWRITTEN\n",
  });
  assert.notEqual(outcome, "shipped");
  await assertProtectedIntact(root, before);
});

test("containment: traversal onto the constitution is denied", async () => {
  const root = await makeCompany();
  const before = await snapshotProtected(root);
  const outcome = await attemptAgentEscape(root, {
    path: "product/../AGENTS.md",
    content: "OVERWRITTEN\n",
  });
  assert.notEqual(outcome, "shipped");
  await assertProtectedIntact(root, before);
});

test("containment: escape beyond the repository root is denied", async () => {
  const root = await makeCompany();
  const before = await snapshotProtected(root);
  const outcome = await attemptAgentEscape(root, {
    path: "product/../../../tmp/tailered-p0a-escape",
    content: "escaped\n",
  });
  assert.notEqual(outcome, "shipped");
  await assertProtectedIntact(root, before);
});

test("containment: absolute path is denied", async () => {
  const root = await makeCompany();
  const before = await snapshotProtected(root);
  const outcome = await attemptAgentEscape(root, {
    path: join(tmpdir(), "tailered-p0a-absolute"),
    content: "escaped\n",
  });
  assert.notEqual(outcome, "shipped");
  await assertProtectedIntact(root, before);
});

test("containment: NUL-containing path is denied", async () => {
  const root = await makeCompany();
  const before = await snapshotProtected(root);
  const outcome = await attemptAgentEscape(root, {
    path: "product/evil\u0000.html",
    content: "escaped\n",
  });
  assert.notEqual(outcome, "shipped");
  await assertProtectedIntact(root, before);
});

test("containment: symlinked directory inside product/ cannot redirect a write", async () => {
  const root = await makeCompany();
  await symlink("../decisions", join(root, "product/link"), "dir");
  const before = await snapshotProtected(root);
  const outcome = await attemptAgentEscape(root, {
    path: "product/link/ADR-000.md",
    content: "OVERWRITTEN\n",
  });
  assert.notEqual(outcome, "shipped");
  await assertProtectedIntact(root, before);
});

test("containment: symlink to the repository root cannot expose the constitution", async () => {
  const root = await makeCompany();
  await symlink("..", join(root, "product/root"), "dir");
  const before = await snapshotProtected(root);
  const outcome = await attemptAgentEscape(root, {
    path: "product/root/AGENTS.md",
    content: "OVERWRITTEN\n",
  });
  assert.notEqual(outcome, "shipped");
  await assertProtectedIntact(root, before);
});

test("containment: writing through an existing symlink leaf is denied fail-closed", async () => {
  const root = await makeCompany();
  await symlink("../AGENTS.md", join(root, "product/pointer.html"));
  const before = await snapshotProtected(root);
  const outcome = await attemptAgentEscape(root, {
    path: "product/pointer.html",
    content: "OVERWRITTEN\n",
  });
  assert.notEqual(outcome, "shipped");
  await assertProtectedIntact(root, before);
});

test("containment: the capability root itself cannot be overwritten as a file", async () => {
  const root = await makeCompany();
  const before = await snapshotProtected(root);
  const outcome = await attemptAgentEscape(root, {
    path: "product",
    content: "OVERWRITTEN\n",
  });
  assert.notEqual(outcome, "shipped");
  await assertProtectedIntact(root, before);
});

test("containment: the founder gate edit path shares the same boundary", async () => {
  const root = await makeCompany();
  const before = await snapshotProtected(root);
  const receipt = await taileredShip({
    root,
    specText: "Build a bounded artifact with a product index page for the audit.",
    agent: new EscapeAgent({
      path: "product/index.html",
      content: "<!doctype html><title>ok</title>\n",
    }),
    gate: new FixedGate({
      verdict: "edit",
      reasonText:
        "The founder edits this artifact because the gate path must share the same boundary.",
      edits: [
        { path: "product/../decisions/ADR-000.md", content: "EDITED BY GATE\n" },
      ],
    }),
  });
  assert.notEqual(receipt.outcome, "shipped");
  await assertProtectedIntact(root, before);
});

test("containment: a denied escape still writes exactly one terminal eval", async () => {
  const root = await makeCompany();
  await attemptAgentEscape(root, {
    path: "product/../decisions/ADR-000.md",
    content: "OVERWRITTEN\n",
  });
  const rows = (await readFile(join(root, "evals/ledger.jsonl"), "utf8"))
    .split("\n")
    .filter((line) => line.trim() !== "");
  assert.equal(rows.length, 1, "a halted run must still append exactly one terminal eval");
});

void writeFile;
