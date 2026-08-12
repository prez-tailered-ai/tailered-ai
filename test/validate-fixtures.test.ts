import assert from "node:assert/strict";
import { appendFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { mintCompany } from "../src/company.js";
import type { EvalRow, GateLabel, RouteLog } from "../src/contracts.js";
import { TodoDemoAgent } from "../src/demo-agent.js";
import { hashDirectory, readJsonLines } from "../src/files.js";
import { lockPathFor } from "../src/lock.js";
import { FixedGate, taileredShip } from "../src/ship.js";
import { validateCompany } from "../src/validate.js";

/**
 * P0B-15 corruption fixtures. One seeded fault per extended-validation condition.
 *
 * Every fixture proves four things: the intended error fires; validation rejects (the CLI
 * translates the throw to a nonzero exit); validation changes zero bytes (observe-only,
 * proven by a full tree hash before and after); and the clean control still passes.
 */
let template: string;
let runId: string;

test.before(async () => {
  template = await mkdtemp(join(tmpdir(), "p0b-vfix-template-"));
  await mintCompany(template, {
    what: "We are building a fixture company that proves extended validation detects corruption.",
    forWhom: "It serves one auditor who needs every named failure state to fail loudly.",
    winningLooksLike: "Winning means every seeded fault produces its named error and no repair.",
    constraints: "The fixture stays disposable, makes zero model calls, and spends nothing.",
  });
  const receipt = await taileredShip({
    root: template,
    specText: "Build the single-user todo gating demonstration.",
    agent: new TodoDemoAgent(),
    gate: new FixedGate({
      verdict: "approve",
      reasonText: "All generated checks passed and the artifact matches the constitution.",
    }),
  });
  runId = receipt.runId;
});

test.after(async () => {
  await rm(template, { recursive: true, force: true });
});

test("validate: the clean control fixture passes", async () => {
  const report = await validateCompany(template);
  assert.equal(report.valid, true);
  assert.equal(report.evals, 1);
});

interface Fixture {
  name: string;
  corrupt: (root: string) => Promise<void>;
  expect: RegExp;
}

async function rewriteRows<T>(
  root: string,
  relative: string,
  edit: (rows: T[]) => T[],
): Promise<void> {
  const rows = await readJsonLines<T>(join(root, relative));
  await writeFile(join(root, relative), edit(rows).map((row) => `${JSON.stringify(row)}\n`).join(""));
}

const FIXTURES: Fixture[] = [
  {
    name: "unmatched run start",
    corrupt: async (root) => {
      const dir = join(root, "evals/runs/RUN-ORPHANSTART");
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, "started.json"),
        JSON.stringify({ schema_version: 1, run_id: "RUN-ORPHANSTART", spec_id: "SPEC-X", caused_by: ["ADR-001"] }),
      );
    },
    expect: /Unmatched run start: RUN-ORPHANSTART/u,
  },
  {
    name: "unmatched call start",
    corrupt: async (root) => {
      const dir = join(root, "evals/runs/RUN-ORPHANCALL/calls");
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(root, "evals/runs/RUN-ORPHANCALL/started.json"),
        JSON.stringify({ schema_version: 1, run_id: "RUN-ORPHANCALL", spec_id: "SPEC-X", caused_by: ["ADR-001"] }),
      );
      await writeFile(join(dir, "CALL-000099.started.json"), JSON.stringify({ call_id: "CALL-000099" }));
    },
    expect: /Unmatched call start: .*CALL-000099/u,
  },
  {
    name: "unresolved finalization intent",
    corrupt: async (root) => rm(join(root, "evals/runs", runId, "finalized.json")),
    expect: /Unresolved finalization intent/u,
  },
  {
    name: "unknown intent schema",
    corrupt: async (root) => {
      const path = join(root, "evals/runs", runId, "finalization-intent.json");
      const intent = JSON.parse(await readFile(path, "utf8")) as { schema_version: number };
      intent.schema_version = 1;
      await writeFile(path, JSON.stringify(intent, null, 2));
    },
    expect: /unknown schema version 1/u,
  },
  {
    name: "intent payload-hash failure",
    corrupt: async (root) => {
      const path = join(root, "evals/runs", runId, "finalization-intent.json");
      const intent = JSON.parse(await readFile(path, "utf8")) as { payload_sha256: { eval: string } };
      intent.payload_sha256.eval = "0".repeat(64);
      await writeFile(path, JSON.stringify(intent, null, 2));
    },
    expect: /intent eval payload hash does not match/u,
  },
  {
    name: "terminal row disagrees with its intent",
    corrupt: async (root) =>
      rewriteRows<EvalRow>(root, "evals/ledger.jsonl", (rows) =>
        rows.map((row) => (row.run_id === runId ? { ...row, cost_usd: row.cost_usd + 1 } : row)),
      ),
    expect: /disagrees with the recorded finalization intent/u,
  },
  {
    name: "duplicate terminal-ADR reference across evals",
    corrupt: async (root) =>
      rewriteRows<EvalRow>(root, "evals/ledger.jsonl", (rows) => {
        const first = rows[0];
        if (!first) return rows;
        return [
          ...rows,
          { ...first, id: "EVAL-000099", run_id: "RUN-OTHER", caused_by: [first.adr_id, "SPEC-X"] },
        ];
      }),
    expect: /Duplicate terminal-ADR reference/u,
  },
  {
    name: "duplicate route log id",
    corrupt: async (root) =>
      rewriteRows<RouteLog>(root, "evals/routes.jsonl", (rows) => {
        const first = rows[0];
        return first ? [...rows, { ...first }] : rows;
      }),
    expect: /Duplicate route log id/u,
  },
  {
    name: "duplicate agent call id",
    corrupt: async (root) =>
      rewriteRows<RouteLog>(root, "evals/routes.jsonl", (rows) => {
        const [first, second] = rows;
        if (!first || !second) return rows;
        return [first, { ...second, call_id: first.call_id }, ...rows.slice(2)];
      }),
    expect: /Duplicate agent call id/u,
  },
  {
    name: "duplicate gate label id",
    corrupt: async (root) =>
      rewriteRows<GateLabel>(root, "labels/ledger.jsonl", (rows) => {
        const first = rows[0];
        return first ? [...rows, { ...first }] : rows;
      }),
    expect: /Duplicate gate label id/u,
  },
  {
    name: "duplicate eval id",
    corrupt: async (root) =>
      rewriteRows<EvalRow>(root, "evals/ledger.jsonl", (rows) => {
        const first = rows[0];
        return first ? [...rows, { ...first, run_id: "RUN-OTHER" }] : rows;
      }),
    expect: /Duplicate eval id/u,
  },
  {
    name: "duplicate terminal row for one run",
    corrupt: async (root) =>
      rewriteRows<EvalRow>(root, "evals/ledger.jsonl", (rows) => {
        const first = rows[0];
        return first ? [...rows, { ...first, id: "EVAL-000098" }] : rows;
      }),
    expect: /more than one terminal eval/u,
  },
  {
    name: "duplicate ADR id across files",
    corrupt: async (root) => {
      const adr002 = await readFile(join(root, "decisions/ADR-002.md"), "utf8");
      await writeFile(join(root, "decisions/ADR-005.md"), adr002);
    },
    expect: /Duplicate ADR id/u,
  },
  {
    name: "torn JSONL names its file and line",
    corrupt: async (root) => appendFile(join(root, "evals/routes.jsonl"), "{ torn line\n"),
    expect: /Invalid JSONL at .*routes\.jsonl:\d+/u,
  },
  {
    name: "stale proven-dead lock",
    corrupt: async (root) => {
      await mkdir(lockPathFor(root), { recursive: true });
      await writeFile(
        join(lockPathFor(root), "owner.json"),
        JSON.stringify({
          schema_version: 1, token: "t", pid: 2147483646, host: hostname(),
          acquired_at: new Date().toISOString(), deadline_at: new Date().toISOString(),
          operation: "x", run_id: null,
        }),
      );
    },
    expect: /Stale repository lock/u,
  },
  {
    name: "ambiguous foreign-host lock",
    corrupt: async (root) => {
      await mkdir(lockPathFor(root), { recursive: true });
      await writeFile(
        join(lockPathFor(root), "owner.json"),
        JSON.stringify({
          schema_version: 1, token: "t", pid: 4242, host: `${hostname()}-far`,
          acquired_at: new Date().toISOString(), deadline_at: new Date().toISOString(),
          operation: "x", run_id: null,
        }),
      );
    },
    expect: /Ambiguous repository lock/u,
  },
  {
    name: "unreadable lock ownership",
    corrupt: async (root) => {
      await mkdir(lockPathFor(root), { recursive: true });
      await writeFile(join(lockPathFor(root), "owner.json"), "{ not json");
    },
    expect: /Unreadable repository lock ownership/u,
  },
  {
    name: "allocator behind canonical or reserved state",
    corrupt: async (root) => {
      const path = join(root, ".tailered/ledger-sequence.json");
      const state = JSON.parse(await readFile(path, "utf8")) as { issued: Record<string, number> };
      state.issued.EVAL = 0;
      await writeFile(path, JSON.stringify(state, null, 2));
    },
    expect: /Allocator state is behind canonical or reserved state/u,
  },
  {
    name: "allocator state missing after bootstrap",
    corrupt: async (root) => rm(join(root, ".tailered/ledger-sequence.json")),
    expect: /Allocator state is missing while its bootstrap marker exists/u,
  },
  {
    name: "malformed allocator state",
    corrupt: async (root) => writeFile(join(root, ".tailered/ledger-sequence.json"), "{ bad"),
    expect: /Allocator state invalid \(malformed\)/u,
  },
  {
    name: "unsupported allocator schema",
    corrupt: async (root) => {
      const path = join(root, ".tailered/ledger-sequence.json");
      const state = JSON.parse(await readFile(path, "utf8")) as { schema_version: number };
      state.schema_version = 99;
      await writeFile(path, JSON.stringify(state, null, 2));
    },
    expect: /Allocator state invalid \(schema\)/u,
  },
  {
    name: "missing call trace",
    corrupt: async (root) => {
      const routes = await readJsonLines<RouteLog>(join(root, "evals/routes.jsonl"));
      const first = routes[0];
      assert.ok(first);
      await rm(join(root, first.trace_ref));
    },
    expect: /call trace is unreadable/u,
  },
  {
    name: "trace and route disagreement",
    corrupt: async (root) => {
      const routes = await readJsonLines<RouteLog>(join(root, "evals/routes.jsonl"));
      const first = routes[0];
      assert.ok(first);
      const tracePath = join(root, first.trace_ref);
      const trace = JSON.parse(await readFile(tracePath, "utf8")) as { usage: { input: number } };
      trace.usage.input += 1;
      await writeFile(tracePath, JSON.stringify(trace, null, 2));
    },
    expect: /does not match its stored call trace/u,
  },
  {
    name: "missing context snapshot",
    corrupt: async (root) => {
      const routes = await readJsonLines<RouteLog>(join(root, "evals/routes.jsonl"));
      const first = routes[0];
      assert.ok(first);
      await rm(join(root, first.context.snapshot_ref));
    },
    expect: /context snapshot is unreadable/u,
  },
  {
    name: "finalized marker names a missing eval",
    corrupt: async (root) => {
      const path = join(root, "evals/runs", runId, "finalized.json");
      const marker = JSON.parse(await readFile(path, "utf8")) as { eval_id: string };
      marker.eval_id = "EVAL-999999";
      await writeFile(path, JSON.stringify(marker, null, 2));
    },
    expect: /names eval EVAL-999999, which does not exist/u,
  },
  {
    name: "marker outcome drift",
    corrupt: async (root) => {
      const path = join(root, "evals/runs", runId, "finalized.json");
      const marker = JSON.parse(await readFile(path, "utf8")) as { outcome: string };
      marker.outcome = "halted_attempts";
      await writeFile(path, JSON.stringify(marker, null, 2));
    },
    expect: /disagrees with the terminal row's outcome/u,
  },
  {
    name: "missing causal link on a start record",
    corrupt: async (root) => {
      const path = join(root, "evals/runs", runId, "started.json");
      const started = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
      delete started.caused_by;
      await writeFile(path, JSON.stringify(started, null, 2));
    },
    expect: /started\.json has no caused_by edge/u,
  },
  {
    name: "unresolved integrity incident",
    corrupt: async (root) => {
      await mkdir(join(root, ".tailered"), { recursive: true });
      await appendFile(
        join(root, ".tailered/incidents.jsonl"),
        `${JSON.stringify({ schema_version: 1, kind: "lock_release_failed", lock_token: "tok-1", at: new Date().toISOString(), pid: 1, host: "h", operation: "x", run_id: null, work_failed: false, detail: "seeded" })}\n`,
      );
    },
    expect: /Unresolved integrity incident/u,
  },
  {
    name: "unresolved quarantine record",
    corrupt: async (root) => {
      await mkdir(join(root, ".tailered/quarantine"), { recursive: true });
      await writeFile(
        join(root, ".tailered/quarantine/RUN-Q.json"),
        JSON.stringify({ schema_version: 1, run_id: "RUN-Q", reason_code: "SEEDED" }),
      );
    },
    expect: /Unresolved quarantine/u,
  },
];

for (const fixture of FIXTURES) {
  test(`validate fixture: ${fixture.name}`, async () => {
    const root = await mkdtemp(join(tmpdir(), "p0b-vfix-"));
    await cp(template, root, { recursive: true });
    await fixture.corrupt(root);

    const before = await hashDirectory(root);
    await assert.rejects(
      () => validateCompany(root),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, fixture.expect);
        return true;
      },
      `the seeded fault must produce its named error (${fixture.name})`,
    );
    const after = await hashDirectory(root);
    assert.equal(before, after, "validation must change zero bytes");
    await rm(root, { recursive: true, force: true });
  });
}
