import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type {
  ADR,
  Charter,
  RenderedADR,
} from "./contracts.js";
import { DEFAULT_COMPANY_CONFIG } from "./config.js";
import {
  AppendOnlyViolationError,
  ValidationError,
} from "./errors.js";
import { isNodeError, writeNewFile } from "./files.js";

export interface CharterAnswers {
  what: string;
  forWhom: string;
  winningLooksLike: string;
  constraints: string;
}

const REQUIRED_DIRECTORIES = [
  "product",
  "decisions",
  "loops",
  "seats",
  "evals/runs",
  "labels",
  "policies",
] as const;

export async function mintCompany(
  root: string,
  answers: CharterAnswers,
): Promise<{ charter: Charter; mintAdr: ADR }> {
  validateCharterAnswers(answers);
  await assertEmptyTarget(root);

  for (const directory of REQUIRED_DIRECTORIES) {
    await mkdir(resolve(root, directory), { recursive: true });
  }

  const charter = createCharter(answers);
  const charterAdr: ADR = {
    id: "ADR-000",
    title: "Company charter",
    context: `Tailered requires written founder intent before implementation begins.\n\n${charter.prose}`,
    decision: `Build ${charter.what} for ${charter.for_whom}. Winning means ${charter.winning_looks_like}`,
    alternatives_rejected: [
      "Begin implementation without a written charter.",
      "Treat generated product code as the whole company.",
    ],
    consequences: [
      `The constitution and future decisions are checked against ADR-000.`,
      `The company operates within this constraint: ${charter.constraints}`,
    ],
    status: "accepted",
    caused_by: [],
  };
  await writeAdr(root, charterAdr);

  await writeNewFile(resolve(root, "AGENTS.md"), renderConstitution(charter));
  await writeNewFile(resolve(root, "loops/ship.yaml"), SHIP_LOOP_YAML);
  await writeNewFile(resolve(root, "seats/roster.yaml"), ROSTER_YAML);
  await writeNewFile(resolve(root, "policies/gates.yaml"), GATES_YAML);
  await writeNewFile(resolve(root, "tailered.config.json"), CONFIG_JSON);
  await writeNewFile(resolve(root, "evals/ledger.jsonl"), "");
  await writeNewFile(resolve(root, "evals/routes.jsonl"), "");
  await writeNewFile(resolve(root, "labels/ledger.jsonl"), "");
  await writeNewFile(resolve(root, "product/.gitkeep"), "");
  await writeNewFile(resolve(root, "evals/runs/.gitkeep"), "");

  const mintAdr: ADR = {
    id: "ADR-001",
    title: "Repository minted",
    context:
      "The charter is accepted and the company needs one versioned operating surface.",
    decision:
      "Mint the company as plain files with one bounded ship loop, a human deploy gate, linked ledgers, and a read-only dashboard.",
    alternatives_rejected: [
      "Store company state in a platform database.",
      "Add multiple loops before the ship loop proves the format.",
    ],
    consequences: [
      "Git history is the rollback mechanism.",
      "Every ship-loop attempt must end with exactly one terminal eval row.",
    ],
    status: "accepted",
    caused_by: ["ADR-000"],
  };
  await writeAdr(root, mintAdr);

  return { charter, mintAdr };
}

export function validateCharterAnswers(answers: CharterAnswers): void {
  const entries: Array<[string, string]> = [
    ["what", answers.what],
    ["for whom", answers.forWhom],
    ["winning looks like", answers.winningLooksLike],
    ["constraints", answers.constraints],
  ];
  for (const [field, value] of entries) {
    validateWrittenProse(field, value);
  }
}

export function validateWrittenProse(field: string, value: string): void {
  const trimmed = value.trim();
  const wordCount = trimmed.split(/\s+/u).filter(Boolean).length;
  if (/^(?:[-*+]|\d+[.)])\s/u.test(trimmed)) {
    throw new ValidationError(`${field} must be prose, not a list item.`);
  }
  if (wordCount < 6 || !/[.!?]["')\]]?$/u.test(trimmed)) {
    throw new ValidationError(
      `${field} must be a complete sentence of at least six words.`,
    );
  }
}

export function createCharter(answers: CharterAnswers): Charter {
  return {
    id: "ADR-000",
    what: answers.what.trim(),
    for_whom: answers.forWhom.trim(),
    winning_looks_like: answers.winningLooksLike.trim(),
    constraints: answers.constraints.trim(),
    prose: [
      answers.what.trim(),
      answers.forWhom.trim(),
      answers.winningLooksLike.trim(),
      answers.constraints.trim(),
    ].join("\n\n"),
  };
}

export async function writeAdr(root: string, adr: ADR): Promise<void> {
  validateAdr(adr);
  const path = resolve(root, "decisions", `${adr.id}.md`);
  try {
    await writeNewFile(path, renderAdr(adr));
  } catch (error) {
    if (isNodeError(error) && error.code === "EEXIST") {
      throw new AppendOnlyViolationError(
        `${adr.id} already exists. Accepted ADRs are never edited.`,
      );
    }
    throw error;
  }
}

export async function readAdrs(root: string): Promise<RenderedADR[]> {
  const directory = resolve(root, "decisions");
  const entries = (await readdir(directory))
    .filter((entry) => /^ADR-\d+\.md$/u.test(entry))
    .sort();
  const adrs = await Promise.all(
    entries.map(async (entry) =>
      parseAdr(await readFile(resolve(directory, entry), "utf8"), entry),
    ),
  );
  const superseded = new Set(
    adrs
      .map((adr) => adr.supersedes)
      .filter((id): id is string => id !== undefined),
  );

  return adrs.map((adr) => ({
    ...adr,
    rendered_status: superseded.has(adr.id) ? "superseded" : adr.status,
  }));
}

/**
 * The unlocked `nextAdrId`/`appendAdr` pair was REMOVED here (P0-B, Phase 1.3).
 * It derived the next ADR identifier from a directory listing, which is the same
 * read-then-write shape as the original ledger race. Runtime ADR creation now goes
 * through `CompanyLedger.transact` -> `LedgerTx.allocate({ ADR: 1 })` ->
 * `LedgerTx.appendReservedAdr`, under the repository lock. `writeAdr` remains for
 * minting, which writes fixed identifiers into a directory it just created.
 */
export function newRunId(date = new Date()): string {
  const timestamp = date.toISOString().replace(/[-:.TZ]/gu, "");
  return `RUN-${timestamp}-${randomUUID().slice(0, 8)}`;
}

/**
 * Exported for the lock-scoped ADR path in `src/ledger.ts`, which allocates the identifier
 * from the durable allocator instead of from a directory listing. Same rules, one
 * implementation — two copies of ADR validation would drift.
 */
export function validateAdrForWrite(adr: ADR): void {
  validateAdr(adr);
}

function validateAdr(adr: ADR): void {
  if (!/^ADR-\d{3,}$/u.test(adr.id)) {
    throw new ValidationError(`Invalid ADR id: ${adr.id}`);
  }
  if (adr.status !== "accepted" && adr.status !== "proposed") {
    throw new ValidationError(
      "On-disk ADR status must be proposed or accepted. Superseded is derived.",
    );
  }
  if (adr.id !== "ADR-000" && adr.caused_by.length === 0) {
    throw new ValidationError(`${adr.id} must carry at least one caused_by edge.`);
  }
  if (adr.supersedes && adr.supersedes === adr.id) {
    throw new ValidationError("An ADR cannot supersede itself.");
  }
}

export function renderAdr(adr: ADR): string {
  const metadata = JSON.stringify({
    id: adr.id,
    status: adr.status,
    caused_by: adr.caused_by,
    ...(adr.supersedes ? { supersedes: adr.supersedes } : {}),
  });
  return `<!-- tailered: ${metadata} -->
# ${adr.id}: ${adr.title}

## Context

${adr.context}

## Decision

${adr.decision}

## Alternatives rejected

${renderList(adr.alternatives_rejected)}

## Consequences

${renderList(adr.consequences)}
`;
}

function parseAdr(content: string, filename: string): ADR {
  const metadataMatch = /^<!-- tailered: (.+) -->$/mu.exec(content);
  const titleMatch = /^# (ADR-\d+): (.+)$/mu.exec(content);
  if (!metadataMatch?.[1] || !titleMatch?.[1] || !titleMatch[2]) {
    throw new ValidationError(`Malformed ADR metadata: ${filename}`);
  }

  const metadata = JSON.parse(metadataMatch[1]) as {
    id: string;
    status: "proposed" | "accepted";
    caused_by: string[];
    supersedes?: string;
  };
  const sections = splitAdrSections(content);
  return {
    id: metadata.id,
    title: titleMatch[2],
    context: sections.context,
    decision: sections.decision,
    alternatives_rejected: parseList(sections.alternatives),
    consequences: parseList(sections.consequences),
    status: metadata.status,
    caused_by: metadata.caused_by,
    ...(metadata.supersedes ? { supersedes: metadata.supersedes } : {}),
  };
}

function splitAdrSections(content: string): {
  context: string;
  decision: string;
  alternatives: string;
  consequences: string;
} {
  const match =
    /## Context\n\n([\s\S]*?)\n\n## Decision\n\n([\s\S]*?)\n\n## Alternatives rejected\n\n([\s\S]*?)\n\n## Consequences\n\n([\s\S]*?)\n?$/u.exec(
      content,
    );
  if (!match?.[1] || !match[2] || match[3] === undefined || match[4] === undefined) {
    throw new ValidationError("ADR sections are incomplete.");
  }
  return {
    context: match[1].trim(),
    decision: match[2].trim(),
    alternatives: match[3].trim(),
    consequences: match[4].trim(),
  };
}

function renderList(values: string[]): string {
  return values.map((value) => `- ${value}`).join("\n");
}

function parseList(value: string): string[] {
  if (value === "") {
    return [];
  }
  return value.split("\n").map((line) => line.replace(/^- /u, ""));
}

function renderConstitution(charter: Charter): string {
  return `# Company constitution

## Purpose

${charter.what}

## Accountable customer

${charter.for_whom}

## Definition of winning

${charter.winning_looks_like}

## Constraint

${charter.constraints}

## Operating law

- Humans own intent; machines own implementation.
- Every run writes exactly one terminal eval row.
- A gate label exists only when a human gate occurred.
- Reserve projected cost before every agent call; settle actual usage afterward.
- Total run cost must remain strictly below $5.00.
- Halt after three failed implementation attempts for any check.
- Critique against this constitution before the human deploy gate.
- Deployment requires an approve or edit verdict; rejection halts.
- Accepted decisions are append-only. Supersession creates a new ADR.
- Model identity comes only from tailered.config.json.
- Store each executed agent call and each distinct context snapshot for replay.
- Every persisted record carries caused_by links.
- Claims use VERIFIED, INFERRED, or UNKNOWN and include their evidence.
`;
}

async function assertEmptyTarget(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
  const entries = await readdir(root);
  if (entries.length > 0) {
    throw new ValidationError(
      `Mint target must be empty: ${basename(resolve(root))}`,
    );
  }
}

const SHIP_LOOP_YAML = `version: 1
name: ship
sequence:
  - capture_spec
  - generate_acceptance_tests
  - implement_until_green
  - constitutional_critique
  - human_deploy_gate
  - deploy_preview
  - append_adr
  - append_terminal_eval
bounds:
  max_attempts_per_check: 3
  max_cost_per_run_usd_exclusive: 5.00
terminal_outcomes:
  - shipped
  - halted_attempts
  - halted_budget
  - rejected
capture:
  spec: evals/runs/{run_id}/spec.json
  contexts: evals/runs/{run_id}/contexts/{repo_hash}.json
  calls: evals/runs/{run_id}/calls/{call_id}.json
  routes: evals/routes.jsonl
  gate_labels: labels/ledger.jsonl
  terminal_evals: evals/ledger.jsonl
`;

const ROSTER_YAML = `version: 1
seats:
  founder:
    kind: human
    accountable_for: intent_and_irreversible_actions
  builder:
    kind: agent
    model_registry: tailered.config.json
    accountable_for: implementation_and_self_critique
`;

const GATES_YAML = `version: 1
gates:
  deploy:
    actor: founder
    required: true
    verdicts:
      - approve
      - reject
      - edit
    capture_label: true
`;

const CONFIG_JSON = `${JSON.stringify(DEFAULT_COMPANY_CONFIG, null, 2)}\n`;
