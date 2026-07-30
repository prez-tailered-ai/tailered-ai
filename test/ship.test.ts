import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Agent } from "../src/agent.js";
import { mintCompany } from "../src/company.js";
import type {
  AgentProjection,
  AgentRequest,
  AgentResponse,
  GateDecision,
} from "../src/contracts.js";
import { TodoDemoAgent } from "../src/demo-agent.js";
import { ValidationError } from "../src/errors.js";
import { CompanyLedger } from "../src/ledger.js";
import {
  assertGatingDefinitionOfDone,
  FixedGate,
  taileredShip,
} from "../src/ship.js";
import { validateCompany } from "../src/validate.js";

test("gating demo ships with approve, zero edits, and complete accounting", async () => {
  const root = await makeCompany();
  const receipt = await taileredShip({
    root,
    specText: "Build the single-user todo gating demonstration.",
    agent: new TodoDemoAgent(),
    gate: new FixedGate({
      verdict: "approve",
      reasonText: "All generated checks passed and the artifact matches the company constitution.",
    }),
  });
  const ledger = new CompanyLedger(root);
  const [evals, labels, routes] = await Promise.all([
    ledger.evals(),
    ledger.labels(),
    ledger.routes(),
  ]);

  assert.equal(receipt.outcome, "shipped");
  assert.match(receipt.previewUrl ?? "", /^file:/u);
  assert.equal(evals.length, 1);
  assert.equal(evals[0]?.outcome, "shipped");
  assert.equal(evals[0]?.tests_passed.length, evals[0]?.tests_total);
  assert.equal(labels[0]?.verdict, "approve");
  assert.equal(labels[0]?.edit_diff, undefined);
  assert.ok(routes.length >= 4);
  assert.equal(routes[0]?.context.cache_hit, false);
  assert.ok(routes.some((row) => row.context.cache_hit));
  assert.ok(new Set(routes.map((row) => row.context.snapshot_ref)).size >= 2);
  const firstRoute = routes[0];
  assert.ok(firstRoute);
  const firstTrace = JSON.parse(
    await readFile(join(root, firstRoute.trace_ref), "utf8"),
  ) as {
    route_log_id: string;
    context_ref: string;
    payload: unknown;
  };
  assert.equal(firstTrace.route_log_id, firstRoute.id);
  assert.equal(firstTrace.context_ref, firstRoute.context.snapshot_ref);
  assert.ok(firstTrace.payload);
  assert.ok(receipt.costUsd < 5);
  await assertGatingDefinitionOfDone(root, receipt);
  await validateCompany(root);
});

test("attempt exhaustion writes one high-value terminal eval without a gate label", async () => {
  const root = await makeCompany();
  const receipt = await taileredShip({
    root,
    specText: "Exercise the bounded failure path.",
    agent: new ScenarioAgent("never-green"),
    gate: new FixedGate(approval()),
  });
  const ledger = new CompanyLedger(root);
  const [evals, labels, routes] = await Promise.all([
    ledger.evals(),
    ledger.labels(),
    ledger.routes(),
  ]);

  assert.equal(receipt.outcome, "halted_attempts");
  assert.equal(evals.length, 1);
  assert.equal(evals[0]?.outcome, "halted_attempts");
  assert.equal(evals[0]?.preview_url, undefined);
  assert.equal(evals[0]?.gate_label_id, undefined);
  assert.equal(labels.length, 0);
  assert.equal(
    routes.filter((row) => row.task_kind === "codegen").length,
    3,
  );
  assert.deepEqual(
    routes
      .filter((row) => row.task_kind === "codegen")
      .map((row) => row.tier),
    ["mid", "mid", "frontier"],
  );
  await validateCompany(root);
});

test("budget refusal happens before agent invocation and still writes a terminal eval", async () => {
  const root = await makeCompany();
  const agent = new ScenarioAgent("budget");
  const receipt = await taileredShip({
    root,
    specText: "Exercise the exclusive budget boundary.",
    agent,
    gate: new FixedGate(approval()),
  });
  const ledger = new CompanyLedger(root);

  assert.equal(receipt.outcome, "halted_budget");
  assert.equal(agent.invocations, 0);
  assert.equal((await ledger.evals()).length, 1);
  assert.equal((await ledger.labels()).length, 0);
  assert.equal(receipt.costUsd, 0);
  await validateCompany(root);
});

test("accounting violations preserve the measured call before halting", async () => {
  const root = await makeCompany();
  const receipt = await taileredShip({
    root,
    specText: "Exercise settlement above the agent's hard reservation ceiling.",
    agent: new ScenarioAgent("accounting"),
    gate: new FixedGate(approval()),
  });
  const ledger = new CompanyLedger(root);
  const routes = await ledger.routes();

  assert.equal(receipt.outcome, "halted_budget");
  assert.equal(routes.length, 1);
  assert.equal(routes[0]?.status, "accounting_violation");
  assert.equal(routes[0]?.cost_usd, 0.02);
  assert.match(receipt.blocker ?? "", /Accounting invariant failed/u);
  await validateCompany(root);
});

test("a repo registry string swap changes every runtime model request", async () => {
  const root = await makeCompany();
  const configPath = join(root, "tailered.config.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as {
    models: Record<"frontier" | "mid" | "cheap", string>;
  };
  config.models.frontier = "frontier-generation-next";
  config.models.mid = "mid-generation-next";
  config.models.cheap = "cheap-generation-next";
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  const agent = new ScenarioAgent("green");

  const receipt = await taileredShip({
    root,
    specText: "Prove that model identity is sourced from one repository registry.",
    agent,
    gate: new FixedGate(approval()),
    previewDeployer: async () => "file:///registry-swap-preview",
  });

  assert.equal(receipt.outcome, "shipped");
  assert.ok(agent.models.includes("mid-generation-next"));
  assert.ok(agent.models.includes("cheap-generation-next"));
  assert.ok(
    agent.models.every((model) =>
      ["mid-generation-next", "cheap-generation-next"].includes(model),
    ),
  );
  await validateCompany(root);
});

test("rejection captures both the preference label and terminal eval", async () => {
  const root = await makeCompany();
  const receipt = await taileredShip({
    root,
    specText: "Exercise the founder rejection path.",
    agent: new ScenarioAgent("green"),
    gate: new FixedGate({
      verdict: "reject",
      reasonText: "The artifact passes checks but does not express the intended product direction.",
    }),
  });
  const ledger = new CompanyLedger(root);
  const [evals, labels] = await Promise.all([ledger.evals(), ledger.labels()]);

  assert.equal(receipt.outcome, "rejected");
  assert.equal(evals[0]?.outcome, "rejected");
  assert.equal(evals[0]?.gate_label_id, labels[0]?.id);
  assert.equal(labels[0]?.verdict, "reject");
  assert.equal(evals[0]?.preview_url, undefined);
  await validateCompany(root);
});

test("edit is valid platform behavior but fails the gating DoD assertion", async () => {
  const root = await makeCompany();
  const receipt = await taileredShip({
    root,
    specText: "Exercise an exact human edit before deployment.",
    agent: new ScenarioAgent("green"),
    gate: new FixedGate({
      verdict: "edit",
      reasonText: "The founder supplied the final complete preview document before deployment.",
      edits: [
        {
          path: "product/index.html",
          content: "<!doctype html><title>Founder-edited product</title>\n",
        },
      ],
    }),
  });
  const ledger = new CompanyLedger(root);
  const label = (await ledger.labels())[0];

  assert.equal(receipt.outcome, "shipped");
  assert.equal(label?.verdict, "edit");
  assert.match(label?.edit_diff ?? "", /Founder-edited product/u);
  await assert.rejects(
    assertGatingDefinitionOfDone(root, receipt),
    ValidationError,
  );
  await validateCompany(root);
});

class ScenarioAgent implements Agent {
  invocations = 0;
  readonly models: string[] = [];

  constructor(
    readonly scenario: "never-green" | "budget" | "green" | "accounting",
  ) {}

  project(_request: AgentRequest): AgentProjection {
    if (this.scenario === "budget") {
      return { maxCostUsd: 5, maxTokens: 100 };
    }
    return { maxCostUsd: 0.01, maxTokens: 100 };
  }

  async invoke(request: AgentRequest): Promise<AgentResponse> {
    this.invocations += 1;
    this.models.push(request.model);
    let payload: unknown;
    switch (request.taskKind) {
      case "testgen":
        payload = {
          tests: [
            {
              id: "scenario-check",
              title: "Scenario check",
              command: process.execPath,
              args: [
                "-e",
                this.scenario === "never-green"
                  ? "process.exit(1)"
                  : "process.exit(0)",
              ],
            },
          ],
        };
        break;
      case "codegen":
        payload = { files: [] };
        break;
      case "critique":
        payload = { violations: [], flags: [] };
        break;
      case "adr_draft":
        payload = {
          title: "Record scenario run",
          context: "The scenario exercises a terminal ship-loop behavior.",
          decision: "Record the measured outcome in the append-only ledger.",
          alternativesRejected: ["Discard the scenario outcome."],
          consequences: ["The terminal behavior remains queryable."],
        };
        break;
      case "judge":
      case "narrate":
        payload = {};
        break;
    }
    return {
      payload,
      usage: {
        input: 5,
        output: 5,
        costUsd: this.scenario === "accounting" ? 0.02 : 0.001,
      },
    };
  }
}

function approval(): GateDecision {
  return {
    verdict: "approve",
    reasonText: "The scenario artifact may deploy after every generated check passes.",
  };
}

async function makeCompany(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tailered-ship-test-"));
  await mintCompany(root, {
    what: "We are building a company that exercises the bounded Tailered ship loop.",
    forWhom: "It serves one founder who requires linked evidence for every terminal outcome.",
    winningLooksLike: "Winning means shipped and halted runs both leave complete evaluation records.",
    constraints: "Every call stays below the exclusive budget and every check gets three attempts.",
  });
  return root;
}
