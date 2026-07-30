#!/usr/bin/env node
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { ProcessAgent } from "./agent.js";
import {
  mintCompany,
  validateWrittenProse,
  type CharterAnswers,
} from "./company.js";
import type { FileWrite, GateDecision, GateVerdict } from "./contracts.js";
import { renderDashboard } from "./dashboard.js";
import { TodoDemoAgent } from "./demo-agent.js";
import { ValidationError } from "./errors.js";
import { writeAtomic } from "./files.js";
import {
  assertGatingDefinitionOfDone,
  FixedGate,
  taileredShip,
  type HumanGate,
} from "./ship.js";
import { validateCompany } from "./validate.js";

const [, , command, ...argv] = process.argv;

try {
  switch (command) {
    case "init":
      await runInit(argv);
      break;
    case "ship":
      await runShip(argv);
      break;
    case "benchmark":
      await runBenchmark(argv);
      break;
    case "dashboard":
      await runDashboard(argv);
      break;
    case "validate":
      await runValidate(argv);
      break;
    case "demo":
      await runDemo(argv);
      break;
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      break;
    default:
      throw new ValidationError(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

async function runInit(args: string[]): Promise<void> {
  const target = resolve(requiredOption(args, "--target"));
  const answersPath = option(args, "--answers");
  const answers = answersPath
    ? parseCharterAnswers(
        JSON.parse(await readFile(resolve(answersPath), "utf8")) as unknown,
      )
    : await interview();
  const result = await mintCompany(target, answers);
  const report = await validateCompany(target);
  printJson({
    status: "VERIFIED",
    target,
    charterId: result.charter.id,
    mintAdrId: result.mintAdr.id,
    validation: report,
  });
}

async function runShip(args: string[]): Promise<void> {
  if (!args.includes("--allow-local-execution")) {
    throw new ValidationError(
      "Process-agent runs execute generated checks locally. Pass --allow-local-execution only inside an isolated worker.",
    );
  }
  const root = resolve(option(args, "--repo") ?? ".");
  const specText = await resolveSpecText(args);
  const agent = await ProcessAgent.fromFile(
    resolve(requiredOption(args, "--agent-config")),
  );
  const gate = await resolveGate(args);
  const receipt = await taileredShip({ root, specText, agent, gate });
  printJson({ status: receipt.outcome === "shipped" ? "VERIFIED" : "HALTED", receipt });
  if (receipt.outcome !== "shipped") {
    process.exitCode = 2;
  }
}

async function runBenchmark(args: string[]): Promise<void> {
  const name = requiredOption(args, "--name");
  if (name !== "todo-auth") {
    throw new ValidationError(`Unknown benchmark: ${name}`);
  }
  const benchmarkPath = resolve(
    import.meta.dirname,
    "../../benchmarks/todo-auth.json",
  );
  const benchmark = JSON.parse(await readFile(benchmarkPath, "utf8")) as {
    spec: string;
  };
  const forwarded = [
    ...args.filter((value, index) => {
      const previous = args[index - 1];
      return value !== "--name" && previous !== "--name";
    }),
    "--spec",
    benchmark.spec,
  ];
  await runShip(forwarded);
}

async function runDashboard(args: string[]): Promise<void> {
  const root = resolve(option(args, "--repo") ?? ".");
  const html = await renderDashboard(root);
  const outputPath = option(args, "--output");
  if (!outputPath) {
    process.stdout.write(html);
    return;
  }
  const resolvedOutput = resolve(outputPath);
  await writeAtomic(resolvedOutput, html);
  printJson({ status: "VERIFIED", output: resolvedOutput });
}

async function runValidate(args: string[]): Promise<void> {
  const root = resolve(option(args, "--repo") ?? ".");
  const report = await validateCompany(root);
  printJson({ status: "VERIFIED", root, ...report });
}

async function runDemo(args: string[]): Promise<void> {
  const targetOption = option(args, "--target");
  const target = targetOption
    ? resolve(targetOption)
    : await mkdtemp(join(tmpdir(), "tailered-v1-demo-"));
  await mintCompany(target, {
    what: "We are building a single-user todo application that proves the complete Tailered ship loop.",
    forWhom: "It serves one accountable founder evaluating whether the company-as-code loop works.",
    winningLooksLike: "Winning means a tested todo preview ships with linked decisions, labels, routes, and terminal accounting.",
    constraints: "The demonstration excludes authentication, stays below five dollars, and completes within ten minutes.",
  });
  const receipt = await taileredShip({
    root: target,
    specText:
      "Build a single-user todo app with create, complete, remove, and browser-local persistence. Authentication is not part of this gating demonstration.",
    agent: new TodoDemoAgent(),
    gate: new FixedGate({
      verdict: "approve",
      reasonText:
        "The deterministic demonstration may deploy when every generated check and constitutional critique passes.",
    }),
  });
  await assertGatingDefinitionOfDone(target, receipt);
  const dashboardPath = resolve(target, "dashboard.html");
  await writeAtomic(dashboardPath, await renderDashboard(target));
  printJson({
    status: "VERIFIED",
    target,
    receipt,
    dashboard: dashboardPath,
  });
}

async function interview(): Promise<CharterAnswers> {
  const readline = createInterface({ input, output });
  try {
    return {
      what: await askForProse(
        readline,
        "What are you building? Write one complete sentence: ",
        "what",
      ),
      forWhom: await askForProse(
        readline,
        "For whom are you building it? Write one complete sentence: ",
        "for whom",
      ),
      winningLooksLike: await askForProse(
        readline,
        "What does winning look like? Write one complete sentence: ",
        "winning looks like",
      ),
      constraints: await askForProse(
        readline,
        "What constraint must the company honor? Write one complete sentence: ",
        "constraints",
      ),
    };
  } finally {
    readline.close();
  }
}

async function askForProse(
  readline: ReturnType<typeof createInterface>,
  question: string,
  field: string,
): Promise<string> {
  for (;;) {
    const answer = await readline.question(question);
    try {
      validateWrittenProse(field, answer);
      return answer.trim();
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
    }
  }
}

async function resolveSpecText(args: string[]): Promise<string> {
  const direct = option(args, "--spec");
  const path = option(args, "--spec-file");
  if (direct && path) {
    throw new ValidationError("Use either --spec or --spec-file, not both.");
  }
  if (direct) {
    return direct;
  }
  if (path) {
    return (await readFile(resolve(path), "utf8")).trim();
  }
  throw new ValidationError("Ship requires --spec or --spec-file.");
}

async function resolveGate(args: string[]): Promise<HumanGate> {
  const verdict = option(args, "--verdict");
  if (!verdict) {
    return new InteractiveGate();
  }
  if (!isGateVerdict(verdict)) {
    throw new ValidationError(`Invalid gate verdict: ${verdict}`);
  }
  const reasonText = requiredOption(args, "--reason");
  const editPath = option(args, "--edits");
  const edits = editPath
    ? parseFileWrites(
        JSON.parse(await readFile(resolve(editPath), "utf8")) as unknown,
      )
    : undefined;
  return new FixedGate({
    verdict,
    reasonText,
    ...(edits ? { edits } : {}),
  });
}

class InteractiveGate implements HumanGate {
  async decide(inputValue: Parameters<HumanGate["decide"]>[0]): Promise<GateDecision> {
    printJson({
      artifactHash: inputValue.artifactHash,
      critique: inputValue.critique,
      accounting: inputValue.accounting,
    });
    const readline = createInterface({ input, output });
    try {
      const rawVerdict = await readline.question("Verdict (approve/reject): ");
      if (rawVerdict !== "approve" && rawVerdict !== "reject") {
        throw new ValidationError(
          "Interactive v1 accepts approve or reject. Use --verdict edit --edits <file> for exact edits.",
        );
      }
      const reasonText = await readline.question("Reason in prose: ");
      validateWrittenProse("gate reason", reasonText);
      return { verdict: rawVerdict, reasonText };
    } finally {
      readline.close();
    }
  }
}

function parseCharterAnswers(value: unknown): CharterAnswers {
  if (
    typeof value !== "object" ||
    value === null ||
    !("what" in value) ||
    typeof value.what !== "string" ||
    !("forWhom" in value) ||
    typeof value.forWhom !== "string" ||
    !("winningLooksLike" in value) ||
    typeof value.winningLooksLike !== "string" ||
    !("constraints" in value) ||
    typeof value.constraints !== "string"
  ) {
    throw new ValidationError("Charter answers JSON is invalid.");
  }
  return {
    what: value.what,
    forWhom: value.forWhom,
    winningLooksLike: value.winningLooksLike,
    constraints: value.constraints,
  };
}

function parseFileWrites(value: unknown): FileWrite[] {
  if (!Array.isArray(value)) {
    throw new ValidationError("Edits file must contain an array.");
  }
  return value.map((file, index) => {
    if (
      typeof file !== "object" ||
      file === null ||
      !("path" in file) ||
      typeof file.path !== "string" ||
      !("content" in file) ||
      typeof file.content !== "string"
    ) {
      throw new ValidationError(`Edit ${index + 1} is invalid.`);
    }
    return { path: file.path, content: file.content };
  });
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new ValidationError(`${name} requires a value.`);
  }
  return value;
}

function requiredOption(args: string[], name: string): string {
  const value = option(args, name);
  if (!value) {
    throw new ValidationError(`Missing required option: ${name}`);
  }
  return value;
}

function isGateVerdict(value: string): value is GateVerdict {
  return value === "approve" || value === "reject" || value === "edit";
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printHelp(): void {
  process.stdout.write(`Tailered AI v1

Usage:
  tailered init --target <dir> [--answers <charter.json>]
  tailered ship --repo <dir> (--spec <text> | --spec-file <file>)
                --agent-config <file> --allow-local-execution
  tailered benchmark --name todo-auth --repo <dir> --agent-config <file>
                     --allow-local-execution
  tailered dashboard --repo <dir> [--output <dashboard.html>]
  tailered validate --repo <dir>
  tailered demo [--target <empty-dir>]

Non-interactive gates:
  --verdict approve|reject --reason <prose>
  --verdict edit --reason <prose> --edits <file-writes.json>
`);
}
