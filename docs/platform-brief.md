# Tailered AI — Platform Brief

This document is ground truth for what Tailered AI is, why it exists, and the concepts every build decision must serve. It pairs with `v1-contract.md`: this brief wins on intent and the contract wins on v1 scope.

## 1. What Tailered AI is

Tailered AI is a platform that mints AI-native companies as code. Where app builders generate software, Tailered generates the operating company around the software: its decision history, work loops, agent seats, governance gates, evaluation ledger, and economics — all as plain files in a Git repository the founder owns.

The unit of output is not a codebase. It is a company repo: a single versioned directory tree that is the company. Product code lives in it, but so do the decisions that shaped the product, the loops that run the operation, the labels that record every human judgment, and the receipts for every unit of machine intelligence spent. Dashboards, agents, and billing render from the repo; they never hold state of their own.

A founder finishes a short charter interview and receives a running company that ships its first feature in the same session — and remembers why it did.

## 2. The worldview the platform is built on

**Intelligence is rented, identical for every buyer, and therefore never the moat.** Frontier models are a small set of interchangeable superbrains priced per token. Every competitor's API call is the same as yours. Durable advantage lives exclusively in what surrounds the model: proprietary context, accumulated ground truth, closed feedback loops, and a legible decision history. Tailered exists to manufacture exactly those assets for every company it mints.

**The frontier moves, so ride it rather than fight it.** Model capability advances on a cadence of months. Anything welded to one model's quirks depreciates on that cadence; specs, tests, decisions, and labeled judgments appreciate, because each new model exploits them better than the last. The architectural consequence is absolute: thin choreography, thick data. Model identity appears in exactly one place — a registry of tier-name strings — and an upgrade anywhere in the system is a string swap. Every company Tailered mints must get better automatically when the underlying models improve, with zero migration work.

**The customer is the accountable individual.** The platform's design target is a company operable by one human plus metered machine intelligence — the smallest possible team wielding the largest possible leverage. Every feature is judged against that operator: one person must be able to read the whole company, approve its irreversible actions, and understand every dollar and token it spends.

**Generality beats cleverness.** Elaborate scaffolding built to patch a current model's weaknesses is scheduled demolition — the next release absorbs it. The platform therefore encodes company knowledge as data (charters, decisions, tests, labels, outcomes) and keeps orchestration deliberately simple, betting on the general capability curve rather than on machinery that fights it.

**Compounding beats features.** Every enduring system in this field is one simple mechanism repeated at scale until it dominates. Tailered's mechanism is the labeled decision corpus: every loop run appends structured records of what was attempted, what was decided, by whom, at what cost, with what outcome. Features come and go; the corpus only grows, and it is the one asset that cannot be rented.

## 3. The core object model: company-as-code

The repo layout is the product's public contract:

- `product/` — the shippable artifact. Factory-built, whole files only, never stubs.
- `decisions/` — the decision record. Numbered, append-only Markdown files, each one screen: context, decision, alternatives rejected, consequences, status. An accepted decision is never edited; it is superseded by a new number. `ADR-000` is the charter. The system writes its own decision records as it operates.
- `loops/` — declarative definitions of the company's closed loops. v1 ships one: the ship loop.
- `seats/` — the roster: which human owns which outcome, which agent fills which function, each with its model tier and budget.
- `evals/` — an append-only ledger. One row per loop run: what was specified, what passed, tokens by tier, wall time, cost, where it deployed, and links to the decision and verdict that produced it.
- `labels/` — an append-only ledger of every human judgment made at a gate, with full context. This is the platform's most valuable byproduct.
- `policies/` — governance: which actions require a human gate, which credentials each seat holds, what is irreversible.
- `AGENTS.md` — the constitution: written law rendered from the charter, in language a machine can check itself against and a person can read in one sitting.

Three invariants protect the model. Everything is plain files in the user's own Git repo — human-readable end to end, replayable run by run, rolled back with version control. Every record carries `caused_by` links to the records that produced it — no orphans, ever. And there is no lock-in: delete the platform and a functioning company remains. The format is open on purpose; the strategy is to own the standard and win by being its best runtime.

## 4. The closed-loop primitive

An AI-native company differs from a normal company in one structural way: nothing happens open-loop. The universal shape, applied everywhere, is:

**capture → propose → critique → gate → execute → measure → feed back.**

Every action leaves an artifact a machine can read. Every artifact feeds the next cycle. The operating rule is blunt: if an agent cannot read it, it did not happen. This is what makes a Tailered company queryable — at any moment, its current state is a pure render of repo state, never a parallel database that can drift from the truth.

A single ship-loop run leaves behind, at minimum: a spec, generated acceptance tests, test results, a self-critique, a human verdict with reasons, a deployment receipt, a self-written decision record, and one eval row tying it all together with full cost accounting. That density of capture is not overhead. It is the product.

## 5. The factory

The division of labor is fixed and non-negotiable. **Humans own intent; machines own implementation.** The human artifact is a spec plus acceptance tests — an executable definition of done. The machine implements and iterates until every check is green, under hard bounds: a maximum number of attempts per failing check, a maximum cost per run. When a bound is hit, the system halts and names the blocker in plain language. It never thrashes, never silently burns budget, and never reports completion without evidence.

Two disciplines govern everything the factory emits. First, whole artifacts only: no placeholders, no TODOs, no “rest unchanged” — complete files or exact diffs. Second, a strict determinism boundary: anything numerical, financial, legal, or factual is computed by deterministic code; models narrate, judge, and explain, but they never are the source of truth for a number. Calculators calculate; models talk about it.

Verification runs narrowest-first: the specific failing check before the full suite, the full suite before the demo path.

## 6. Constitutional governance and the labeling flywheel

Every minted company carries a constitution — `AGENTS.md`, rendered from the founder's charter. It is not a vibe document; it is written law that agents check their own output against.

The sequence at every gate is deliberate. Before any human sees an artifact, the system critiques its own work against the constitution and either fixes the violations or flags them explicitly. Machine self-criticism is cheap, and it means human attention lands only on what machines cannot resolve — and that humans review work the machine has already tried to break. Machine-generated critique also makes the human better: it surfaces candidate failures a reviewer confirms or dismisses, rather than asking the reviewer to find everything alone.

Then the human gate — and this is the platform's quiet centerpiece. **Every human action at a gate is captured as a structured preference label**: the artifact hash, the verdict (approve, reject, or edit), the edit diff if any, the reason in prose, and a full context snapshot. Approval flows and data collection are the same pipeline, by design. Judgment that is not captured is unrecoverable; judgment that is captured compounds. The label corpus tunes the platform's own agents, seeds future benchmarks, and — in anonymized aggregate across every company minted — becomes the cross-company pattern asset no competitor can rent, copy, or shortcut. It grows only with use, which is the definition of a moat in a world of rented intelligence.

Gates guard exactly the irreversible: deployment, money movement, external sends. Everything else runs free under the constitution, bounded by budgets.

## 7. The routing economy

Machine intelligence is quality-tiered and priced per token, which makes routing an economic organ, not a config line. The platform routes by task kind: routine transformation and formatting to the cheap tier; generation and critique to the mid tier; judgment calls to the frontier tier — with escalation to frontier only when the mid tier is demonstrably stuck. Most tokens flow to cheap experts; few flow to expensive ones; the routing itself is a designed, measured component with its own log: task kind, tier chosen, reason, tokens, cost, for every single call.

The governing insight: under a fixed budget, allocation is the entire game, and unmeasured allocation is always wrong. Teams systematically overbuy expensive intelligence and underbuy loop frequency. The platform's native economic instrument is therefore the **tokens-per-outcome curve**, built per loop from the eval ledger and rendered on the dashboard from day one — so every operator can see what an outcome costs and where the next dollar of compute actually buys improvement.

Spend discipline is structural: per-run cost caps, per-check attempt bounds, per-seat budgets, and a receipt on every run. High spend is acceptable — compute replacing headcount is the model. Unaccounted spend is not.

## 8. Credit assignment: how a company learns

A system improves by tracing error backward to the decision that caused it — and this applies to organizations exactly as it applies to networks. That is why `caused_by` links are mandatory on every record. Together they form the company's decision graph: charter → decisions → specs → attempts → verdicts → deployments → outcomes.

When something fails, the system walks the graph backward until it can name the responsible decision: this outcome failed because of decision ADR-007. Blame lands on decisions, not people — which is what makes honest history writable, and honest history is what makes learning possible. A company that cannot assign credit through its own decision graph cannot learn from its own operation; it can only repeat it. v1's obligation is to store the edges; the automated walker that traverses them is a later feature that costs nothing to enable once the edges exist.

## 9. Evaluation as infrastructure

Three rules govern how quality is known rather than felt. **Single numbers lie:** every evaluation is a multi-metric scorecard — correctness, cost, latency, constitution compliance — never one score to game. **Standardized checks make progress legible:** the same assertions run on every company across time, so improvement is measurable rather than anecdotal, and companies become comparable to their own past. **Adversarial pressure precedes users:** systematically probing a minted company's loops for failure before customers find them is a planned standing capability of the platform.

v1's whole duty here is capture: keep the eval and label ledgers complete and linked. Every later evaluation product — the cross-company benchmark, the adversarial seat, the automated critic — is a query over ledgers v1 already wrote. If capture is complete, everything downstream is free; if capture is lossy, nothing downstream is possible.

## 10. Efficiency engineering

Margin is a systems artifact, not a pricing decision. The platform's cost structure is won or lost in engineering: context is cached and keyed by repo-state hash so nothing recomputable is ever recomputed; repo indexing is incremental; work batches where latency allows; the expensive tier is touched only at the moments that need judgment. Later, when per-company volume justifies it, lightweight per-company adaptation can specialize cheap models on each company's accumulated corpus — the ledgers make that possible without any new capture. The compounding rule again: capture now, exploit later, never the reverse.

## 11. The v1 feature surface

**Charter interview.** A command-line flow of at most ten questions: what are you building, for whom, what does winning look like. It refuses fragments — full prose is mandatory, because writing is where a founder discovers what they actually mean. The essay is the point, not the record of it. Output: `ADR-000`, the charter, from which the constitution renders.

**Repo mint.** One command scaffolds the entire company-as-code structure, seats a founder (human, accountable) and a builder (agent, tiered), wires the ship loop, and logs its own first decision record. CI validates the scaffold.

**The ship loop.** Spec in → acceptance tests generated → implement until green under bounds → constitutional self-critique → human gate with label capture → preview deployment → self-drafted decision record → eval row appended. One loop, complete, with receipts.

**Read-only dashboard.** A pure render of repo state: current loop status, the last five decisions, spend and tokens-per-outcome curves. System fonts, one accent, nothing decorative. Legibility is the only aesthetic.

Definition of done, cost bounds, and the demo-time ceiling are executable, not aspirational.

## 12. Explicitly out of scope for v1 — and what v2 inherits

Not in v1: the seat marketplace, billing, platform multi-user authentication, UI polish beyond legibility, the adversarial seat, the cross-company benchmark, the automated blame-walker, preference-tuned platform agents.

Every one of those inherits from v1's ledgers for free. The label corpus is the preference dataset. The eval ledger seeds the benchmark. The routing log is the allocation curve. The `caused_by` edges enable the blame-walker. This is deliberate: v1 adds nothing beyond one complete loop except capture — and capture is the only thing that cannot be added retroactively.

Early companies are minted with heavy manual involvement by design. The unscalable path is the research instrument: every manual intervention is observed, logged, and becomes the spec for what the platform automates next.

## 13. Standards of construction

**Language.** Plain, precise prose everywhere the platform speaks — product copy, decision records, agent output, error messages. No hype adjectives, no filler praise, no decorative enthusiasm. Blocked halts name the blocker; receipts state the numbers.

**Design.** No glassmorphism, no gradient decoration, no sparkle or AI-themed motifs, no template aesthetics. System fonts, a single accent, information density over ornament.

**Honesty mechanics.** Claims are labeled by evidence class — verified by execution, inferred by reasoning, or unknown — and completion is never reported without the evidence attached. A false “done” voids the work that claimed it. Missing context is named, never bridged by invention.

**Self-hosting.** The platform runs on itself from its first commit: its own decisions in `decisions/`, its own runs in `evals/`, its own gates labeled in `labels/`. It is the first company it mints, and its repo is public proof that the model works.

## 14. The one paragraph to retain

Tailered AI's bet: intelligence is rented and identical for everyone, so the company that wins is the one whose surroundings compound — captured decisions, executable definitions of done, labeled human judgment, closed loops with receipts, and a decision graph that can trace every failure to its cause. Tailered manufactures those surroundings as a Git repo any founder can own, read, and keep. One loop first, capture everything, route intelligence like money, gate the irreversible, let the corpus compound. The brain is rented. The company is what Tailered builds around it.
