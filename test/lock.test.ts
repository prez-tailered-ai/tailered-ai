import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  INCIDENTS_RELATIVE_PATH,
  LOCK_RELATIVE_PATH,
  LockOwnershipError,
  LockTimeoutError,
  acquireCompanyLock,
  assertLockHeld,
  inspectCompanyLock,
  lockPathFor,
  readIntegrityIncidents,
  releaseCompanyLock,
  withCompanyLock,
} from "../src/lock.js";

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

function ownerFile(root: string): string {
  return join(lockPathFor(root), "owner.json");
}

// ------------------------------------------------------ mutual exclusion ----

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
    ownerFile(root),
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
    ownerFile(root),
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
    ownerFile(root),
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
  await mkdir(lockPathFor(root), { recursive: true });
  await writeFile(ownerFile(root), "{ this is not json");
  await assert.rejects(
    () => acquireCompanyLock(root, { timeoutMs: 150, pollMs: 10 }),
    (error: unknown) => {
      assert.ok(error instanceof LockOwnershipError);
      assert.match(error.message, /unreadable/u);
      return true;
    },
  );
  await rm(root, { recursive: true, force: true });
});

test("lock: the lock lives outside product/ and cannot be reached by a product write", async () => {
  assert.match(LOCK_RELATIVE_PATH, /^\.tailered\//u);
  assert.ok(
    !LOCK_RELATIVE_PATH.startsWith("product/"),
    "an agent authorised to write product/ must not be able to observe or corrupt the lock",
  );
});

// ------------------------------------------------ release fails honestly ----

test("lock: withCompanyLock releases, and the lock is gone, when the work throws", async () => {
  const root = await fixture();
  await assert.rejects(
    () =>
      withCompanyLock(root, {}, async () => {
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
    ownerFile(root),
    JSON.stringify({ ...mine.owner, token: "someone-else", pid: 999999 }),
  );
  await assert.rejects(() => releaseCompanyLock(mine), LockOwnershipError);
  await rm(root, { recursive: true, force: true });
});

test("lock: releasing when the owner file is MISSING is refused, not assumed successful", async () => {
  // Failure mechanism: the owner file is the only proof that this directory is *our* lock.
  // Deleting the directory without that proof could release a lock another process now holds.
  const root = await fixture();
  const mine = await acquireCompanyLock(root);
  await rm(ownerFile(root), { force: true });
  await assert.rejects(
    () => releaseCompanyLock(mine),
    (error: unknown) => {
      assert.ok(error instanceof LockOwnershipError);
      assert.match(error.message, /no longer present/u);
      return true;
    },
  );
  await rm(root, { recursive: true, force: true });
});

test("lock: releasing when the owner file is MALFORMED is refused", async () => {
  // Failure mechanism: a corrupt owner file cannot establish a token match, so ownership is
  // unproven. Unproven ownership must never authorise a delete.
  const root = await fixture();
  const mine = await acquireCompanyLock(root);
  await writeFile(ownerFile(root), "}{ truncated");
  await assert.rejects(
    () => releaseCompanyLock(mine),
    (error: unknown) => {
      assert.ok(error instanceof LockOwnershipError);
      assert.match(error.message, /unreadable/u);
      return true;
    },
  );
  await rm(root, { recursive: true, force: true });
});

test("lock: successful work plus a FAILED release fails the whole operation", async () => {
  // Failure mechanism: the pre-hardening `withCompanyLock` swallowed every release failure, so
  // a caller could be told the operation succeeded while the repository stayed locked.
  const root = await fixture();
  await assert.rejects(
    () =>
      withCompanyLock(root, { operation: "append" }, async () => {
        // Break ownership from inside the critical section: release can no longer be proven.
        await rm(ownerFile(root), { force: true });
        return "work result that must not be returned";
      }),
    (error: unknown) => {
      assert.ok(
        error instanceof LockOwnershipError,
        "a release failure after successful work must surface, not be discarded",
      );
      return true;
    },
  );
  await rm(root, { recursive: true, force: true });
});

test("lock: failed work plus a failed release retains BOTH errors", async () => {
  // Failure mechanism: reporting only one of two independent failures loses the other. The
  // work error tells the operator what broke; the release error tells them the repository is
  // still locked. Either one alone is a misleading incident report.
  const root = await fixture();
  await assert.rejects(
    () =>
      withCompanyLock(root, { operation: "finalize" }, async () => {
        await rm(ownerFile(root), { force: true });
        throw new Error("terminal eval append failed");
      }),
    (error: unknown) => {
      assert.ok(error instanceof AggregateError, "both failures must be carried together");
      assert.equal(error.errors.length, 2);
      assert.match(String(error.errors[0]), /terminal eval append failed/u);
      assert.ok(error.errors[1] instanceof LockOwnershipError);
      return true;
    },
  );
  await rm(root, { recursive: true, force: true });
});

test("lock: a release failure is recorded as a durable integrity incident", async () => {
  // Failure mechanism: an in-memory-only failure disappears when the process exits. Validation
  // and recovery can only act on something written down.
  const root = await fixture();
  await assert.rejects(
    () =>
      withCompanyLock(root, { operation: "append", runId: "RUN-INCIDENT" }, async () => {
        await rm(ownerFile(root), { force: true });
      }),
    LockOwnershipError,
  );
  const incidents = await readIntegrityIncidents(root);
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0]?.kind, "lock_release_failed");
  assert.equal(incidents[0]?.run_id, "RUN-INCIDENT");
  assert.equal(incidents[0]?.work_failed, false, "the work succeeded; only release failed");
  assert.match(INCIDENTS_RELATIVE_PATH, /^\.tailered\//u);
  await rm(root, { recursive: true, force: true });
});

test("lock: an incident distinguishes a failed release from a failed operation", async () => {
  const root = await fixture();
  await assert.rejects(
    () =>
      withCompanyLock(root, { operation: "append", runId: "RUN-BOTH" }, async () => {
        await rm(ownerFile(root), { force: true });
        throw new Error("append failed");
      }),
    AggregateError,
  );
  const incidents = await readIntegrityIncidents(root);
  assert.equal(incidents[0]?.work_failed, true, "the two failures must not be conflated");
  await rm(root, { recursive: true, force: true });
});

// ------------------------------------------------------ ownership proof -----

test("lock: assertLockHeld rejects a handle whose lock was already released", async () => {
  // Failure mechanism: a handle is a claim about the past. Trusting it at use time is how a
  // process keeps mutating canonical state after its lock was reclaimed by a peer.
  const root = await fixture();
  const handle = await acquireCompanyLock(root);
  await releaseCompanyLock(handle);
  await assert.rejects(() => assertLockHeld(handle), LockOwnershipError);
  await rm(root, { recursive: true, force: true });
});

test("lock: assertLockHeld rejects a handle whose lock is now held by a different owner", async () => {
  const root = await fixture();
  const stale = await acquireCompanyLock(root);
  await writeFile(ownerFile(root), JSON.stringify({ ...stale.owner, token: "rotated" }));
  await assert.rejects(
    () => assertLockHeld(stale),
    (error: unknown) => {
      assert.ok(error instanceof LockOwnershipError);
      assert.match(error.message, /not by this process/u);
      return true;
    },
  );
  await rm(root, { recursive: true, force: true });
});

test("lock: inspectCompanyLock reports an unreadable lock as an error, never as 'no lock'", async () => {
  // Failure mechanism: collapsing "corrupt" into "absent" would let validation report a healthy
  // repository while the lock directory is unusable.
  const root = await fixture();
  await mkdir(lockPathFor(root), { recursive: true });
  await writeFile(ownerFile(root), "not json at all");
  await assert.rejects(() => inspectCompanyLock(root), LockOwnershipError);
  await rm(root, { recursive: true, force: true });
});
