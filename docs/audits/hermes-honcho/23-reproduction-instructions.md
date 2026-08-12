# 23 — Reproduction instructions

Everything in this audit is reproducible from GitHub plus a shell. No local path, editor URI,
or private artifact is required to check any claim.

---

## 1. Freeze the three repositories

```bash
# Target — the sole writable repository
git clone https://github.com/prez-tailered-ai/tailered-ai.git
git -C tailered-ai checkout 6172653e0aca0981d0abaf4ad8e9d587667737e9

# Upstream reference — READ ONLY, never modified or pushed to
git clone https://github.com/NousResearch/hermes-agent.git
git -C hermes-agent checkout ed5e17f4b86da0c4f09c0694757b6074ae6b9d16

# Upstream reference — READ ONLY, never modified or pushed to
git clone https://github.com/plastic-labs/honcho.git
git -C honcho checkout a92fb1e0789fd29e9674aec133328513ed0dcda3
```

Assert identity before drawing any conclusion:

```bash
for r in tailered-ai hermes-agent honcho; do
  echo "== $r"; git -C $r remote -v | head -1; git -C $r rev-parse HEAD
done
```

Hermes is ~803 MB (642 MB of it `.git`); the clone takes several minutes.

## 2. Reproduce the Tailered baseline (VERIFIED)

Requires Node 24+.

```bash
cd tailered-ai
npm ci        # expect: 4 packages, 0 vulnerabilities
npm test      # expect: 18/18 pass
npm run validate
npm run demo  # expect: status VERIFIED, outcome shipped, cost < $0.10
```

**Read exit codes directly, never through a pipe.** `npm run validate | tail` returns
`tail`'s status and produced a false pass during this audit:

```bash
node dist/src/cli.js validate --repo . > out.txt 2>&1; echo "exit=$?"
```

## 3. Reproduce POC-A — the process-agent boundary under adversarial behaviour

**Zero model calls, zero API spend.** A deterministic agent implements
[`docs/agent-protocol.md`](https://github.com/prez-tailered-ai/tailered-ai/blob/6172653e0aca0981d0abaf4ad8e9d587667737e9/docs/agent-protocol.md)
and is switched through five behaviours by an environment variable.

The agent reads one JSON request on stdin and writes one response on stdout. Per mode:

| Mode | Behaviour | Expected |
|---|---|---|
| `conforming` | honest usage; writes `product/index.html` | `shipped` |
| `overspend` | reports cost above its own declared ceiling | `halted_budget`, accounting-invariant blocker |
| `escape-write` | `codegen` returns `policies/gates.yaml` | `halted_attempts`, "restricted to product/" |
| `traversal-write` | `codegen` returns `product/../../../tmp/x` | `halted_attempts`, "escapes repository root" |
| `command-exec` | `testgen` returns an arbitrary binary | binary **executes** (documented trust boundary) |

Drive each mode with:

```bash
node dist/src/cli.js init --target "$T" --answers charter.json
node dist/src/cli.js ship --repo "$T" --spec "<spec>" \
  --agent-config agent.json --verdict approve --reason "<prose reason>" \
  --allow-local-execution
```

`agent.json` declares the command plus per-tier `maxCostUsd`/`maxTokens` ceilings, which the
runtime reserves **before** invoking the process. After each run, check: the terminal eval
row, the sha256 of `policies/gates.yaml`, whether the traversal target exists on disk, and
whether the exec marker was written.

## 4. Reproduce POC-C — the ledger concurrency defect

**This is the audit's most consequential executed result.** Mint one company, launch three
concurrent `ship` runs against it with the deterministic agent, then inspect:

```bash
for i in 1 2 3; do ( node dist/src/cli.js ship --repo "$T" ... ) & done; wait

wc -l "$T/evals/ledger.jsonl"
python3 -c "import json;ids=[json.loads(l)['id'] for l in open('$T/evals/routes.jsonl') if l.strip()];print(ids,'DUPES:',len(ids)-len(set(ids)))"
node dist/src/cli.js validate --repo "$T" > v.txt 2>&1; echo "exit=$?"   # expect 1
```

Expected on the frozen commit: duplicate `ROUTE-*` ids, ~10 validator errors, `validate`
exit **1**, and at least one started run with **no terminal `EvalRow`**. Compare run ids
present in `evals/routes.jsonl` against those in `evals/ledger.jsonl` — the set difference is
the lost run.

Full analysis: [25-concurrency-remediation-contract.md](25-concurrency-remediation-contract.md).

## 5. Reproduce the Hermes approval-detector results

The security lane's bypass results are **executed**, not inferred. `tools/approval.py`'s
detection source is loaded in an isolated harness — stubbing only `strip_ansi` and
`get_hermes_home`, **modifying no repository file** — and payloads are passed through
`detect_hardline_command` / `detect_dangerous_command`:

| Payload | `detect_hardline_command` |
|---|---|
| `/bin/rm -rf /` | **False** — falls through to the bypassable layer |
| `command rm -rf /`, `nice rm -rf /`, `timeout 5 rm -rf /` | False |
| `sudo rm -rf /`, `\rm -rf /`, `ｒｍ -rf /` (controls) | True |

Cross-check the ordering claim directly: `detect_hardline_command` is invoked **before** the
YOLO bypass, so the documented "always-on floor" is structurally accurate — the defect is in
its command-position matching, not its placement.

## 6. Verify the audit's own citations

Every citation in the canonical ledger is an immutable GitHub permalink at the frozen commit,
so a reviewer needs only a browser. Repository attribution was resolved by **checking that
the cited path exists in that checkout**, never by inferring from a finding-id prefix.

Re-derive the resolution locally:

```bash
# a citation resolves iff the file exists in exactly one frozen checkout
test -f hermes-agent/agent/memory_provider.py && echo "hermes"
test -f honcho/src/crud/document.py           && echo "honcho"
test -f tailered-ai/src/ship.ts               && echo "tailered"
```

Resolution statistics for the canonical ledger: **1,579 citations resolved** to permalinks,
82 unresolved (left as plain text rather than guessed), and **51 absolute local paths
rejected outright** — absolute paths are never valid citations, because a naive path join
would silently discard the repository root and resolve them against the wrong repo.

## 7. What cannot be reproduced, and why

| Item | Blocker |
|---|---|
| Running Hermes | Requires installing its dependency tree and a provider key; it publishes **no wheel or sdist** ([`setup.py`](https://github.com/NousResearch/hermes-agent/blob/ed5e17f4b86da0c4f09c0694757b6074ae6b9d16/setup.py) raises on `bdist_wheel`/`sdist`) |
| Running Honcho | Requires PostgreSQL 15 + pgvector, an LLM key, and an embedding provider |
| Upstream benchmarks | Datasets are gitignored, no result files, no CI job; judges require paid inference |
| Cost per workflow | Requires the two above |

These are recorded as `BLOCKED` throughout, never estimated. No efficiency claim and no
upstream benchmark number appears anywhere in this audit.

## 8. Regenerating the evidence ledger

The canonical ledger is generated from the structured lane outputs. The generator:

1. de-duplicates lanes by first-finding id and findings by id;
2. partitions canonical (upstream) findings from out-of-scope provenance;
3. resolves each citation against the frozen checkouts and emits a permalink **only** when
   the file genuinely exists there;
4. rejects absolute paths and scrubs any local URI;
5. sorts by severity, then id.

See [24-audit-manifest.md](24-audit-manifest.md) for the artifact inventory and integrity
statement.
