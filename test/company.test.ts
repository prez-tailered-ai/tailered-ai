import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  appendAdr,
  mintCompany,
  readAdrs,
  validateWrittenProse,
  writeAdr,
} from "../src/company.js";
import { AppendOnlyViolationError, ValidationError } from "../src/errors.js";
import { validateCompany } from "../src/validate.js";

test("mint creates and validates the complete company repository", async () => {
  const root = await makeCompany();
  const report = await validateCompany(root);

  assert.deepEqual(report, {
    valid: true,
    decisions: 2,
    evals: 0,
    labels: 0,
    routes: 0,
  });
});

test("supersession appends a new ADR and derives old status at render time", async () => {
  const root = await makeCompany();
  const replacement = await appendAdr(root, {
    title: "Replace the minting decision",
    context: "The previous repository decision needs a typed replacement.",
    decision: "Supersede ADR-001 without editing its file.",
    alternatives_rejected: ["Modify ADR-001 in place."],
    consequences: ["Dashboard rendering derives the superseded status."],
    status: "accepted",
    caused_by: ["ADR-001"],
    supersedes: "ADR-001",
  });
  const adrs = await readAdrs(root);
  const old = adrs.find((adr) => adr.id === "ADR-001");
  const onDisk = await readFile(resolve(root, "decisions/ADR-001.md"), "utf8");

  assert.equal(replacement.id, "ADR-002");
  assert.equal(old?.status, "accepted");
  assert.equal(old?.rendered_status, "superseded");
  assert.match(onDisk, /"status":"accepted"/);
  await assert.rejects(
    writeAdr(root, {
      ...replacement,
      id: "ADR-001",
      supersedes: "ADR-000",
    }),
    AppendOnlyViolationError,
  );
});

test("charter interview refuses list fragments", () => {
  assert.throws(
    () => validateWrittenProse("what", "- Build a todo app"),
    ValidationError,
  );
  assert.throws(
    () => validateWrittenProse("what", "Build todo"),
    ValidationError,
  );
});

async function makeCompany(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tailered-company-test-"));
  await mintCompany(root, {
    what: "We are building a test company that proves the repository contract.",
    forWhom: "It serves one founder who needs measurable software delivery.",
    winningLooksLike: "Winning means every bounded run leaves complete linked records.",
    constraints: "The company must remain readable as plain files in Git.",
  });
  return root;
}
