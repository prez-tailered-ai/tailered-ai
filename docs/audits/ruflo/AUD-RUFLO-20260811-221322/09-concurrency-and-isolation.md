<!-- audit: {"audit_id":"AUD-RUFLO-20260811-221322","tailered_sha":"6172653e0aca0981d0abaf4ad8e9d587667737e9","ruflo_release":"v3.37.0","ruflo_sha":"6ce18b5a7fcd4939a2f72c2e3b8fdbdec660e5a9","generated":"2026-08-11T23:00:00Z","evidence_class":"MIXED","lane":"AUD-L4b","caused_by":["AUD-RUFLO-20260811-221322/01-audit-charter.md"]} -->

# 09 — Concurrency, Isolation, and Worktree Behavior

Lane **AUD-L4b**. Question: is Ruflo's isolation **enforced by code** or **recommended by docs**?

**Answer: both, unevenly, and the one mechanism Tailered would actually depend on is the broken one.**

Ruflo contains genuinely competent concurrency engineering — atomic `O_EXCL` lockfiles, temp-write-then-rename,
TTL expiry, PID liveness checks, a repository-vs-worktree identity split, and a repository-level supervisor
election. That machinery is real, reachable, and empirically effective. It is confined almost entirely to the
**background daemon**. The surfaces an orchestrator would use to divide work between agents — **issue claims**
and **memory** — carry none of it. Issue claims, the single explicit-ownership primitive in the product, use an
unlocked read-modify-write over a non-atomic whole-file rewrite, and lose claims under trivial concurrency while
reporting success.

Everything below was run in `docker run --rm` containers against `/tmp/aud-ruflo-20260811/work/install-default`
(the default install, native `better-sqlite3`). Every material postcondition was verified **independently** —
by direct `sqlite3` read of a copy of the database, by host-side `docker top`, or by reading the persisted JSON —
never by Ruflo reporting on itself.

---

## 1. Headline results

| # | Test | Result | Class |
|---|---|---|---|
| 1 | Two processes reading one repository | Both succeed, no contention | OK |
| 2 | Concurrent writes, **different** memory keys | 3/3 persisted, no loss | OK |
| 3 | Concurrent writes, **same** memory key | Last-writer-wins, **no tearing**, winner non-deterministic | OK-ish |
| 4 | Two processes on one memory DB | No corruption; `integrity_check` = `ok` | OK |
| 5 | `memory store` process stability | **Aborts (SIGABRT) ~1-in-6 with no contention at all** | **HIGH** |
| 6 | Separate projects | Isolation **holds** (CWD-keyed) | OK |
| 7 | Separate namespaces | `retrieve` scoped; **`search`/`list` leak across namespaces by default** | MEDIUM |
| 8 | Simultaneous `daemon start` ×5, one namespace | **Exactly one survivor** — lock works | OK |
| 9 | Simultaneous daemons, **two containers, one shared repo** | **Two live daemons**, both believe they own it | **HIGH** |
| 10 | Crash (SIGKILL) mid-write | Write cleanly lost, DB intact, no torn state | OK |
| 11 | Worktree isolation | Real, but **not reachable from `ruflo`** | MEDIUM |
| 12 | Worktree cleanup | Worktrees removed, **branches leak permanently** | MEDIUM |
| 13 | **Concurrent issue claims (different issues)** | **6/6 report success, 3/6 persist — overlapping ownership** | **CRITICAL** |
| 14 | Claim expiration | `expireStale()` is **dead code**; claims never expire | HIGH |

---

## 2. CRITICAL — Concurrent issue claims are silently lost, producing overlapping ownership

`ruflo issues claim` is the only explicit ownership primitive Ruflo ships (ADR-016, "Collaborative Issue Claims
for Human-Agent Workflows"). It is exactly the mechanism Tailered would use to stop two agents working the same
unit of work. It does not hold under concurrency.

### 2.1 Reproduction

Six agents claim six **different** issues concurrently (no logical conflict — all six should trivially succeed):

```
###### 6 agents claim 6 DIFFERENT issues CONCURRENTLY
a1 issue301 EXIT=0      a1: Claimed issue 301
a2 issue302 EXIT=0      a2: Claimed issue 302
a3 issue303 EXIT=0      a3: Claimed issue 303
a4 issue304 EXIT=0      a4: Claimed issue 304
a5 issue305 EXIT=0      a5: Claimed issue 305
a6 issue306 EXIT=0      a6: Claimed issue 306

###### COUNT of claims persisted (expected 6)
3
###### which issue ids survived
"issueId": "301"   "issueId": "303"   "issueId": "306"
```

**All six processes printed `[OK] Claimed issue 30X` and exited 0. Three claims never existed.**
Agents a2, a4 and a5 are now executing work they do not own, and no record says so.

Reproducible — two further independent trials:

```
TRIAL 1: processes_reporting_success=6  claims_persisted=4  LOST=2
TRIAL 2: processes_reporting_success=6  claims_persisted=3  LOST=3
```

### 2.2 The consequence, proven

A lost claim does not merely vanish — it frees the issue for a second claimant while the first still believes it
holds an exclusive claim:

```
###### [OVERLAP PROOF] pick a LOST issue, claim it with a DIFFERENT agent
surviving: 404 403 401 405
LOST issue chosen: 402       (agent a2 reported "[OK] Claimed issue 402", exit 0)
$ ruflo issues claim 402 --agent coder:INTRUDER
[OK] Claimed issue 402
--- final claims.json owner of 402 ---
      "issueId": "402",
      "claimant": { "type": "agent", "agentType": "coder", "agentId": "INTRUDER" },
```

**Two agents, one issue, both told they own it exclusively.** This is precisely the "dirty merges, overlapping
ownership" failure Tailered's bounded-parallelism requirement exists to prevent.

### 2.3 Root cause — file:line

`v3/@claude-flow/cli/src/services/claim-service.ts`:

```
265:  async claim(issueId: string, claimant: Claimant): Promise<ClaimResult> {
267:    const existing = this.claims.get(issueId);     // reads PROCESS-LOCAL Map, not the file
285:    this.claims.set(issueId, claim);
286:    await this.saveClaims();

252:  private async saveClaims(): Promise<void> {
258:    fs.writeFileSync(claimsFile, JSON.stringify(data, null, 2));   // whole-file, non-atomic, unlocked
```

Three compounding defects in four lines:

1. **The conflict check reads process-local state.** `this.claims` was loaded at construction. A claim made by
   another process after that load is invisible, so the "already claimed" guard cannot see a competitor.
2. **No lock.** There is no `O_EXCL` lockfile, no advisory lock, no compare-and-swap. Nothing serialises the
   read-modify-write.
3. **The write is a whole-file overwrite, not atomic.** `writeFileSync` directly onto the live path — not
   temp-write-then-rename. Every writer serialises its *entire* view of the world, so the last writer erases
   every claim made concurrently by anyone else. That is the lost-update mechanism observed above; it is also a
   torn-file risk if a writer is interrupted mid-`write`.

**Ruflo already has the correct pattern in-tree and does not use it here.** `services/workspace-lease.ts:92-119`
implements a proper `O_EXCL` lock with stale-lock reclamation, and `:136-142` writes via
`writeFileSync(tmp)` → `renameSync(tmp, file)`. `claim-service.ts` uses neither.

> `VERIFIED:` Concurrent `ruflo issues claim` on distinct issues silently discards claims while reporting
> success, and the discarded issue is subsequently claimable by a different agent, yielding two agents that each
> believe they hold an exclusive claim. Reproduced 3/3 trials.
> Evidence: `work/lane-L4b/logs/t14-claimlost.log`, `logs/t15-confirm.log`, `t14/out/claims.json`.

Per the audit charter — **reported success with no durable postcondition ⇒ CRITICAL.**

---

## 3. HIGH — Claims never expire (`expireStale()` is dead code)

`claim-service.ts` defines a complete expiry model: `expiresAt` (`:50`), `staleThresholdMinutes: 30` (`:161`),
`StealReason = 'stale'` (`:40`), and:

```
686:  async expireStale(maxAgeMinutes?: number): Promise<IssueClaim[]> {
```

A whole-tree grep for callers returns **exactly one line — the definition itself**:

```
$ grep -rn "expireStale" --include="*.ts" .
services/claim-service.ts:686:  async expireStale(maxAgeMinutes?: number): Promise<IssueClaim[]> {
```

`expiresAt` is likewise never assigned — it appears only in the interface (`:50`) and in deserialization
(`:243`, `if (claim.expiresAt) claim.expiresAt = new Date(...)`). No CLI subcommand invokes expiry
(`ruflo issues` exposes `list/claim/release/handoff/status/stealable/steal/load/rebalance/board`).

**An agent that crashes while holding a claim holds it forever.** Recovery requires a human running
`ruflo issues release`. There is no TTL, no heartbeat, and no liveness check on a claimant — unlike the daemon
lease path, which has all three.

> `VERIFIED:` Claim expiration is IMPLEMENTED but never REACHABLE. Same dead-code shape as the postinstall's
> `augmentExports` documented in the charter.

---

## 4. HIGH — `ruflo memory store` aborts non-deterministically, with and without contention

Under concurrency I first observed 3 of 6 same-key writers dying with `EXIT=134` (SIGABRT):

```
###### 6 concurrent SAME-KEY writers
1 EXIT=134   2 EXIT=0   3 EXIT=0   4 EXIT=0   5 EXIT=134   6 EXIT=134
###### failure modes seen
      3 Assertion failed
```

The abort is a native assertion in the SQLite binding's destructor, not a SQLite error:

```
#  node[26]: void node::RemoveEnvironmentCleanupHook(...) at ../src/api/hooks.cc:142
#  Assertion failed: (env) != nullptr
 3: Statement::~Statement() [/rf/node_modules/agentdb/node_modules/better-sqlite3/build/Release/better_sqlite3.node]
```

**I ran a control before attributing this to concurrency, and the control refutes the simple story.** Six
*sequential* same-key stores, zero contention:

```
###### 6 SEQUENTIAL same-key stores (control: no contention)
seq1..seq5 EXIT=0
seq6 EXIT=134
```

Observed rates in this lane:

| Condition | Aborted |
|---|---|
| Sequential, no contention | 1 / 6 |
| Concurrent, different keys | 0 / 3 |
| Concurrent, same key | 4 / 9 |
| `memory init`, single process | 1 / 1 (exit 133) |

> `VERIFIED:` `ruflo memory store` aborts with SIGABRT at a non-zero baseline rate **with no concurrency
> whatsoever** (1/6). This is a stability defect, not solely a concurrency defect.
> `INFERRED:` Same-key contention raises the rate (4/9 vs 1/6). Sample is small; directionally consistent across
> two independent runs but not established with confidence.

Notably, `ruflo memory init` also aborted (exit 133) while still leaving a **usable** database plus `-wal`/`-shm`
sidecars — a failure exit code over a partially-successful postcondition. Subsequent `memory store` calls against
that database succeeded. Both directions of the reported-status/actual-state mismatch are present in this command
family.

**No data was corrupted by any abort.** Independent verification after the 6-way crash run:

```
$ sqlite3 <copy> "pragma integrity_check;"   → ok
$ sqlite3 <copy> "pragma quick_check;"       → ok
$ sqlite3 <copy> "select key,length(content),substr(content,1,14) ..."
baseline|5|hello
hot|123|w2-22222222222      ← intact, single writer's value, no interleaving
```

SQLite's own guarantees hold. The damage is process-level (agents die mid-task), not storage-level.

**Contributing factor:** the main memory schema sets `journal_mode=WAL`, `synchronous=NORMAL`,
`foreign_keys=ON` (`memory/memory-initializer.ts:223-225`) but **no `busy_timeout`**. Two files in the tree do
set one — `memory/graph-edge-writer.ts:105` (`busy_timeout = 5000`, commented "wait up to 5s on lock
contention") and `business-pods/bbs-budget-tracker.ts:87` (`500`) — so the omission on the primary write path is
an inconsistency, not a house style. Without it, a busy database fails immediately rather than waiting.

---

## 5. HIGH — Daemon mutual exclusion is PID-based and does not survive a namespace boundary

### 5.1 Within one PID namespace, the lock genuinely works

Five concurrent `ruflo daemon start` against one project directory:

```
=== spawn exits ===        1..5 all EXIT=0
=== pidfile ===            61
=== LIVE daemon processes (independent ps) ===
   61  node .../cli.js daemon start --foreground --quiet --workspace /work/proj
```

**Exactly one daemon**, verified by `ps` rather than by Ruflo's own status output. The implementation is sound
(`commands/daemon.ts:155-158`): an `O_EXCL` lockfile at `.claude-flow/daemon.lock` held across the *entire*
spawn lifecycle, with a 5s wait-and-recheck for losers and stale-lock reclamation. The source comments cite the
real incidents that motivated it ("39 zombie daemons holding ~8.5 GiB → kernel panic"; "4 identical daemons per
Claude Code session"). `killStaleDaemons` is correctly workspace-scoped (`daemonCommandLineBelongsToWorkspace`,
ADR-014/#1914), so it will not reap another project's daemon.

All five callers exit 0, though only one started anything — a benign but real false-positive exit code.

### 5.2 Across namespaces it fails

Two containers, one bind-mounted project directory, both running `daemon start`. Observed **from the host**, so
neither container is reporting on itself:

```
=== HOST-SIDE OBSERVATION (docker top, both containers) ===
--- container l4b8-A:
15433   node .../cli.js daemon start --foreground --quiet --workspace /repo
--- container l4b8-B:
15419   node .../cli.js daemon start --foreground --quiet --workspace /repo
=== pidfile on host ===
19
```

**Two distinct daemon processes** (host PIDs 15433 and 15419) supervising the same directory and the same memory
database. The pidfile holds `19` — a namespace-local PID matching neither, and meaningful only inside whichever
container wrote it.

The cause is structural, and it is the same line in every coordination service: liveness is
`process.kill(pid, 0)`.

| Service | Liveness / TTL | file:line |
|---|---|---|
| Workspace lease | `isProcessAlive(l.pid)` + `LEASE_TTL_MS = 15 min` | `workspace-lease.ts:184`, `:28` |
| Repo supervisor | `isProcessAlive(record.pid)` + `SUPERVISOR_STALE_MS = 3 min` | `repo-supervisor.ts:149`, `:39` |
| Global AI budget | `isProcessAlive(a.pid)` + `ACTIVE_STALE_MS = 30 min` | `global-ai-budget.ts:428`, `:89` |
| Daemon dedup | `isProcessRunning(bgPid)` | `commands/daemon.ts` (dedup block) |

A PID is only meaningful within one PID namespace. Every one of these degrades to a **time-only** check across
containers, VMs, or hosts — and worse, can produce a **false "alive"** when an unrelated local process happens to
hold the recorded number.

The registries themselves live in `$HOME/.claude-flow/{leases,supervisors}/<repositoryId>.json`, keyed by
`repositoryId = sha256("git:" + realpath(git --git-common-dir))` (`git-workspace-identity.ts:92`). Two containers
with separate `$HOME`s therefore never even see each other's registry — a second, independent reason the
supervisor election cannot deduplicate across them.

> `VERIFIED:` Daemon single-instance holds within a PID namespace and fails across PID namespaces sharing one
> project directory. Confirmed by host-side `docker top`.
> `INFERRED:` The same failure applies to two hosts sharing a checkout over NFS/SMB, and to two VMs — the
> mechanism (namespace-local PID + `$HOME`-local registry) is identical. Not directly tested; no multi-host
> fixture was available and none was created (charter forbids touching external systems).

---

## 6. Memory isolation — real between projects, leaky between namespaces

### 6.1 Between projects: holds

Memory is keyed to the working directory — `path.resolve(process.cwd(), '.swarm')` then `memory.db`
(`memory/memory-bridge.ts:79`, overridable via `claude-flow.config.json` `memory.persistPath`). Storing a secret
in project A and searching from project B:

```
###### [ISO-6] CROSS-PROJECT: search projA secret from projB
[WARN] No results found
###### [ISO-7] CROSS-PROJECT list from projB
| baseline | default | 5 B |      ← only projB's own entry
```

> `VERIFIED:` Cross-project memory isolation holds.

The caveat is what "project" means: it is **CWD**, not repository, not agent, not run. Two Tailered agents
working in the same checkout share one memory database with no partition between them. Isolation between
*agents* is zero by construction.

### 6.2 Between namespaces: `search` and `list` leak by default

`retrieve` is namespace-scoped and safe. `search` and `list` are not:

```
###### [ISO-1] search from ns=teamB WITHOUT --namespace (default)
+--------+-------+-----------+-------------------------+
| Key    | Score | Namespace | Preview                 |
| apikey |  0.97 | teamA     | SECRET_TEAM_A_TOKEN_XYZ |   ← teamA's secret, returned to a teamB caller

###### [ISO-2] search explicitly scoped -n teamB
[WARN] No results found                                    ← boundary works when asked for

###### [ISO-3] memory list (no ns)
| note     | teamB   |    ← all namespaces, including teamA
| apikey   | teamA   |
| baseline | default |

###### [ISO-4] retrieve apikey with WRONG namespace teamB
[WARN] Key not found: apikey                               ← retrieve IS scoped by default
###### [ISO-5] retrieve apikey with NO namespace
[WARN] Key not found: apikey
```

Source: `memory/memory-bridge.ts:1061` — `const effectiveNamespace = namespace || 'all';`. The default is
**all namespaces**, and it differs from `retrieve`, which defaults to `'default'`.

> `VERIFIED:` A namespace is a *filing* convention, not a default confidentiality boundary. It becomes one only
> when every caller passes `--namespace` on every `search` and `list`. The inconsistency between `retrieve`
> (scoped) and `search`/`list` (unscoped) makes this a trap rather than a documented trade-off.

### 6.3 No ownership on memory records

`memory_entries` has an `owner_id TEXT` column and an index on it
(`memory-initializer.ts:247`, `:278`; `memory-bridge.ts:612`). It is never written. A grep for `owner_id` across
the source returns only schema definitions, the index, and a migration entry — **no INSERT or UPDATE**.

Independently confirmed across every database this lane produced:

```
=== owner_id / provenance population across all test DBs ===
baseline|<NULL>|unknown|<NULL>
key-1|<NULL>|unknown|<NULL>
apikey|<NULL>|unknown|<NULL>
...                    owner_id | provenance_type | expires_at
```

Every row: `owner_id` NULL, `provenance_type` `'unknown'`, `expires_at` NULL — despite ADR-323 defining a
five-value provenance enum specifically so shared-namespace retrieval can distinguish a user's claim from an
agent's own output. The CLI write path populates none of it.

> `VERIFIED:` Memory entries carry no owner, no usable provenance, and no expiry. There is no way to ask "which
> agent wrote this?" or "is this stale?" of Ruflo's memory.

---

## 7. Worktree isolation — real code, wrong package, unreachable from `ruflo`

Ruflo advertises git-worktree isolation for agents. The implementation exists and works. It is **not reachable
from the `ruflo` CLI**.

### 7.1 Reachability

- `ruflo --help` exposes `agent`, `swarm`, `hive-mind`, `autopilot`, `route`, `issues` — **no `worktree`
  command**.
- The main CLI's compiled `dist` mentions "worktree" in 16 files but **never invokes `git worktree add`**. Its
  worktree code only *observes* worktrees (identity, leases, dedup, budget).
- Creation lives solely in `CodexWorktreeCoordinator`, shipped in a **different package**, `@claude-flow/codex`
  (v3.0.3), nested at `node_modules/@claude-flow/cli/node_modules/@claude-flow/codex`.
- Its binary `claude-flow-codex` is **not linked into the top-level `node_modules/.bin`**. The only references to
  the package in the main CLI are in `commands/init.js`, which merely *suggests installing it*
  (`npm install @claude-flow/codex && ruflo init --codex`).

> `VERIFIED:` Worktree isolation is **PACKAGED but not REACHABLE** from a standard `npm i ruflo` + `ruflo`
> workflow. Reaching it requires invoking a nested, unlinked binary by path.

### 7.2 It works when invoked directly

```
$ claude-flow-codex worktree prepare run1 --agents a1,a2 --read-only r1
{ "runId": "run1", "assignments": [
    { "agentId":"a1", "branch":"ruflo/run1/a1", "path":"/work/.ruflo-worktrees/repo/run1/a1", "readOnly":false },
    { "agentId":"a2", "branch":"ruflo/run1/a2", ... },
    { "agentId":"r1", "branch":"",              ... "readOnly":true } ] }

$ git worktree list
/work/repo                           a06013f [main]
/work/.ruflo-worktrees/repo/run1/a1  a06013f [ruflo/run1/a1]
/work/.ruflo-worktrees/repo/run1/a2  a06013f [ruflo/run1/a2]
/work/.ruflo-worktrees/repo/run1/r1  a06013f (detached HEAD)
```

Real worktrees, per-agent branches, read-only agents correctly detached. The registry record is written
atomically (temp + `renameSync`, `coordinator.ts:148-152`) and `status()` validates that no registry path escapes
the owned worktree root (`:106-112`). This is careful code.

### 7.3 Four defects

**(a) Worktrees are created outside the repository.**

```
44:  this.worktreeBase = join(dirname(this.repoRoot), '.ruflo-worktrees', basename(this.repoRoot));
```

For a repo at `/Users/x/src/tailered-ai`, agent worktrees land in `/Users/x/src/.ruflo-worktrees/tailered-ai/`
— a **sibling of the repository**, outside any repo boundary, unreachable by the repo's `.gitignore`, invisible
to repo-scoped tooling, backups, and cleanup, and writing into a directory the repo does not own.

**(b) `prepare` poisons its own precondition.** The registry is written *inside* the repo
(`:43`, `.claude-flow/swarm/worktrees/`) while `:62` refuses to run against a dirty tree:

```
62:  if (!options.allowDirty && git(this.repoRoot, ['status','--porcelain']).length > 0) {
       throw new Error('refusing to prepare writing worktrees from a dirty repository');
```

Observed directly — a first successful `prepare` created `.claude-flow/`, after which **every** subsequent
`prepare` failed:

```
###### 3x CONCURRENT prepare (after a prior successful prepare)
1 EXIT=1  2 EXIT=1  3 EXIT=1
Error: refusing to prepare writing worktrees from a dirty repository
```

Unless `.claude-flow/` is gitignored or committed, `prepare` is a one-shot operation.

**(c) `cleanup` leaks branches permanently.** With `.claude-flow/` gitignored, prepare→cleanup round-trips
cleanly *except* for branches:

```
$ claude-flow-codex worktree cleanup shared
{ "removed": ["c1","c2"], "retained": [] }

###### after cleanup: worktree list + disk + branches
/work/repo  af24f60 [main]         ← worktrees gone
(empty dir)                        ← directories gone
  ruflo/shared/c1                  ← BRANCHES REMAIN
  ruflo/shared/c2
```

`cleanup` (`:128-142`) calls `git worktree remove` and unlinks the registry record; there is **no
`git branch -d`** anywhere in the file. Every run leaks one branch per writing agent, forever, carrying unmerged
agent commits. For Tailered, N runs × M agents accumulates unbounded refs in the company repository, each a
silent divergence no process will ever reconcile.

**(d) `integrate()` has no conflict handling.**

```
122:  git(this.repoRoot, ['merge', '--no-ff', '--no-edit', assignment.branch]);
```

A sequential loop of `git merge` with no conflict detection, no `--abort` path, and no transaction. The first
conflicting branch throws out of the loop, leaving the repository **in a conflicted merge state** with earlier
agents' branches already merged and later ones not. Partial integration plus a dirty index is exactly the "dirty
merge" outcome Tailered's invariants forbid, and recovery is manual.

### 7.4 Concurrent `prepare` — safe, but not by Ruflo's doing

Three concurrent `prepare` calls with the **same** runId:

```
1 EXIT=0    ← won
2 EXIT=1    Error: Command failed: git -C /work/repo worktree add -b ruflo/shared/c1 ...
3 EXIT=1    Error: Command failed: git ... worktree add -b ruflo/shared/c1 ...

###### AFTER RACE
/work/.ruflo-worktrees/repo/shared/c1   [ruflo/shared/c1]     ← winner's worktrees intact
/work/.ruflo-worktrees/repo/shared/c2   [ruflo/shared/c2]
```

No cross-process destruction, and the registry matched reality. **But the mutual exclusion came from `git`, not
from Ruflo** — `prepare()` holds no lock. Its `existsSync(registryPath)` early-return (`:59`) is a
check-then-act with a wide window; safety here rests entirely on git refusing to create a second worktree at an
existing path or a duplicate branch. The rollback path (`:90-95`) removes only assignments the failing process
itself recorded, so it did not delete the winner's work in this ordering.

> `VERIFIED:` No cross-process worktree destruction observed. `INFERRED:` The guarantee is inherited from git's
> atomicity, not implemented by Ruflo; it therefore holds for identical runId+agentId collisions and says nothing
> about coordination between *different* runs.

---

## 8. Crash and shutdown behavior

**Crash during write (SIGKILL mid-`memory store`):** clean. The process died (exit 137), the in-flight write was
lost entirely, and the database was left consistent — no partial row, no torn content. Ruflo could still read it
afterwards, and independent `integrity_check`/`quick_check` both returned `ok`. WAL sidecars remained on disk,
which is normal and non-fatal.

**Crash during checkpoint / abort during teardown:** the SIGABRT class in §4 fires *inside* the SQLite
statement destructor — i.e. during teardown, after the commit. Storage stayed intact across every abort observed.

**Stale locks:** the daemon lock has real reclamation — a loser waits up to 5s re-checking the PID file, then
unlinks the stale lockfile and proceeds, with `killStaleDaemons` as a backstop (`commands/daemon.ts:166-180`).
Locks do **not** persist forever. Every lock in the tree carries a stale threshold: `workspace-lease` 10s,
`repo-supervisor` 10s, `global-ai-budget` 10s, `policy-runtime` 30s, `flywheel-transaction` 60s,
`harness-flywheel-generations` 60s. The daemon itself self-terminates after `DEFAULT_DAEMON_TTL_MS = 12h`
(`worker-daemon.ts:185`).

The exception is claims (§3), which have no expiry at all.

---

## 9. Undeclared background daemon on ordinary commands

Every `memory store` and `memory search` invocation in this lane printed:

```
[INFO] Started Ruflo background daemon for /work/proj (stop: ruflo daemon stop)
```

A read/write memory command **spawns a persistent background process** as a side effect. In the 3-way concurrent
runs all three writers printed it — yet §5.1 proves only one daemon can survive the lock. The message is emitted
at *spawn* time by the best-effort autostart path (`services/daemon-autostart.ts`), before the spawned process
resolves the dedup race, so it is printed by processes that started nothing.

> `VERIFIED:` "Started Ruflo background daemon" is a false self-report — it is printed by every caller
> regardless of whether that caller's daemon survived. Consistent with the charter's other false self-reports
> (`init` reporting 111 files of 255, "7 hook types" of 10).

For Tailered this also means: any container or CI job that runs a single `ruflo memory` command leaves a
long-lived (12h TTL) background process behind unless explicitly stopped.

---

## 10. The six identity requirements

Tailered needs explicit ownership, task identity, branch identity, worktree identity, run identity, and
expiration per worker. What Ruflo actually provides:

| # | Requirement | Provided? | Evidence |
|---|---|---|---|
| 1 | **Explicit ownership** | **NO — present but broken** | `claim-service.ts:265-286` claims are unlocked read-modify-write over non-atomic `writeFileSync` (`:258`); 3/6 lost, overlapping ownership proven (§2). Memory has an `owner_id` column that is **never written** (`memory-initializer.ts:247`, no INSERT anywhere). |
| 2 | **Task identity** | **PARTIAL** | `issueId` in claims (unreliable per §2). `computeAiJobKey = sha256(repositoryId, head, workerType, workerConfigHash)` (`ai-job-dedup.ts:47`) is real but is a *freshness/dedup* key for the daemon's own recurring workers — `isFresh()`/`recordSuccess()`, not a claim. No task identity on memory writes. |
| 3 | **Branch identity** | **PARTIAL** | `ruflo/<runId>/<agentId>` assigned per writing agent (`coordinator.ts:71`) — but only in `@claude-flow/codex`, unreachable from `ruflo` (§7.1), and branches are never cleaned up (§7.3c). Absent from the main CLI entirely. |
| 4 | **Worktree identity** | **YES** | `git-workspace-identity.ts:70-101` — `worktreeRoot`, `commonGitDir`, `repositoryId = sha256("git:"+realpath(commonGitDir))` (`:92`), `head`. Correctly separates per-worktree from per-repository identity, canonicalises symlinked prefixes (`:107-113`), degrades gracefully for non-git dirs. Genuinely good. |
| 5 | **Run identity** | **PARTIAL** | `WorktreeRunRecord.runId` (`coordinator.ts:16-20`) — codex-only, unreachable from `ruflo`. **No run id on memory entries, claims, or daemon jobs.** Nothing correlates a set of writes to one execution. |
| 6 | **Expiration per worker** | **PARTIAL** | Real for daemons: lease TTL 15 min (`workspace-lease.ts:28`), supervisor stale 3 min (`repo-supervisor.ts:39`), budget stale 30 min, daemon TTL 12h. **Zero for claims** — `expireStale()` never called (§3). All expiry pairs time with `process.kill(pid,0)`, which is namespace-local (§5.2). |

**Score: 1 of 6 fully provided (worktree identity), 4 partial, 1 broken.**

The one Tailered most needs — explicit ownership — is the one that fails, and it fails silently while reporting
success.

---

## 11. Capability maturity levels established

| Capability | Level reached | Blocking evidence |
|---|---|---|
| Concurrent memory writes, distinct keys | **EFFECTIVE** | 3/3 persisted, independently read back |
| Cross-project memory isolation | **EFFECTIVE** | projB cannot see projA's secret |
| Storage integrity under crash + contention | **EFFECTIVE** | `integrity_check`=ok after 3 aborts + 1 SIGKILL |
| Daemon single-instance (one PID namespace) | **EFFECTIVE** | 5 starts → 1 survivor, verified by `ps` |
| Daemon lock stale reclamation / TTLs | **EFFECTIVE** | O_EXCL + 5s recheck + `killStaleDaemons`; 12h TTL |
| Worktree/repository identity split | **EFFECTIVE** | `git-workspace-identity.ts` |
| Namespace isolation | **REACHABLE** — not effective as a default | `search`/`list` default to all namespaces (`memory-bridge.ts:1061`) |
| Daemon single-instance (across namespaces/hosts) | **REACHABLE** — fails | Two live daemons, one repo (host `docker top`) |
| `memory store` process stability | **REACHABLE** — not effective | 1/6 SIGABRT with zero contention |
| Worktree isolation (create/cleanup) | **PACKAGED** — not reachable | No `ruflo worktree`; nested unlinked binary only |
| Explicit ownership via claims | **REACHABLE** — not effective | 3/6 claims silently lost; overlap proven |
| Claim expiration | **IMPLEMENTED** — never reachable | `expireStale()` has zero callers |
| Memory record ownership / provenance | **IMPLEMENTED** — never reachable | `owner_id` never written; provenance always `unknown` |

**Nothing in this lane reached DURABLE or GOVERNABLE.**

---

## 12. Findings

| ID | Sev | Summary |
|---|---|---|
| RUF-440 | **CRITICAL** | Concurrent `issues claim` on distinct issues: all callers report `[OK] Claimed` + exit 0, but 2-3 of 6 claims are silently discarded; a discarded issue is then claimable by another agent, so two agents hold "exclusive" ownership of one issue. Reproduced 3/3 trials. |
| RUF-441 | HIGH | Root cause of RUF-440: `claim()` is an unlocked read-modify-write against process-local state, persisted by non-atomic whole-file `fs.writeFileSync`. The correct locked/atomic pattern exists in `workspace-lease.ts` and is not used. |
| RUF-442 | HIGH | Claims never expire. `expireStale()` has zero callers; `expiresAt` is never assigned; no CLI surface. A crashed agent holds its claim forever. |
| RUF-443 | HIGH | `ruflo memory store` aborts with SIGABRT in the better-sqlite3 `Statement` destructor at ~1-in-6 **with no contention**; ~4-in-9 under same-key contention. `memory init` aborts (exit 133) while leaving a usable DB. |
| RUF-444 | HIGH | Daemon mutual exclusion is PID-based (`process.kill(pid,0)`) and fails across PID namespaces: two live daemons on one shared project dir, pidfile matching neither (host-verified). All lease/supervisor/budget expiry shares this weakness. |
| RUF-445 | MEDIUM | `memory search` and `memory list` default to **all** namespaces (`effectiveNamespace = namespace \|\| 'all'`), leaking another namespace's secret to an unscoped caller, while `retrieve` is scoped by default — an inconsistent and trap-shaped default. |
| RUF-446 | MEDIUM | `memory_entries.owner_id` is declared and indexed but never written; `provenance_type` is always `'unknown'` despite ADR-323's enum; `expires_at` always NULL. Memory carries no ownership, provenance, or expiry. |
| RUF-447 | MEDIUM | `worktree cleanup` removes worktrees and the registry record but never deletes the per-agent branches — unbounded permanent branch accumulation carrying unmerged agent commits. |
| RUF-448 | MEDIUM | Worktree isolation is packaged but unreachable from `ruflo`: no `worktree` command, and the only implementation is in `@claude-flow/codex` via a nested binary not linked into top-level `.bin`. |
| RUF-449 | MEDIUM | `worktree prepare` writes its registry into the repo (`.claude-flow/swarm/worktrees/`) while refusing to run against a dirty tree, so the first success blocks all subsequent `prepare` calls unless the path is gitignored. |
| RUF-450 | MEDIUM | Agent worktrees are created **outside** the repository at `../.ruflo-worktrees/<repo>/`, escaping the repo boundary, its `.gitignore`, and repo-scoped tooling. |
| RUF-451 | MEDIUM | `integrate()` runs sequential `git merge --no-ff` with no conflict handling or abort path; one conflict leaves the repository in a conflicted merge with partial integration. |
| RUF-452 | MEDIUM | The main memory DB sets WAL but **no `busy_timeout`**, so contention fails immediately rather than waiting; two peripheral files do set one (5000ms / 500ms), making this an inconsistency on the primary write path. |
| RUF-453 | MEDIUM | `memory store`/`search` silently spawn a persistent background daemon (12h TTL), and print "Started Ruflo background daemon" from every caller including those whose daemon lost the dedup race — a false self-report. |
| RUF-454 | INFO | **Positive:** daemon single-instance dedup is correctly implemented (O_EXCL lock held across the whole spawn lifecycle, stale reclamation, workspace-scoped `killStaleDaemons`) and empirically effective within a PID namespace — 5 concurrent starts, 1 survivor. |
| RUF-455 | INFO | **Positive:** cross-project memory isolation holds; concurrent distinct-key writes never lost; no database corruption under contention, abort, or SIGKILL (`integrity_check`=ok); same-key writes show last-writer-wins with no tearing. |

---

## 13. What Tailered would have to do

The concurrency machinery Ruflo would need for safe bounded parallelism is either daemon-scoped, unreachable,
or broken. Consequences for the Tailered invariants:

- **"An external process agent must not mutate the company repo"** — the worktree path is the intended mitigation
  and it is unreachable from `ruflo`, creates directories outside the repo, and leaks branches into it.
- **"One terminal `EvalRow` per run"** and **`caused_by` on every record** — there is no run identity on any
  memory write and no `owner_id` ever populated. Nothing in Ruflo's own state can be attributed to a run or an
  agent.
- **Reserve-and-settle with a hard exclusive cap** — the closest analogue, `global-ai-budget.ts`, uses the same
  PID-liveness reservation model that §5.2 shows failing across namespaces. Its correctness was not tested in this
  lane (out of scope) but it inherits the defect class.
- **Deterministic code owns money/tokens/hashes/ledger aggregates** — nothing here should be trusted to own any
  of them. Ruflo's own ownership primitive loses 30-50% of concurrent writes while reporting success.

If Ruflo is adopted at all, ownership, run identity, and expiration must be implemented **outside** it, in
Tailered's deterministic layer, with Ruflo treated as an unreliable advisory participant rather than a
coordinator. Ruflo's `git-workspace-identity.ts` is the one component worth reusing as-is.

---

## 14. What I could not determine

- **Multi-host / NFS behavior.** The PID-liveness defect is proven across PID namespaces. I could not test two
  physical hosts or a network filesystem — no fixture existed and the charter forbids standing up external
  systems. The extension is `INFERRED` from an identical mechanism, not verified.
- **Whether the SIGABRT is arch- or version-specific.** All runs were `node:24` on linux/arm64. The abort is in
  `better-sqlite3`'s native destructor; I did not test amd64 or Node 22, so I cannot say whether the ~1-in-6
  baseline rate is universal or specific to this platform/Node combination.
- **A natural same-issue claim race.** The lost-update path (different issues) reproduced readily; the
  same-issue double-claim did not, because ~1s of node startup jitter serialises the tiny load→save window. The
  race is proven present by construction (`claim-service.ts:265-286` + `:258`) and its lost-update consequence is
  proven empirically, but I did not observe two processes both printing `[OK] Claimed` for the *same* issue in a
  single run.
- **`daemon stop` during in-flight worker execution.** Tested shutdown of an idle daemon and SIGKILL during a
  memory write, but did not force a shutdown while an AI worker was mid-task — the daemon's workers are on long
  schedules and `--headless` execution requires provider credentials, which the containers deliberately lack.
- **Whether `global-ai-budget` reserve-and-settle is correct under concurrency.** Read but not exercised; it is
  budget-lane scope and it shares the PID-liveness defect class documented here.
- **`hive-mind` / `swarm` / `autopilot` coordination.** These advertise multi-agent coordination and would be the
  natural home for ownership, but exercising them requires model calls, which the charter forbids. Their
  concurrency behavior is `UNKNOWN`.

---

## 15. Evidence index

All paths under `/tmp/aud-ruflo-20260811/work/lane-L4b/`.

| Test | Log | Artifacts |
|---|---|---|
| Baseline store / `memory init` abort | `logs/t1-meminit.log`, `logs/t1-store-after.log` | `t1/proj/.swarm/` |
| Concurrent distinct keys | `logs/t2-diffkeys.log` | `t2/out/swarm-after/` |
| Concurrent same key | `logs/t3-samekey.log` | `t3/out/` (incl. crash log `out-3.log`) |
| Namespace + cross-project isolation | `logs/t5-isolation.log` | `t5/out/projA-swarm/` |
| Daemon race, one namespace | `logs/t6-daemon-race.log` | `t6/out/` |
| Two containers, one repo | `logs/t7-A.log`, `logs/t7-B.log`, `logs/t8-*.log` | host `docker top` output in §5.2 |
| Worktree prepare/status | `logs/t9-worktree2.log` | — |
| Worktree race + cleanup | `logs/t10-wt-race.log` | — |
| 6-way contention + crash | `logs/t11-stress.log` | `t11/out/swarm-after/` |
| Sequential control | `t12/out/control.log` | `t12/out/c-*.log` |
| Claim race (same issue) | `logs/t13-claim.log` | `t13/out/claims.json` |
| **Claim lost-update** | `logs/t14-claimlost.log` | `t14/out/claims.json` |
| **Claim reproducibility + overlap** | `logs/t15-confirm.log` | — |
| Helper scripts | `scripts/*.sh` | `scripts/dbread.sh` = independent DB reader |

Independent verification method: `scripts/dbread.sh` copies `memory.db` plus its `-wal`/`-shm` sidecars to a
temp directory and runs host `sqlite3` against the **copy**, so no read can mutate, checkpoint, or otherwise
disturb the artifact under audit.

All test containers were terminated; none left running.
