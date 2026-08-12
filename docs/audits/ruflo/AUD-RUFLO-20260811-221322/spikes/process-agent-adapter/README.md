<!-- audit: {"audit_id":"AUD-RUFLO-20260811-221322","tailered_sha":"6172653e0aca0981d0abaf4ad8e9d587667737e9","ruflo_release":"v3.37.0","ruflo_sha":"6ce18b5a7fcd4939a2f72c2e3b8fdbdec660e5a9","generated":"2026-08-11T23:00:00Z","evidence_class":"VERIFIED","lane":"AUD-L7a","caused_by":["AUD-RUFLO-20260811-221322/01-audit-charter.md"]} -->

# Spike A — process-agent adapter

Experimental spike code. **Nothing here is a Tailered runtime file**; no file outside this
directory was created or modified by this lane. The narrative and findings live in
`../../13-integration-spikes.md`.

## What this is

A minimal Tailered process agent: one JSON `AgentRequest` on stdin, exactly one JSON
`AgentResponse` on stdout, diagnostics on stderr. It exists to test the *boundary*, not model
quality — no credentials exist in the audit containers, so the default engine is a deterministic
local mock and every model-dependent claim is labelled `INFERRED`.

```
adapter.mjs                       the agent binary
lib/tokens.mjs                    measured token counting + pinned price table
lib/payload-guard.mjs             normalising path confinement, whole-file checks
lib/mock-engine.mjs               deterministic stand-in for a provider call
lib/ruflo-engine.mjs              runs a REAL ruflo invocation under containment
lib/ruflo-argv.mjs                the MCP-mode predicate and the safe argv builder
harness/run-boundary-tests.mjs    27 adversarial cases against the REAL ProcessAgent
harness/fixtures/*.mjs            hostile agent binaries (one failure mode each)
experiments/orphan/               decisive experiment 1 — orphaned grandchildren
experiments/mcp-trap/             decisive experiment 2 — MCP mode, CWD hazard, containment
experiments/probe-abort-mechanism.mjs   isolates the abort-after-exit behaviour
results/                          recorded outputs from every run
```

## Invariants the adapter enforces, and how

| Requirement | Mechanism | Evidence |
| --- | --- | --- |
| read-only context snapshot | snapshot materialised into `mkdtemp` at 0444/0555 | `B7` refuses an escaping snapshot path |
| never mutate the repository | the repo path is never passed in; engine cwd is the sandbox | `A3`, `CONTAIN-1` (repo hash unchanged) |
| output size limit | response measured, refused above `--max-output-bytes` (4 MB < Tailered's 5 MB) | fail-closed at `adapter.mjs` exit 69 |
| timeout | `--deadline-ms` fires before Tailered's `timeoutMs` | `ORPHAN-3` (2 601 ms under a 20 000 ms Tailered timeout) |
| terminate ALL children | children spawned `detached`; `kill(-pgid, SIGKILL)` on deadline and on SIGTERM | `ORPHAN-3` (0 heartbeats after deadline, empty `ps`) |
| actual model identity | reported by the engine that ran, not echoed from the request | `A4` (`mock-mid-1.0` ≠ `mid-available`) |
| actual provider identity | same | `A4` (`local.mock`) |
| measured token usage | counted from the real request and response bytes | `A1` (input 261 / output 236) |
| measured cost | pinned table over measured tokens, rounded to whole micro-USD | `A1` (`0.000433`) |
| complete file proposals | placeholder/elision/truncation patterns rejected; zero-file codegen rejected | `J1` |
| no hidden state | writes confined to the mkdtemp, removed at exit; no clock or randomness in the payload | `A2` (byte-identical responses) |

## Running it

Everything runs in `docker run --rm`. No host `$HOME` or credential path is ever mounted.

```bash
AUD=/tmp/aud-ruflo-20260811
SPIKE=$AUD/tailered-ai-audit/docs/audits/ruflo/AUD-RUFLO-20260811-221322/spikes/process-agent-adapter
mkdir -p $AUD/work/lane-L7a/{repo,out,home}
rsync -a --exclude node_modules --exclude dist --exclude .git --exclude docs/audits \
  $AUD/tailered-ai-audit/ $AUD/work/lane-L7a/repo/

# 27-case adversarial boundary suite
timeout 300 docker run --rm -i \
  -v $AUD/tailered-ai-audit:/tailered:ro -v $SPIKE:/spike:ro \
  -v $AUD/work/lane-L7a/repo:/repo -v $AUD/work/lane-L7a/out:/out \
  -v $AUD/work/lane-L7a/home:/root -w /out -e HOME=/root \
  -e TAILERED_DIST=/tailered/dist/src -e SPIKE_DIR=/spike -e REPO_DIR=/repo -e OUT_DIR=/out \
  node:24 node /spike/harness/run-boundary-tests.mjs

# decisive experiment 1 — orphaned grandchildren
timeout 300 docker run --rm -i \
  -v $AUD/tailered-ai-audit:/tailered:ro -v $SPIKE:/spike:ro \
  -v $AUD/work/lane-L7a/out:/out -v $AUD/work/lane-L7a/home:/root -w /out -e HOME=/root \
  -e TAILERED_DIST=/tailered/dist/src -e SPIKE_DIR=/spike -e OUT_DIR=/out \
  node:24 node /spike/experiments/orphan/run-orphan.mjs

# decisive experiment 2 — MCP-mode trap (add -v $AUD/work/install-default:/rf:ro
# and -e RUFLO_BIN=/rf/node_modules/ruflo/bin/ruflo.js)
node /spike/experiments/mcp-trap/run-mcp-trap.mjs
node /spike/experiments/mcp-trap/run-init-as-agent.mjs      # ruflo init AS an agent
node /spike/experiments/mcp-trap/run-contained-ruflo.mjs    # the same, contained
```

The harness deliberately runs the **real** `ProcessAgent`, `ReserveSettleBudget`,
`resolveRepoPath`, `writeAtomic` and `hashDirectory` from `/tailered/dist/src`. Ruflo verifying
Ruflo — or the adapter verifying itself — would not be evidence, so every postcondition is read
back independently: repository hashes, filesystem inventories, `ps` output, and heartbeat
timestamps written by the process under test to a file the driver reads afterwards.

`/rf` (the shared 1.5 GB install) is always mounted **read-only**. The lane never writes to it.

## Safe argv (the one line that matters)

`ruflo` becomes an MCP stdio server when stdin is not a TTY — which it never is under
`ProcessAgent` — and argv is empty or begins with `mcp`. Any adapter that shells out to ruflo
must therefore build argv through `safeRufloArgv()`, which refuses both shapes:

```js
safeRufloArgv("swarm", ["run", "--json"]);   // ["swarm","run","--json"]
safeRufloArgv("mcp", ["start"]);             // throws
```
