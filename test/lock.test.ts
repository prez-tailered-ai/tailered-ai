import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { hostname } from "node:os";

import {
  LOCK_RELATIVE_PATH,
  LockOwnershipError,
  LockTimeoutError,
  acquireCompanyLock,
  inspectCompanyLock,
  lockPathFor,
  releaseCompanyLock,
  withCompanyLock,
} from "../src/lock.js";
import {
  SEQUENCE_RELATIVE_PATH,
  allocateIdentifiers,
  deriveCanonicalMaxima,
  inspectSequence,
} from "../src/sequence.js";

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "p0b-lock-"));
  await mkdir(join(root, "evals"), { recursive: true });
  await mkdir(join(root, "labels"), { recursive: true });
  await mkdir(join(root, "decisions"), { recursive: true });
  await writeFile(join(root, "evals/routes.jsonl"), "");
  await writeFile(join(root, "evals/ledger.jsonl"), "");
  await writeFile(join(root, "labels/ledger.jsonl"), "");
  return root;
}

// ---------------------------------------------------------------- lock ------

test("lock: exactly one caller acquires; the second is refused while it is held", async () => {
  const root = await fixture();
  const first = await acquireCompanyLock(root, { operation: "test" });
  await assert.rejects(
    () => acquireCompanyLock(root, { timeoutMs: 120, pollMs: 10 }),
    LockTimeoutError,
    "a second acquisition must not succeed while the first holds the lock",
  );
  await releaseCompanyLock(first);
  const second = await acquireCompanyLock(root, { timeoutMs: 500 });
  await releaseCompanyLock(second);
  await rm(root, { recursive: true, force: true });
});

test("lock: the timeout error names the current holder rather than failing blankly", async () => {
  const root = await fixture();
  const held = await acquireCompanyLock(root, { operation: "finalize", runId: "RUN-X" });
  await assert.rejects(
    () => acquireCompanyLock(root, { timeoutMs: 100, pollMs: 10 }),
    (error: unknown) => {
      assert.ok(error instanceof LockTimeoutError);
      assert.equal(error.holder?.pid, process.pid);
      assert.equal(error.holder?.operation, "finalize");
      assert.equal(error.holder?.run_id, "RUN-X");
      assert.match(error.message, /finalize/u);
      return true;
    },
  );
  await releaseCompanyLock(held);
  await rm(root, { recursive: true, force: true });
});

test("lock: a dead same-host owner is reclaimed", async () => {
  const root = await fixture();
  const lockPath = lockPathFor(root);
  await mkdir(lockPath, { recursive: true });
  // A pid that cannot be running. Same host, provably dead.
  await writeFile(
    join(lockPath, "owner.json"),
    JSON.stringify({
      schema_version: 1,
      token: "stale",
      pid: 2147483646,
      host: hostname(),
      acquired_at: new Date(Date.now() - 3_600_000).toISOString(),
      deadline_at: new Date(Date.now() - 3_500_000).toISOString(),
      operation: "abandoned",
      run_id: null,
    }),
  );
  const handle = await acquireCompanyLock(root, { timeoutMs: 2000 });
  assert.equal(handle.owner.pid, process.pid, "the reclaiming process must become the owner");
  await releaseCompanyLock(handle);
  await rm(root, { recursive: true, force: true });
});

test("lock: a LIVE same-host owner is never stolen, even past its lease", async () => {
  const root = await fixture();
  const lockPath = lockPathFor(root);
  await mkdir(lockPath, { recursive: true });
  await writeFile(
    join(lockPath, "owner.json"),
    JSON.stringify({
      schema_version: 1,
      token: "live",
      pid: process.pid, // demonstrably alive
      host: hostname(),
      acquired_at: new Date(Date.now() - 3_600_000).toISOString(),
      deadline_at: new Date(Date.now() - 3_500_000).toISOString(),
      operation: "long-running",
      run_id: null,
    }),
  );
  await assert.rejects(
    () => acquireCompanyLock(root, { timeoutMs: 150, pollMs: 10 }),
    LockTimeoutError,
    "an expired lease must not authorise stealing a lock whose owner is still alive",
  );
  await rm(root, { recursive: true, force: true });
});

test("lock: an expired FOREIGN-host lock is quarantined, not reclaimed", async () => {
  const root = await fixture();
  const lockPath = lockPathFor(root);
  await mkdir(lockPath, { recursive: true });
  await writeFile(
    join(lockPath, "owner.json"),
    JSON.stringify({
      schema_version: 1,
      token: "foreign",
      pid: 4242,
      host: `${hostname()}-some-other-machine`,
      acquired_at: new Date(Date.now() - 3_600_000).toISOString(),
      deadline_at: new Date(Date.now() - 3_500_000).toISOString(),
      operation: "cross-host",
      run_id: null,
    }),
  );
  await assert.rejects(
    () => acquireCompanyLock(root, { timeoutMs: 300, pollMs: 10 }),
    (error: unknown) => {
      assert.ok(error instanceof LockOwnershipError);
      assert.match(error.message, /quarantined/u);
      return true;
    },
  );
  await rm(root, { recursive: true, force: true });
});

test("lock: unreadable owner metadata fails closed instead of being reclaimed", async () => {
  const root = await fixture();
  const lockPath = lockPathFor(root);
  await mkdir(lockPath, { recursive: true });
  await writeFile(join(lockPath, "owner.json"), "{ this is not json");
  await assert.rejects(
    () => acquireCompanyLock(root, { timeoutMs: 150, pollMs: 10 }),
    LockOwnershipError,
  );
  await rm(root, { recursive: true, force: true });
});

test("lock: withCompanyLock releases even when the work throws", async () => {
  const root = await fixture();
  await assert.rejects(
    () => withCompanyLock(root, {}, async () => {
      throw new Error("ledger write failed");
    }),
    /ledger write failed/u,
  );
  assert.equal(
    await inspectCompanyLock(root),
    null,
    "a failing critical section must not strand the repository lock",
  );
  const handle = await acquireCompanyLock(root, { timeoutMs: 500 });
  await releaseCompanyLock(handle);
  await rm(root, { recursive: true, force: true });
});

test("lock: releasing a lock owned by another process is refused", async () => {
  const root = await fixture();
  const mine = await acquireCompanyLock(root);
  await writeFile(
    join(mine.path, "owner.json"),
    JSON.stringify({ ...mine.owner, token: "someone-else", pid: 999999 }),
  );
  await assert.rejects(() => releaseCompanyLock(mine), LockOwnershipError);
  await rm(root, { recursive: true, force: true });
});

test("lock: the lock lives outside product/ and cannot be reached by a product write", async () => {
  const root = await fixture();
  assert.match(LOCK_RELATIVE_PATH, /^\.tailered\//u);
  assert.ok(
    !LOCK_RELATIVE_PATH.startsWith("product/"),
    "an agent authorised to write product/ must not be able to observe or corrupt the lock",
  );
  await rm(root, { recursive: true, force: true });
});

// ------------------------------------------------------------ allocator -----

test("allocator: identifiers are unique and persisted before they are returned", async () => {
  const root = await fixture();
  const first = await allocateIdentifiers(root, [{ family: "ROUTE" }, { family: "CALL" }]);
  assert.deepEqual(first.ROUTE, ["ROUTE-000001"]);
  assert.deepEqual(first.CALL, ["CALL-000001"]);

  // The increment is durable: a fresh read of the state file, by a different code path, must
  // already reflect it. This is the property the pre-fix `rows.length + 1` allocator lacked.
  const raw = JSON.parse(await readFile(join(root, SEQUENCE_RELATIVE_PATH), "utf8")) as {
    issued: Record<string, number>;
  };
  assert.equal(raw.issued.ROUTE, 1);

  const second = await allocateIdentifiers(root, [{ family: "ROUTE" }]);
  assert.deepEqual(second.ROUTE, ["ROUTE-000002"], "an identifier is never reused");
  await rm(root, { recursive: true, force: true });
});

test("allocator: 100 sequential allocations yield 100 unique identifiers per family", async () => {
  const root = await fixture();
  const seen = new Set<string>();
  for (let i = 0; i < 100; i += 1) {
    const issued = await allocateIdentifiers(root, [{ family: "EVAL" }]);
    const ids = issued.EVAL ?? [];
    assert.equal(ids.length, 1);
    seen.add(String(ids[0]));
  }
  assert.equal(seen.size, 100);
  await rm(root, { recursive: true, force: true });
});

test("allocator: rebuilds from canonical ledgers when its state file is absent", async () => {
  const root = await fixture();
  await writeFile(
    join(root, "evals/routes.jsonl"),
    `${JSON.stringify({ id: "ROUTE-000007", call_id: "CALL-000009" })}\n`,
  );
  const canonical = await deriveCanonicalMaxima(root);
  assert.equal(canonical.ROUTE, 7);
  assert.equal(canonical.CALL, 9);

  const issued = await allocateIdentifiers(root, [{ family: "ROUTE" }, { family: "CALL" }]);
  assert.deepEqual(
    issued.ROUTE,
    ["ROUTE-000008"],
    "a rebuilt allocator must not reissue an identifier that canonical state already holds",
  );
  assert.deepEqual(issued.CALL, ["CALL-000010"]);
  await rm(root, { recursive: true, force: true });
});

test("allocator: records a repair when canonical state is ahead of it", async () => {
  const root = await fixture();
  await allocateIdentifiers(root, [{ family: "ROUTE" }]); // state: ROUTE=1
  await writeFile(
    join(root, "evals/routes.jsonl"),
    `${JSON.stringify({ id: "ROUTE-000050", call_id: "CALL-000001" })}\n`,
  );
  const issued = await allocateIdentifiers(root, [{ family: "ROUTE" }]);
  assert.deepEqual(issued.ROUTE, ["ROUTE-000051"]);
  const { state } = await inspectSequence(root);
  assert.ok(state.repairs.length >= 1, "an allocator repair must be recorded, not silent");
  // The allocator reconciles every family that canonical state is ahead of, so more than one
  // repair may be recorded in a single pass. Assert the ROUTE repair is present rather than
  // that it happens to be last.
  const routeRepair = state.repairs.find((repair) => repair.family === "ROUTE");
  assert.ok(routeRepair, "the ROUTE repair must be recorded");
  assert.equal(routeRepair.from, 1);
  assert.equal(routeRepair.to, 50);
  await rm(root, { recursive: true, force: true });
});

test("allocator: never moves backward when canonical state is behind it", async () => {
  const root = await fixture();
  await allocateIdentifiers(root, [{ family: "EVAL", count: 5 }]); // EVAL=5, canonical empty
  const issued = await allocateIdentifiers(root, [{ family: "EVAL" }]);
  assert.deepEqual(
    issued.EVAL ?? [],
    ["EVAL-000006"],
    "a gap left by a crashed run must never be filled by reissuing the identifier",
  );
  await rm(root, { recursive: true, force: true });
});

test("allocator: the state file lives outside product/", async () => {
  assert.match(SEQUENCE_RELATIVE_PATH, /^\.tailered\//u);
  assert.ok(!SEQUENCE_RELATIVE_PATH.startsWith("product/"));
});
