import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { withCompanyLock, type LockHandle } from "../src/lock.js";
import {
  SEQUENCE_BOOTSTRAP_RELATIVE_PATH,
  SEQUENCE_RELATIVE_PATH,
  SequenceStateError,
  allocateIdentifiers,
  allocateRouteCallPair,
  deriveCanonicalMaxima,
  formatIdentifier,
  inspectSequence,
} from "../src/sequence.js";

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "p0b-seq-"));
  await mkdir(join(root, "evals"), { recursive: true });
  await mkdir(join(root, "labels"), { recursive: true });
  await mkdir(join(root, "decisions"), { recursive: true });
  await writeFile(join(root, "evals/routes.jsonl"), "");
  await writeFile(join(root, "evals/ledger.jsonl"), "");
  await writeFile(join(root, "labels/ledger.jsonl"), "");
  return root;
}

/** Every allocation in these tests goes through a real, held lock. */
async function locked<T>(root: string, work: (handle: LockHandle) => Promise<T>): Promise<T> {
  return withCompanyLock(root, { operation: "test-allocate" }, work);
}

// ------------------------------------------------------- durable issuance ---

test("allocator: identifiers are persisted before they are returned, and never reused", async () => {
  const root = await fixture();
  const first = await locked(root, (h) => allocateRouteCallPair(h));
  assert.equal(first.route_id, "ROUTE-000001");

  // The increment is durable: a fresh read of the state file, by a different code path, must
  // already reflect it. This is the property the pre-fix `rows.length + 1` allocator lacked.
  const raw = JSON.parse(await readFile(join(root, SEQUENCE_RELATIVE_PATH), "utf8")) as {
    issued: Record<string, number>;
  };
  assert.equal(raw.issued.ROUTE_CALL, 1);

  const second = await locked(root, (h) => allocateRouteCallPair(h));
  assert.equal(second.route_id, "ROUTE-000002", "an identifier is never reused");
  await rm(root, { recursive: true, force: true });
});

test("allocator: 100 sequential allocations yield 100 unique identifiers", async () => {
  const root = await fixture();
  const seen = new Set<string>();
  await locked(root, async (handle) => {
    for (let i = 0; i < 100; i += 1) {
      const issued = await allocateIdentifiers(handle, { EVAL: 1 });
      seen.add(String(issued.EVAL[0]));
    }
  });
  assert.equal(seen.size, 100);
  await rm(root, { recursive: true, force: true });
});

test("allocator: never moves backward when canonical state is behind it", async () => {
  const root = await fixture();
  await locked(root, (h) => allocateIdentifiers(h, { EVAL: 5 })); // EVAL=5, canonical empty
  const issued = await locked(root, (h) => allocateIdentifiers(h, { EVAL: 1 }));
  assert.deepEqual(
    issued.EVAL,
    ["EVAL-000006"],
    "a gap left by a crashed run must never be filled by reissuing the identifier",
  );
  await rm(root, { recursive: true, force: true });
});

test("allocator: state and bootstrap marker both live outside product/", async () => {
  assert.match(SEQUENCE_RELATIVE_PATH, /^\.tailered\//u);
  assert.match(SEQUENCE_BOOTSTRAP_RELATIVE_PATH, /^\.tailered\//u);
  assert.ok(!SEQUENCE_RELATIVE_PATH.startsWith("product/"));
});

// --------------------------------------------------------- ROUTE/CALL pair ---

test("allocator: one reservation yields the paired ROUTE and CALL identifiers", async () => {
  // Failure mechanism: independent ROUTE and CALL counters drift the moment either allocates
  // alone, and every trace relationship in src/ship.ts assumes CALL-N partners ROUTE-N.
  const root = await fixture();
  const pair = await locked(root, (h) => allocateRouteCallPair(h));
  assert.equal(pair.sequence, 1);
  assert.equal(pair.route_id, "ROUTE-000001");
  assert.equal(pair.call_id, "CALL-000001");
  assert.equal(
    pair.call_id,
    pair.route_id.replace(/^ROUTE-/u, "CALL-"),
    "the pairing must match the substitution src/ship.ts already performs",
  );
  await rm(root, { recursive: true, force: true });
});

test("allocator: legacy rows whose ROUTE and CALL numbers disagree resolve to the higher", async () => {
  // Failure mechanism: taking only the ROUTE maximum would reissue CALL-000009 on a repository
  // written before the pairing rule existed.
  const root = await fixture();
  await writeFile(
    join(root, "evals/routes.jsonl"),
    `${JSON.stringify({ id: "ROUTE-000007", call_id: "CALL-000009" })}\n`,
  );
  const canonical = await deriveCanonicalMaxima(root);
  assert.equal(canonical.ROUTE_CALL, 9);

  const pair = await locked(root, (h) => allocateRouteCallPair(h));
  assert.equal(pair.route_id, "ROUTE-000010");
  assert.equal(pair.call_id, "CALL-000010");
  await rm(root, { recursive: true, force: true });
});

test("allocator: ADR identifiers keep their three-digit on-disk width", async () => {
  // Failure mechanism: six-digit padding would mint ADR-000004 for a repository whose decisions
  // directory holds ADR-000 through ADR-003, so the new file would never collide with, sort
  // beside, or supersede the real ones.
  assert.equal(formatIdentifier("ADR", 4), "ADR-004");
  assert.equal(formatIdentifier("ROUTE", 4), "ROUTE-000004");
  assert.equal(formatIdentifier("CALL", 4), "CALL-000004");
});

// ------------------------------------------------------- lock enforcement ---

test("allocator: a handle whose lock was released cannot allocate", async () => {
  // Failure mechanism: a comment saying "the caller must hold the lock" is not enforcement.
  // A stale handle is a claim about the past; allocation must prove the claim still holds.
  const root = await fixture();
  let escaped: LockHandle | null = null;
  await locked(root, async (handle) => {
    escaped = handle;
  });
  assert.ok(escaped !== null);
  await assert.rejects(
    () => allocateIdentifiers(escaped as unknown as LockHandle, { EVAL: 1 }),
    /lock/iu,
    "allocation outside a held lock must be refused at the moment of use",
  );
  await rm(root, { recursive: true, force: true });
});

test("allocator: a forged handle for a lock that was never taken cannot allocate", async () => {
  const root = await fixture();
  const forged = {
    root,
    path: join(root, ".tailered/locks/company-ledger.lock"),
    owner: {
      schema_version: 1,
      token: "forged",
      pid: process.pid,
      host: "nowhere",
      acquired_at: new Date().toISOString(),
      deadline_at: new Date(Date.now() + 60_000).toISOString(),
      operation: "forged",
      run_id: null,
    },
  } satisfies LockHandle;
  await assert.rejects(() => allocateIdentifiers(forged, { EVAL: 1 }), /lock/iu);
  await rm(root, { recursive: true, force: true });
});

// ----------------------------------------------------------- fail closed ----

test("allocator: malformed sequence JSON is refused, not treated as an empty allocator", async () => {
  // Failure mechanism: returning an empty allocator on a parse error resets every counter to
  // zero and reissues every identifier the repository already holds.
  const root = await fixture();
  await locked(root, (h) => allocateIdentifiers(h, { EVAL: 3 }));
  await writeFile(join(root, SEQUENCE_RELATIVE_PATH), "{ not json");
  await assert.rejects(
    () => locked(root, (h) => allocateIdentifiers(h, { EVAL: 1 })),
    (error: unknown) => {
      assert.ok(error instanceof SequenceStateError);
      assert.equal(error.reason, "malformed");
      return true;
    },
  );
  await rm(root, { recursive: true, force: true });
});

test("allocator: an unreadable sequence file is refused", async () => {
  // Failure mechanism: an I/O error is not an absence. A directory in place of the state file
  // reproduces EISDIR, which fails for every user including root — unlike a chmod, which the
  // container's root user would ignore.
  const root = await fixture();
  await mkdir(join(root, SEQUENCE_RELATIVE_PATH), { recursive: true });
  await assert.rejects(
    () => locked(root, (h) => allocateIdentifiers(h, { EVAL: 1 })),
    (error: unknown) => {
      assert.ok(error instanceof SequenceStateError);
      assert.equal(error.reason, "unreadable");
      return true;
    },
  );
  await rm(root, { recursive: true, force: true });
});

test("allocator: a schema-version mismatch is refused", async () => {
  const root = await fixture();
  await locked(root, (h) => allocateIdentifiers(h, { EVAL: 1 }));
  await writeFile(
    join(root, SEQUENCE_RELATIVE_PATH),
    JSON.stringify({ schema_version: 999, updated_at: "", issued: {}, repairs: [] }),
  );
  await assert.rejects(
    () => locked(root, (h) => allocateIdentifiers(h, { EVAL: 1 })),
    (error: unknown) => {
      assert.ok(error instanceof SequenceStateError);
      assert.equal(error.reason, "schema");
      return true;
    },
  );
  await rm(root, { recursive: true, force: true });
});

test("allocator: an impossible counter is refused", async () => {
  const root = await fixture();
  await locked(root, (h) => allocateIdentifiers(h, { EVAL: 1 }));
  const state = JSON.parse(
    await readFile(join(root, SEQUENCE_RELATIVE_PATH), "utf8"),
  ) as { issued: Record<string, unknown> };
  state.issued.EVAL = -4;
  await writeFile(join(root, SEQUENCE_RELATIVE_PATH), JSON.stringify(state));
  await assert.rejects(
    () => locked(root, (h) => allocateIdentifiers(h, { EVAL: 1 })),
    (error: unknown) => {
      assert.ok(error instanceof SequenceStateError);
      assert.equal(error.reason, "counter");
      return true;
    },
  );
  await rm(root, { recursive: true, force: true });
});

test("allocator: a malformed ADR is refused rather than read as an empty ADR set", async () => {
  // Failure mechanism: `readAdrs(root).catch(() => [])` turned any ADR read failure into "there
  // are no ADRs", which lets the allocator mint an id an existing decision already owns.
  const root = await fixture();
  await writeFile(join(root, "decisions/ADR-004.md"), "this is not an ADR");
  await assert.rejects(
    () => locked(root, (h) => allocateIdentifiers(h, { ADR: 1 })),
    /Malformed ADR metadata/u,
  );
  await rm(root, { recursive: true, force: true });
});

test("allocator: an absent decisions directory is the ONE absence treated as empty", async () => {
  const root = await fixture();
  await rm(join(root, "decisions"), { recursive: true, force: true });
  const canonical = await deriveCanonicalMaxima(root);
  assert.equal(canonical.ADR, 0);
  await rm(root, { recursive: true, force: true });
});

// ------------------------------------------------ bootstrap exactly once ----

test("allocator: a pre-P0-B repository bootstraps once, and the bootstrap is recorded", async () => {
  const root = await fixture();
  await writeFile(
    join(root, "evals/routes.jsonl"),
    `${JSON.stringify({ id: "ROUTE-000004", call_id: "CALL-000004" })}\n`,
  );
  const pair = await locked(root, (h) => allocateRouteCallPair(h));
  assert.equal(pair.route_id, "ROUTE-000005", "bootstrap must not reissue a consumed id");

  const marker = JSON.parse(
    await readFile(join(root, SEQUENCE_BOOTSTRAP_RELATIVE_PATH), "utf8"),
  ) as { canonical_at_bootstrap: Record<string, number> };
  assert.equal(marker.canonical_at_bootstrap.ROUTE_CALL, 4);

  const { state } = await inspectSequence(root);
  assert.ok(
    state?.repairs.some((repair) => repair.reason.startsWith("bootstrap")),
    "a bootstrap must be recorded, not silent",
  );
  await rm(root, { recursive: true, force: true });
});

test("allocator: state lost AFTER bootstrap is an integrity failure, not an automatic rebuild", async () => {
  // Failure mechanism: silently rebuilding from canonical rows cannot see identifiers that were
  // issued but not yet consumed, so the rebuild would hand the same id to a second run.
  const root = await fixture();
  await locked(root, (h) => allocateIdentifiers(h, { EVAL: 2 }));
  await rm(join(root, SEQUENCE_RELATIVE_PATH), { force: true });
  await assert.rejects(
    () => locked(root, (h) => allocateIdentifiers(h, { EVAL: 1 })),
    (error: unknown) => {
      assert.ok(error instanceof SequenceStateError);
      assert.equal(error.reason, "missing_after_bootstrap");
      assert.match(error.message, /tailered recover/u);
      return true;
    },
  );
  await rm(root, { recursive: true, force: true });
});

test("allocator: an unreadable bootstrap marker is refused", async () => {
  const root = await fixture();
  await mkdir(join(root, SEQUENCE_BOOTSTRAP_RELATIVE_PATH), { recursive: true });
  await assert.rejects(
    () => locked(root, (h) => allocateIdentifiers(h, { EVAL: 1 })),
    (error: unknown) => {
      assert.ok(error instanceof SequenceStateError);
      assert.equal(error.reason, "unreadable");
      return true;
    },
  );
  await rm(root, { recursive: true, force: true });
});

// -------------------------------------------------------------- repairs -----

test("allocator: records a repair when canonical state is ahead of it", async () => {
  const root = await fixture();
  await locked(root, (h) => allocateRouteCallPair(h)); // state: ROUTE_CALL=1
  await writeFile(
    join(root, "evals/routes.jsonl"),
    `${JSON.stringify({ id: "ROUTE-000050", call_id: "CALL-000050" })}\n`,
  );
  const pair = await locked(root, (h) => allocateRouteCallPair(h));
  assert.equal(pair.route_id, "ROUTE-000051");

  const { state } = await inspectSequence(root);
  const repair = state?.repairs.find(
    (candidate) => candidate.family === "ROUTE_CALL" && candidate.from === 1,
  );
  assert.ok(repair, "an allocator repair must be recorded, not silent");
  assert.equal(repair.to, 50);
  await rm(root, { recursive: true, force: true });
});

test("allocator: an identifier reserved by a started run is never reissued", async () => {
  // Failure mechanism: this is the issued-but-unconsumed gap. A run that has started and
  // recorded its identifiers, but has not yet appended its canonical rows, is invisible to a
  // canonical-rows-only rebuild.
  const root = await fixture();
  await mkdir(join(root, "evals/runs/RUN-INFLIGHT"), { recursive: true });
  await writeFile(
    join(root, "evals/runs/RUN-INFLIGHT/started.json"),
    JSON.stringify({ run_id: "RUN-INFLIGHT", route_id: "ROUTE-000031", call_id: "CALL-000031" }),
  );
  const canonical = await deriveCanonicalMaxima(root);
  assert.equal(canonical.ROUTE_CALL, 31, "a reserved identifier counts as taken");

  const pair = await locked(root, (h) => allocateRouteCallPair(h));
  assert.equal(pair.route_id, "ROUTE-000032");
  await rm(root, { recursive: true, force: true });
});

test("allocator: a malformed run start record is refused rather than ignored", async () => {
  const root = await fixture();
  await mkdir(join(root, "evals/runs/RUN-BROKEN"), { recursive: true });
  await writeFile(join(root, "evals/runs/RUN-BROKEN/started.json"), "{ truncated");
  await assert.rejects(
    () => deriveCanonicalMaxima(root),
    (error: unknown) => {
      assert.ok(error instanceof SequenceStateError);
      assert.equal(error.reason, "malformed");
      return true;
    },
  );
  await rm(root, { recursive: true, force: true });
});

test("allocator: inspectSequence observes a missing allocator without repairing it", async () => {
  // Failure mechanism: validation that repairs what it inspects can never report a fault.
  const root = await fixture();
  const before = await inspectSequence(root);
  assert.equal(before.state, null);
  assert.equal(before.bootstrapped, null);
  await assert.rejects(
    () => readFile(join(root, SEQUENCE_RELATIVE_PATH), "utf8"),
    /ENOENT/u,
    "inspection must not have created state as a side effect",
  );
  await rm(root, { recursive: true, force: true });
});
