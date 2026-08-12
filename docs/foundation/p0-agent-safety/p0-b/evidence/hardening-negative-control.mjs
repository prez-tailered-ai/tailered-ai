#!/usr/bin/env node
/**
 * hardening-negative-control.mjs — prove the hardening tests can fail.
 *
 * A test that passes against hardened code is not evidence. It is evidence only if it fails
 * when the hardening is removed. This harness copies the tree, reverts exactly ONE hardening
 * property per variant, runs the suite, and records which tests died.
 *
 * A mutation whose anchor text is not found is reported INVALID and never counted as a result.
 * That guard exists because a silently ineffective mutation produces a green run that looks
 * exactly like a mutation the tests failed to catch — the same false-success shape this whole
 * scope is about.
 *
 * Zero dependencies. Node built-ins only.
 */

import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO = process.argv[2];
const WORKROOT = process.argv[3];
const OUT = process.argv[4];
if (!REPO || !WORKROOT || !OUT) {
  process.stderr.write("usage: hardening-negative-control.mjs <repo> <workroot> <out.json>\n");
  process.exit(64);
}

/**
 * Each variant reverts one hardening property to its pre-hardening behaviour and names the
 * tests that must die as a result. `expect` is matched against the test titles node reports as
 * failing.
 */
const VARIANTS = [
  {
    // Control. No mutation. This MUST compile and MUST pass, or every other verdict in this
    // run is environment noise rather than evidence. The first version of this harness had no
    // control and reported all seven properties "caught at compile" — which was really `npx
    // tsc` hitting a placeholder package because node_modules had not been copied.
    id: "MUT-000-baseline-unmutated",
    property: "control: the unmutated tree compiles and every hardening test passes",
    file: "src/lock.ts",
    find: null,
    replace: null,
    expect: [],
    isControl: true,
  },
  {
    id: "MUT-A1-swallow-release-failure",
    property: "A: a failed release must fail the operation",
    file: "src/lock.ts",
    // Faithful revert: raise the work error only, and drop the release failure on the floor.
    // An `if (false && ...)` short-circuit would have been rejected by the compiler for
    // breaking null narrowing, which reads as "the property is load-bearing" when it only
    // means the mutation was written badly.
    find: `  if (workFailure !== null && releaseFailure !== null) {
    throw new AggregateError(
      [workFailure.error, releaseFailure.error],
      \`The locked operation "\${handle.owner.operation}" failed, and releasing the repository \` +
        \`lock afterwards also failed. Both errors are attached. The repository may still be \` +
        \`locked; see \${INCIDENTS_RELATIVE_PATH}.\`,
    );
  }
  if (workFailure !== null) throw workFailure.error;
  if (releaseFailure !== null) throw releaseFailure.error;
  return result as T;`,
    replace: `  // PRE-HARDENING: only the work error was raised; release failures were swallowed.
  if (workFailure !== null) throw workFailure.error;
  void releaseFailure;
  return result as T;`,
    expect: [
      "successful work plus a FAILED release fails the whole operation",
      "failed work plus a failed release retains BOTH errors",
    ],
  },
  {
    id: "MUT-A2-release-without-ownership-proof",
    property: "A: release requires readable owner metadata and an exact token match",
    file: "src/lock.ts",
    find: `export async function releaseCompanyLock(handle: LockHandle): Promise<void> {
  await assertLockHeld(handle);`,
    replace: `export async function releaseCompanyLock(handle: LockHandle): Promise<void> {
  // PRE-HARDENING: unreadable or missing owner metadata was not an error.
  const current = await readOwner(handle.path);
  if (current.kind === "owner" && current.owner.token !== handle.owner.token) {
    throw new LockOwnershipError("held by another process");
  }`,
    expect: [
      "releasing when the owner file is MISSING is refused",
      "releasing when the owner file is MALFORMED is refused",
      "successful work plus a FAILED release fails the whole operation",
      "failed work plus a failed release retains BOTH errors",
      "a release failure is recorded as a durable integrity incident",
      "an incident distinguishes a failed release from a failed operation",
    ],
  },
  {
    id: "MUT-B1-allocator-state-fails-open",
    property: "B: unreadable or malformed allocator state must fail closed",
    file: "src/sequence.ts",
    find: `async function loadSequenceState(root: string): Promise<SequenceState | null> {
  let raw: string;`,
    replace: `async function loadSequenceState(root: string): Promise<SequenceState | null> {
  try {
    return await loadSequenceStateStrict(root);
  } catch {
    // PRE-HARDENING: every read or parse failure silently became an empty allocator.
    return null;
  }
}

async function loadSequenceStateStrict(root: string): Promise<SequenceState | null> {
  let raw: string;`,
    // "an unreadable bootstrap marker is refused" is deliberately NOT listed here. That test
    // exercises loadBootstrapRecord, a different function, and the first run of this harness
    // proved it by reporting PARTIALLY_CAUGHT. The marker's own fail-closed behaviour gets its
    // own mutation below rather than being credited to this one.
    expect: [
      "malformed sequence JSON is refused",
      "an unreadable sequence file is refused",
      "a schema-version mismatch is refused",
      "an impossible counter is refused",
    ],
  },
  {
    id: "MUT-B4-bootstrap-marker-fails-open",
    property: "B: an unreadable bootstrap marker must fail closed",
    file: "src/sequence.ts",
    find: `async function loadBootstrapRecord(root: string): Promise<SequenceBootstrapRecord | null> {
  let raw: string;`,
    replace: `async function loadBootstrapRecord(root: string): Promise<SequenceBootstrapRecord | null> {
  try {
    return await loadBootstrapRecordStrict(root);
  } catch {
    // PRE-HARDENING: an unreadable marker was indistinguishable from "never bootstrapped".
    return null;
  }
}

async function loadBootstrapRecordStrict(
  root: string,
): Promise<SequenceBootstrapRecord | null> {
  let raw: string;`,
    expect: ["an unreadable bootstrap marker is refused"],
  },
  {
    id: "MUT-B2-adr-read-failure-becomes-empty",
    property: "B: an ADR read failure must propagate, never become an empty ADR set",
    file: "src/sequence.ts",
    find: `  return readAdrs(root);`,
    replace: `  return readAdrs(root).catch(() => []); // PRE-HARDENING`,
    expect: ["a malformed ADR is refused rather than read as an empty ADR set"],
  },
  {
    id: "MUT-B3-silent-rebuild-after-state-loss",
    property: "B: allocator state lost after bootstrap must be an integrity failure",
    file: "src/sequence.ts",
    find: `  const bootstrap = await loadBootstrapRecord(root);
  if (bootstrap !== null) {
    throw new SequenceStateError(
      \`\${SEQUENCE_RELATIVE_PATH} is missing, but this repository bootstrapped its allocator \` +
        \`at \${bootstrap.bootstrapped_at}. Allocator state has been lost. Refusing to rebuild \` +
        \`it automatically, because a rebuild can reissue an identifier that an in-flight run \` +
        \`already holds. Run \\\`tailered recover\\\` to repair this deliberately.\`,
      "missing_after_bootstrap",
    );
  }`,
    replace: `  const bootstrap = await loadBootstrapRecord(root);
  void bootstrap; // PRE-HARDENING: state loss triggered a silent rebuild every time.`,
    expect: ["state lost AFTER bootstrap is an integrity failure"],
  },
  {
    id: "MUT-C1-allocation-without-lock-proof",
    property: "C: allocation must prove the lock is still held",
    file: "src/sequence.ts",
    find: `  await assertLockHeld(handle);
  const root = handle.root;`,
    replace: `  // PRE-HARDENING: a comment asserted the caller held the lock; nothing checked it.
  const root = handle.root;`,
    // Dropping the only call site leaves the import unused, which `noUnusedLocals` rejects.
    // The import goes too, so the variant compiles and the TESTS do the catching.
    also: {
      find: `import { assertLockHeld, type LockHandle } from "./lock.js";`,
      replace: `import { type LockHandle } from "./lock.js";`,
    },
    expect: [
      "a handle whose lock was released cannot allocate",
      "a forged handle for a lock that was never taken cannot allocate",
    ],
  },
  {
    id: "MUT-D1-route-and-call-counters-diverge",
    property: "D: one reservation covers both halves of the ROUTE/CALL pair",
    file: "src/sequence.ts",
    find: `      ...routes.map((r) => parseSequenceNumber(r.call_id, "CALL")),`,
    replace: `      // PRE-HARDENING: CALL numbers were tracked by a separate counter.`,
    expect: ["legacy rows whose ROUTE and CALL numbers disagree resolve to the higher"],
  },
];

const TEST_FILES = ["dist/test/lock.test.js", "dist/test/sequence.test.js"];

function applyMutation(tree, variant) {
  if (variant.isControl) return { applied: true };
  const path = resolve(tree, variant.file);
  let source = readFileSync(path, "utf8");
  const edits = [{ find: variant.find, replace: variant.replace }];
  if (variant.also) edits.push(variant.also);

  for (const edit of edits) {
    const occurrences = source.split(edit.find).length - 1;
    if (occurrences !== 1) {
      return { applied: false, reason: `anchor matched ${occurrences} times, expected exactly 1` };
    }
    source = source.replace(edit.find, edit.replace);
  }
  writeFileSync(path, source);
  return { applied: true };
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    spawnError: result.error ? String(result.error) : null,
  };
}

function failingTitles(stdout) {
  // node --test prints "✖ <title> (Nms)" for each failure.
  return [...stdout.matchAll(/^✖ (.+?) \(\d/gmu)].map((match) => match[1]);
}

mkdirSync(WORKROOT, { recursive: true });
const results = [];

for (const variant of VARIANTS) {
  const tree = resolve(WORKROOT, variant.id);
  rmSync(tree, { recursive: true, force: true });
  // node_modules is copied too. Without it `npx tsc` resolves to the placeholder `tsc` package
  // on the public registry, every variant "fails to compile" for reasons that have nothing to
  // do with the mutation, and the harness reports a uniform verdict that looks like a result.
  for (const entry of ["src", "test", "package.json", "tsconfig.json", "node_modules"]) {
    cpSync(resolve(REPO, entry), resolve(tree, entry), { recursive: true });
  }

  const mutation = applyMutation(tree, variant);
  if (!mutation.applied) {
    results.push({
      id: variant.id,
      property: variant.property,
      verdict: "INVALID",
      detail: `mutation did not apply: ${mutation.reason}`,
      expected_failures: variant.expect,
      observed_failures: [],
    });
    process.stdout.write(`${variant.id}: INVALID (${mutation.reason})\n`);
    continue;
  }

  const build = run("node_modules/.bin/tsc", ["-p", "tsconfig.json"], tree);
  if (build.status !== 0) {
    // A mutation that will not compile still proves the property is load-bearing, but it is a
    // weaker result than a compiled run whose tests fail, and it is labelled as such.
    results.push({
      id: variant.id,
      property: variant.property,
      verdict: "CAUGHT_AT_COMPILE",
      detail: "the reverted code does not typecheck",
      expected_failures: variant.expect,
      observed_failures: [],
      compiler_output: build.stdout.slice(0, 4000),
    });
    process.stdout.write(`${variant.id}: CAUGHT_AT_COMPILE\n`);
    continue;
  }

  const tested = run("node", ["--test", ...TEST_FILES], tree);
  const observed = failingTitles(tested.stdout);
  const matched = variant.expect.filter((needle) =>
    observed.some((title) => title.includes(needle)),
  );
  const missed = variant.expect.filter((needle) => !matched.includes(needle));

  const verdict = variant.isControl
    ? tested.status === 0
      ? "CONTROL_HEALTHY"
      : "CONTROL_BROKEN"
    : tested.status === 0
      ? "NOT_CAUGHT"
      : missed.length === 0
        ? "CAUGHT"
        : "PARTIALLY_CAUGHT";

  results.push({
    id: variant.id,
    property: variant.property,
    verdict,
    test_exit_code: tested.status,
    test_signal: tested.signal,
    expected_failures: variant.expect,
    observed_failures: observed,
    expected_but_passing: missed,
  });
  process.stdout.write(
    `${variant.id}: ${verdict} (exit ${tested.status}, ${observed.length} test failures)\n`,
  );
}

const mutants = results.filter((r) => r.id !== "MUT-000-baseline-unmutated");
const control = results.find((r) => r.id === "MUT-000-baseline-unmutated");
const controlHealthy = control?.verdict === "CONTROL_HEALTHY";

const summary = {
  generated_by: "docs/foundation/p0-agent-safety/p0-b/evidence/hardening-negative-control.mjs",
  control_verdict: control?.verdict ?? "MISSING",
  control_healthy: controlHealthy,
  control_note:
    "Every mutant verdict below is meaningful ONLY if the control compiled and passed. An " +
    "unhealthy control means the harness measured its own environment, not the code.",
  mutants: mutants.length,
  caught: mutants.filter((r) => r.verdict === "CAUGHT").length,
  caught_at_compile: mutants.filter((r) => r.verdict === "CAUGHT_AT_COMPILE").length,
  partially_caught: mutants.filter((r) => r.verdict === "PARTIALLY_CAUGHT").length,
  not_caught: mutants.filter((r) => r.verdict === "NOT_CAUGHT").length,
  invalid: mutants.filter((r) => r.verdict === "INVALID").length,
  every_property_is_load_bearing:
    controlHealthy &&
    mutants.every((r) => r.verdict === "CAUGHT" || r.verdict === "CAUGHT_AT_COMPILE"),
  results,
};

writeFileSync(OUT, `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(
  `\ncontrol ${summary.control_verdict}; ${summary.caught} caught, ` +
    `${summary.caught_at_compile} caught at compile, ${summary.partially_caught} partial, ` +
    `${summary.not_caught} NOT caught, ${summary.invalid} invalid\n`,
);

// A property nobody's test can kill is not proven, and no verdict counts without a healthy
// control. Fail loudly rather than exiting zero on an experiment that measured nothing.
process.exit(summary.every_property_is_load_bearing ? 0 : 1);
