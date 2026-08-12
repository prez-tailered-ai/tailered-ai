import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  BARRIER_POINTS,
  barrier,
  barriersInstalled,
  clearBarriers,
  installBarrier,
} from "../src/barrier.js";
import { appendJsonLine, readJsonLines } from "../src/files.js";
import { withCompanyLock } from "../src/lock.js";
import { allocateRouteCallPair } from "../src/sequence.js";

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "p0b-barrier-"));
  await mkdir(join(root, "evals"), { recursive: true });
  await mkdir(join(root, "labels"), { recursive: true });
  await mkdir(join(root, "decisions"), { recursive: true });
  await writeFile(join(root, "evals/routes.jsonl"), "");
  await writeFile(join(root, "evals/ledger.jsonl"), "");
  await writeFile(join(root, "labels/ledger.jsonl"), "");
  return root;
}

/**
 * A two-party rendezvous. Both parties block until both have arrived, which is what makes the
 * interleaving deterministic instead of a race the test hopes will happen.
 */
function rendezvous(parties: number): () => Promise<void> {
  let arrived = 0;
  let release!: () => void;
  const opened = new Promise<void>((resolveOpened) => {
    release = resolveOpened;
  });
  return async () => {
    arrived += 1;
    if (arrived >= parties) release();
    await opened;
  };
}

/**
 * The pre-fix allocate-then-append algorithm, reproduced from `src/ledger.ts` at `6172653e`:
 *
 *   nextRouteId() { return formatLedgerId("ROUTE", (await this.routes()).length + 1); }
 *   appendRouteLog(log) {
 *     const existing = await this.routes();
 *     if (existing.some((row) => row.id === log.id)) throw new AppendOnlyViolationError(...);
 *     await appendJsonLine(this.#routePath, log);
 *   }
 *
 * It is reproduced here rather than imported because the fix removes it. Without a red proof
 * the green tests below would only show that the new code does not crash.
 */
async function legacyAllocateAndAppend(
  root: string,
  gate: () => Promise<void>,
): Promise<string> {
  const routePath = resolve(root, "evals/routes.jsonl");
  const rows = await readJsonLines<{ id: string }>(routePath);
  const id = `ROUTE-${String(rows.length + 1).padStart(6, "0")}`;

  // Both writers have now read the same length and decided the same identifier.
  await gate();

  const existing = await readJsonLines<{ id: string }>(routePath);
  if (existing.some((row) => row.id === id)) {
    throw new Error(`Route log ${id} already exists.`);
  }
  await appendJsonLine(routePath, { id });
  return id;
}

// ------------------------------------------------------------------ red -----

test("barrier RED: the pre-fix algorithm loses deterministically when two writers interleave", async () => {
  // Failure mechanism: read-then-write. Both writers read length 0, both compute ROUTE-000001,
  // and the loser either duplicates the identifier or halts on the uniqueness check. This is
  // the same failure the N=10 harness recorded as `Duplicate route log id: ROUTE-000006`.
  const root = await fixture();
  const gate = rendezvous(2);

  const outcomes = await Promise.allSettled([
    legacyAllocateAndAppend(root, gate),
    legacyAllocateAndAppend(root, gate),
  ]);

  const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
  const rejected = outcomes.filter((o) => o.status === "rejected");

  assert.equal(
    fulfilled.length + rejected.length,
    2,
    "both writers must have completed or failed",
  );
  assert.ok(
    rejected.length === 1 || new Set(fulfilled.map((o) => o.value)).size === 1,
    "the pre-fix algorithm must either collide on the uniqueness check or mint a duplicate id",
  );

  const rows = await readJsonLines<{ id: string }>(resolve(root, "evals/routes.jsonl"));
  assert.ok(
    rows.length < 2 || new Set(rows.map((r) => r.id)).size < rows.length,
    "two concurrent pre-fix writers must not produce two distinct rows",
  );
  await rm(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------- green -----

test("barrier GREEN: the lock serialises the allocation critical section strictly", async () => {
  // The barrier records entry and exit inside the section. If the lock works, the events must
  // nest — enter, exit, enter, exit — with no interleaving possible.
  const root = await fixture();
  const events: string[] = [];
  const uninstall = installBarrier("allocate:after-read", async () => {
    events.push("enter");
    // Yield generously. If the section were not exclusive, the second writer would enter here.
    await new Promise((r) => setTimeout(r, 40));
    events.push("exit");
  });

  try {
    const [a, b] = await Promise.all([
      withCompanyLock(root, { operation: "alloc-a", timeoutMs: 10_000 }, (h) =>
        allocateRouteCallPair(h),
      ),
      withCompanyLock(root, { operation: "alloc-b", timeoutMs: 10_000 }, (h) =>
        allocateRouteCallPair(h),
      ),
    ]);

    assert.deepEqual(
      events,
      ["enter", "exit", "enter", "exit"],
      "an interleaved 'enter,enter' would mean two writers were inside the section at once",
    );
    assert.notEqual(a.route_id, b.route_id, "two writers must never receive the same identifier");
    assert.deepEqual(
      [a.route_id, b.route_id].sort(),
      ["ROUTE-000001", "ROUTE-000002"],
      "identifiers must be consecutive with no gap and no reuse",
    );
    assert.equal(a.call_id, a.route_id.replace(/^ROUTE-/u, "CALL-"));
  } finally {
    uninstall();
  }
  await rm(root, { recursive: true, force: true });
});

test("barrier GREEN: ten concurrent locked allocations produce ten distinct identifiers", async () => {
  const root = await fixture();
  const uninstall = installBarrier("allocate:after-read", async () => {
    // Force every writer to hold the decision point open, maximising the window the pre-fix
    // code would have lost in.
    await new Promise((r) => setTimeout(r, 5));
  });

  try {
    const pairs = await Promise.all(
      Array.from({ length: 10 }, (_unused, index) =>
        withCompanyLock(root, { operation: `alloc-${index}`, timeoutMs: 30_000 }, (h) =>
          allocateRouteCallPair(h),
        ),
      ),
    );
    const routes = new Set(pairs.map((p) => p.route_id));
    const calls = new Set(pairs.map((p) => p.call_id));
    assert.equal(routes.size, 10, "ten allocations must yield ten distinct route identifiers");
    assert.equal(calls.size, 10);
    assert.equal(
      Math.max(...pairs.map((p) => p.sequence)),
      10,
      "the counter must advance exactly ten times — no gaps, no reuse",
    );
  } finally {
    uninstall();
  }
  await rm(root, { recursive: true, force: true });
});

// ------------------------------------------------------ production safety ---

test("barrier: nothing is installed by default and reaching one is a synchronous no-op", async () => {
  clearBarriers();
  assert.equal(barriersInstalled(), 0);
  for (const point of BARRIER_POINTS) {
    assert.equal(
      barrier(point),
      undefined,
      "an uninstalled barrier must return synchronously, not an awaited promise",
    );
  }
});

test("barrier: the registry cannot be populated by the environment", async () => {
  // Failure mechanism: a barrier readable from an environment variable or a file would be a
  // production pause hook — anything that can set that variable, or write that file, could
  // wedge a real run. The only entry point is installBarrier, called in-process.
  clearBarriers();
  process.env.TAILERED_BARRIER = "allocate:after-read";
  process.env.TAILERED_BARRIER_POINT = "allocate:after-read";
  try {
    assert.equal(barriersInstalled(), 0);
    assert.equal(barrier("allocate:after-read"), undefined);
  } finally {
    delete process.env.TAILERED_BARRIER;
    delete process.env.TAILERED_BARRIER_POINT;
  }
});

test("barrier: uninstall restores the no-op path", async () => {
  clearBarriers();
  let hits = 0;
  const uninstall = installBarrier("append:after-uniqueness", () => {
    hits += 1;
  });
  await barrier("append:after-uniqueness");
  assert.equal(hits, 1);
  uninstall();
  assert.equal(barriersInstalled(), 0);
  assert.equal(barrier("append:after-uniqueness"), undefined);
  await barrier("append:after-uniqueness");
  assert.equal(hits, 1, "an uninstalled handler must not run again");
});
