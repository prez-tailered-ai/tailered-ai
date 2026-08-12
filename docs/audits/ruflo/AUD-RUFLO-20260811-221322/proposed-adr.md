<!-- audit: {"audit_id":"AUD-RUFLO-20260811-221322","tailered_sha":"6172653e0aca0981d0abaf4ad8e9d587667737e9","ruflo_release":"v3.37.0","ruflo_sha":"6ce18b5a7fcd4939a2f72c2e3b8fdbdec660e5a9","generated":"2026-08-12T01:00:00Z","evidence_class":"MIXED","lane":"AUD-L0","caused_by":["AUD-RUFLO-20260811-221322/16-final-recommendation.md","AUD-RUFLO-20260811-221322/15-adoption-scorecard.md"]} -->

# Proposed ADR — Decline Ruflo as an execution substrate; adopt four ideas by reimplementation

> **Status: proposed. This file is deliberately NOT in `decisions/` and is NOT accepted.**
> Tailered's constitution states that accepted decisions are immutable and that ADR numbering is the
> founder's act. Promoting this into the canonical ADR sequence — assigning it a number, setting
> `status: accepted`, and adding the `caused_by` edges — is a human decision that this audit does not
> take. The audit prompt cannot authorise an ADR; only the founder can.

## Title

Decline Ruflo v3.37.0 as an execution substrate for the Tailered AI agent platform; adopt four of its
ideas by reimplementation inside `prez-tailered-ai/tailered-ai`.

## Context

Ruflo (`ruflo@3.37.0`, implemented by `@claude-flow/cli@3.37.0`, GitHub `ruvnet/ruflo` at
`6ce18b5a7fcd4939a2f72c2e3b8fdbdec660e5a9`, MIT) advertises itself as enterprise AI agent
orchestration with 60+ specialised agents, self-learning, fault-tolerant consensus, vector memory,
and MCP integration. It was evaluated as a candidate **subordinate execution substrate** — swarms,
worktrees, workflows, memory, observability, MetaHarness, federation — never as an authority layer.

Audit `AUD-RUFLO-20260811-221322` ran thirteen bounded investigation lanes against a frozen Tailered
baseline (`6172653e…`, verified clean and green three times before any audit activity) with every
piece of Ruflo code executed inside disposable containers that never mounted host credentials.

The audit established that Ruflo's capability surface is real and broad — 53 CLI commands, 356
registered MCP tools, 90 agent definitions, all reachable from a clean install — and that its
reported success is not reliable.

## Decision recommendation

**Decline adoption.** Do not install Ruflo into `prez-tailered-ai/tailered-ai`, in any mode, at this
version, and do not build or deploy agents from this repository on it.
Take four ideas by reimplementation. Re-audit no earlier than two stable minor releases, against the
revisit criteria in `16-final-recommendation.md`.

## Capabilities approved for adoption

None. Zero capabilities reached `ADOPT`.

## Capabilities requiring adaptation (if the product is ever re-qualified)

| Capability | Condition |
| --- | --- |
| MCP server and tool surface | Pinned to an exact version, never `@latest`; tool set explicitly allowlisted; all GitHub write tools (`gh pr merge`, `gh pr close`) removed. |
| Cost tracking | Advisory only. Tailered's `ReserveSettleBudget` remains the sole authority. |
| Observability / tracing | Enrichment stream only, explicitly never the canonical ledger. |
| Install / upgrade | Installs cleanly, including with `--ignore-scripts`. Removal must be done by hand — Ruflo's own `cleanup` reverts only 21.7% of its changes (see Rollback and removal). |

## Capabilities deferred (STUDY)

Core CLI; agent definitions as prompt assets; swarm coordination; workflow persistence; self-learning
and SONA; security scanning and AI defence; prompt-injection and PII defences; browser automation;
test generation; federation; MetaHarness grading. Eleven in total — informative as design input,
none executable to a durable postcondition in this audit.

## Capabilities rejected

Plugin discovery (1 of 38 plugins ships); worktree isolation (unreachable from the `ruflo` binary,
worktrees created outside the repository boundary); autopilot and background workers (autostart and
spend outside reservation); AgentDB persistence, vector retrieval, and cross-session memory (silently
discard writes while reporting success); model and provider routing (conflicts with Tailered's
stateless router and model registry); budget enforcement (no pre-execution ceiling); GitHub
integration (packages merge and close where merge equals deploy); witness verification (declares
success with 53 drift, and its signing key is publicly derivable). Ten in total.

## Authority boundaries (non-negotiable, had adoption proceeded)

Tailered retains, without exception: every repository write; model-tier routing; model identity from
`tailered.config.json`; reserve-and-settle budget authority; the append-only trace and `caused_by`
edges; the terminal `EvalRow`; and the founder deployment gate. Ruflo would be permitted only to
receive one bounded `AgentRequest` on standard input and return one `AgentResponse` on standard
output, from inside a disposable container with no ambient credentials.

The audit found this boundary is **not achievable** with v3.37.0: Ruflo cannot be mounted read-only
(32 repository-local state paths; reading memory mutates the repository), and a daemon autostarts on
unrelated commands to spend outside any reservation.

## Data ownership, budget, routing, trace ownership

Unchanged from Tailered's constitution in all four cases. Ruflo would have owned nothing canonical.
The audit's finding is that Ruflo does not behave as a component that owns nothing canonical: it
persists a router state file, 14 SQLite tables, and 32 repository-local paths.

## Memory promotion rules

Moot under this recommendation. Had memory been adopted, no Ruflo memory item could become a Tailered
decision, policy, label, or evaluation without a separate Tailered-controlled promotion step, and
every stored item would have required source, run ID, call ID, evidence class, content hash, creation
time, expiry, and verification status. The audit found `memory_entries.owner_id` is declared and
indexed but never written, `provenance_type` is always `unknown`, and `expires_at` is always NULL —
so the envelope required for promotion cannot currently be stored.

## Security controls (that would have been mandatory)

Container-only execution with no host credential mounts; no global configuration writes; exact
version pinning with a committed lockfile; `--ignore-scripts` or an audited `postinstall`; the proxy
cloud plane explicitly disabled; no `@latest` anywhere; egress allowlisting.

## Rollback and removal

**Manual** removal works; Ruflo's own uninstaller does not. `ruflo cleanup --force` — advertised as
the uninstaller — reverts 56 of 258 changes (21.7%), leaving 204 files and 57 directories behind. It
deletes `.claude/helpers/` while leaving `.claude/settings.json` still pointing at the deleted
directory, and even the **dry run** starts a background daemon that it never stops.

Removal by hand is nonetheless straightforward and complete, which is what preserves Tailered
invariant 24. The deletion set is `.claude-flow/`, `.swarm/`, `.claude/`, `.mcp.json`, `CLAUDE.md`,
the appended `.gitignore` block, `ruvector.db`, the `~/.claude/CLAUDE.md` Ruflo block, and
`~/.config/ruflo/`. Tailered's full suite (`npm ci`, `check`, `test` 18/18, `validate`, `demo`) exits
0 in the pristine repository, the Ruflo-initialised repository, and the post-cleanup repository.
Caveats: a detached daemon may hold the tree for up to twelve hours after deletion, and removing
`.claude-flow/policy/state.json` while an external anchor survives makes Ruflo fail closed.

## Alternatives rejected

1. **Adopt wholesale as the execution substrate.** Rejected: five of nine blocking compatibility
   questions answer NO, and four `CRITICAL` false-success findings make its output unusable as evidence.
2. **Adopt only memory as a subordinate cache.** Rejected: this is the single worst subsystem — it
   silently discards writes while its own self-test passes.
3. **Adopt only the MCP tool surface behind a pinned wrapper.** Deferred rather than rejected. It is
   the most defensible slice, but it inherits the same daemon autostart and repository-write
   behaviour, so it cannot be taken at this version.
4. **Fork and repair.** Rejected on cost: the defects are architectural (authority placement) rather
   than local, and upstream ships roughly one minor release per day, so a fork diverges immediately.
5. **Wait and re-audit later.** Accepted as the path forward, with explicit revisit criteria.

## Consequences

- Tailered keeps a single source of truth, one router, one budget authority, and one ledger.
- Tailered forgoes a large ready-made agent surface and must build the four adopted ideas itself.
- Two pre-existing Tailered defects were surfaced and should be fixed independently of this decision:
  `TAI-001` (the projection is never sent to the process agent, so enforcement is post-hoc detection
  rather than prevention) and `TAI-002` (`ProcessAgent` kills only the direct child, leaking
  grandchildren).
- The evaluation method itself is reusable: independent postcondition verification caught four
  reported successes that had no durable effect, and would have caught them in any other candidate.

## Evidence references

`00-executive-verdict.md`, `04-claims-to-evidence-matrix.md` (90 claims),
`11-tailered-compatibility.md` (25 questions, 5 blockers), `08-reliability-and-data-integrity.md`,
`09-concurrency-and-isolation.md`, `07-security-privacy-and-supply-chain.md`,
`15-adoption-scorecard.md`, `evidence/findings.jsonl`, `evidence/blocked-items.json`.

## Unresolved questions

1. Model-dependent behaviour — swarm execution, autopilot, workflow resume, test generation — could
   not be executed because no model credentials exist and paid calls were forbidden. These remain
   `UNKNOWN`, not refuted.
2. Whether the 53 witness drift entries mean the published artifact genuinely differs from its
   manifest, or that the manifest is authored against the source-repo layout. Either reading leaves
   the `[OK]` verdict false.
3. Whether `postinstall`'s upward directory walk can escape its own dependency subtree in a real pnpm
   workspace.
4. Whether the reliability failures reproduce on linux/x86_64 as they do on arm64.

## `caused_by`

`AUD-RUFLO-20260811-221322`; findings `RUF-010`, `RUF-011`, `RUF-012`, `RUF-401`, `RUF-402`,
`RUF-440`; compatibility blockers Q5, Q7, Q8, Q11, Q12.
