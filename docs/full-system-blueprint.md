# Tailered AI — Full-System Blueprint

**Status:** Master map. The v1 scope contract (pseudocode + seven rulings) is unchanged and remains the only build authorization. This document is the whole mountain; the contract is the first pitch. Precedence order: v1 contract (scope) → Platform Brief (intent) → this blueprint (trajectory).

**Reading rule:** every subsystem below carries four tags — **[Stage]** when it ships, **[Principle]** the research idea it operationalizes, **[Feeds on]** the captured data it requires, **[Fallback]** what runs if it fails or isn't ready. A subsystem with no data to feed on does not get built. That single rule is what keeps a maximal blueprint from becoming a maximal liability.

---

## 0. North star and design laws

Tailered AI mints AI-native companies as code and improves every company it has ever minted by operating them. The platform is itself the first company it minted.

Seven laws hold at every stage, in every plane:

1. **Thin choreography, thick data.** Scaffolding depreciates each model generation; captured decisions, tests, labels, and outcomes appreciate. When in doubt, capture more and orchestrate less.
2. **Model identity lives in one registry.** Upgrades are string swaps. Nothing below the registry knows a vendor.
3. **Every record carries `caused_by`.** The company is a connected graph or it is not learnable.
4. **All spend is reserve → settle.** Projected cost is checked before the call; actuals settle after. No unaccounted token anywhere in the system.
5. **Machines narrate; deterministic code computes.** Math, money, and facts never originate in a model.
6. **Gates guard the irreversible; every gate verdict is a labeled record.** Approval flow and data collection are one pipeline.
7. **One-sitting legibility.** Every layer — spec, constitution, trace, this document — is readable end-to-end by one person. Illegible infrastructure is rejected in review regardless of how well it works.

---

## 1. The Nine Planes

### Plane 0 — Substrate: the company format

**Company Format Spec** [v1 de facto, v2 versioned spec] [Principle: standardize the interface everyone builds against; reproducible implementations as the standard of proof; one-sitting legibility] [Feeds on: nothing — this is the ground] [Fallback: none; this plane has no fallback because everything else is a view over it.]
Plain files in the founder's git repo: `product/`, `decisions/`, `loops/`, `seats/`, `evals/`, `labels/`, `policies/`, `AGENTS.md`. Four append-only ledgers (evals, labels, routes, outcomes) and the `caused_by` graph over all records. The spec is open and versioned so anyone can implement a runtime against it; Tailered wins by being the best runtime, not the only one. Rollback is `git revert`; replay is stored inputs; lock-in is zero.

### Plane 1 — Intelligence: how thinking is sourced, priced, and moved

**Model Registry** [v1] [Principle: ride the capability curve; bet on generality over machinery] [Feeds on: capability manifests per model] [Fallback: manual tier pinning.]
Tier-name strings mapped to current best models, with machine-readable capability manifests (context length, tool support, cost). A model generation change touches this file and nothing else.

**The Router** [v1 static → v2 signal-passing (ruled) → v3 learned policy] [Principle: sparse expert routing — most tokens flow to cheap experts, few to expensive ones; routing itself is learned, not configured] [Feeds on: RouteLog × EvalRow outcomes] [Fallback: the v1 static map, permanently maintained.]
Routing is the platform's economic reflex. v1 maps task kinds to tiers with stuck-escalation. v3 replaces the map with a small learned policy trained on routing history joined to outcomes — which tier actually produced green tests per task class at what cost — while remaining stateless, logged, and instantly revertible to the static map. Sparse activation extends beyond models to seats: a task wakes only the seats it needs; the org idles cheap.

**Context Engine** [v1 cache → v3 hierarchy] [Principle: IO-awareness — the bottleneck is memory movement, not compute; eliminate redundant state across workers] [Feeds on: repo-state hashes, retrieval hit/miss telemetry] [Fallback: naive full-context assembly with a cost warning.]
Token spend is byte movement; engineer it like a memory hierarchy. Hot context (current spec, failing check) lives in-window; warm context (recent decisions, module interfaces) in a shared cache keyed by repo-state hash; cold context (full history) behind retrieval. One shared context store per run — no agent holds a redundant copy. Context-assembly cost is measured per call, because unmeasured assembly is where margins die.

**Distillation Pipeline** [v3] [Principle: teacher–student distillation — the expensive model's verified outputs train the cheap one] [Feeds on: frontier-tier outputs with green outcomes] [Fallback: keep paying frontier prices.]
Every frontier call that produced a verified-good outcome becomes a training example for the cheap tier. Over time the platform's routine work migrates down-tier not by fiat but because the cheap tier was taught by the expensive one. This is the mechanism that bends the cost curve while quality holds.

**Adapter Layer** [v4] [Principle: low-rank adaptation on frozen bases; quantization economics that collapse the cost of specialization] [Feeds on: per-company corpus above a volume threshold] [Fallback: RAG over the company corpus — which is the v1–v3 default anyway.]
Per-company lightweight deltas on frozen base models: the company's voice, conventions, and domain encoded as a small trainable artifact checked into its own repo. Built only when a company's corpus passes the breakeven the platform computes from its own ledgers — the same deferral analysis that keeps this out of early stages.

**Sovereignty Tier** [v4] [Principle: local inference without API dependence; quantized models make cheap tiers runnable anywhere] [Feeds on: nothing — it's an availability property] [Fallback: cloud tiers.]
Cheap-tier seats runnable on local, quantized models. Two purposes: graceful degradation when providers fail, and a true no-dependence mode for companies that require it. The company survives its tooling; the tooling should also survive its vendors.

### Plane 2 — Execution: how work becomes artifact

**The Factory** [v1] [Principle: spec-and-tests as the human artifact; the machine iterates to green] [Feeds on: specs] [Fallback: none; this is the product.]
As contracted: bounded attempts, reserve/settle budgets, whole artifacts only, halt-and-name-the-blocker, terminal EvalRow on every run.

**Durable Loop Runtime** [v2] [Principle: the closed-loop company — every operation is a resumable, inspectable cycle] [Feeds on: loop definitions in `loops/`] [Fallback: v1's single inline ship loop.]
Loops become durable workflow objects — capture → propose → critique → gate → execute → measure → feed back as first-class, resumable, inspectable state machines. A company's operations survive process crashes and human weekends.

**Work Partitioner** [v3] [Principle: model parallelism — shard one large job across workers along clean, pre-specified interfaces] [Feeds on: module-boundary metadata in `product/`] [Fallback: sequential build.]
Large specs shard into parallel agent workers along module boundaries with contract interfaces, merged deterministically, tested at the seams. The merge is only trusted because the interfaces were specified before the shards were cut.

**State Manager** [v2–v3] [Principle: partition state, eliminate redundancy] [Feeds on: run state] [Fallback: single-worker state.]
One partitioned, shared source of run state across workers. No duplicated context, no divergent copies, no "which agent has the real state" class of bug — designed out rather than debugged out.

### Plane 3 — Learning: how the platform gets better at making companies

**The Preference Pipeline** [v3] [Principle: the three-stage instruction pipeline — demonstrations, reward model, policy improvement; reward learned from human preferences; updates bounded by trust regions] [Feeds on: `labels/` — edit diffs as demonstrations, verdicts + reasons as preferences] [Fallback: static prompts, hand-tuned.]
Gate edits are demonstration data. Gate verdicts train a reward model over company artifacts. The reward model then improves platform agents through *bounded* updates: small steps against a baseline, measured on held-out scenarios, auto-rolled-back when worse. The trust-region discipline is not optional — it is what makes self-improvement safe to run unattended.

**RLAIF Prefilter** [v3] [Principle: once principles are written, AI feedback can stand in for human labels; constitutional self-critique precedes human review] [Feeds on: calibrated reward model + constitution] [Fallback: humans see everything, ranked by nothing.]
Once the reward model demonstrates calibration against held-out human verdicts, it pre-ranks candidates so gates see best-first, and auto-rejects only what the constitution unambiguously forbids. Human attention becomes the scarce resource it actually is, spent where machine judgment is least certain.

**Curriculum Controller** [v2] [Principle: curriculum learning — demonstrated competence unlocks difficulty] [Feeds on: per-company eval history] [Fallback: everything unlocked, founder beware.]
A day-one company gets one loop and tight gates. Autonomy widens — more loops, larger budgets, fewer gates — only as the company's own ledger demonstrates calibration. Trust is earned from evidence, per company, not granted by default.

**Capability Absorption Review** [v2, a process not a system] [Principle: scaffolding is scheduled demolition; products should improve automatically as models improve] [Feeds on: model generation changes] [Fallback: none needed.]
Each registry change triggers a standing review: which workarounds did the new generation absorb? Findings land in a deprecation ledger and scaffolding is deleted on schedule. The platform sheds weight every time the frontier moves; most systems gain it.

**Company World Model** [v4 — research-grade, flagged as such] [Principle: self-supervised predictive world models — predict before acting, plan against the prediction, update on error] [Feeds on: deep outcome ledgers across many companies] [Fallback: the empirical tokens-per-outcome curves, which are v2 and already good.]
A predictor trained self-supervised on the cross-company outcome ledger: given this spec, this company, this history — predicted cost, duration, failure modes, and outcome distribution *before* a token is spent. Specs get a forecast attached at the gate. This is the most speculative subsystem in the blueprint and is staged last deliberately; it earns existence only if its predictions beat the empirical curves it would replace.

### Plane 4 — Oversight: how quality is governed without becoming bureaucracy

**Constitution Engine** [v1 basic → v2 machine-checkable] [Principle: written principles the system critiques and revises its own work against, before any human review] [Feeds on: `AGENTS.md`] [Fallback: prose constitution, judgment-checked.]
The constitution renders from the charter into rules a machine can check itself against. Every artifact self-critiques and fixes-or-flags before any human sees it. v2 compiles the checkable subset into deterministic lint; prose remains for what only judgment can hold.

**Amendment Protocol** [v2] [Principle: governed constitutional change; append-only decision discipline] [Feeds on: `decisions/`] [Fallback: founder edits, ungoverned — explicitly worse.]
Constitutional change is itself an ADR with `supersedes` edges. The law can evolve; it cannot be silently rewritten. The diff between constitutional versions is part of the company's legible history.

**Scalable Oversight Stack** [v3] [Principle: recursive oversight — agents help humans evaluate agents; weaker verifiers plus tools check stronger generators] [Feeds on: critique accuracy telemetry] [Fallback: flat single-critic review.]
Cheap models plus deterministic tools verify expensive models' outputs; oversized artifacts decompose into recursively critiqued parts. Oversight capacity scales with the work instead of with the founder's evenings.

**Critique-First Review UX** [v1, already contracted] [Principle: machine-written critiques help humans find flaws they would miss alone] [Feeds on: artifacts + constitution] [Fallback: raw artifact review.]
No human ever reviews a bare artifact. Every gate presents the work *with* the machine's objections attached — the reviewer confirms or dismisses; they never start from zero.

**The Adversary** [v3] [Principle: automated red-teaming — models attacking models at scale, before users do] [Feeds on: loop definitions, gates, prompts; the shared anonymized attack corpus] [Fallback: incident-driven hardening, i.e., users find the bugs.]
A standing seat that attacks every minted company's loops, gates, and prompts before customers do. Successful attacks become regression tests; the anonymized attack corpus compounds across all companies, so each company is hardened by every other company's discovered failures.

**Gate System** [v1] [Principle: human judgment is the scarce, load-bearing resource on irreversibility — and every judgment is captured as data] [Feeds on: —; produces `labels/`] [Fallback: none; gates are load-bearing.]
Human gates on deploy, spend, and external sends. Every verdict, edit, and reason is a structured label with full context. Gate *quality* is itself measured (see Plane 5) so approval never silently decays into rubber-stamping.

### Plane 5 — Evaluation: how progress is known rather than felt

**TaileredBench** [v3] [Principle: holistic multi-metric evaluation — single numbers lie] [Feeds on: `evals/` across companies] [Fallback: per-run scorecards without cross-company norms.]
Every company scored on correctness, cost, latency, constitution compliance, and calibration — never collapsed into one gameable number. Cross-company percentiles make "how are we doing" a query, not a feeling.

**Scenario Standards** [v3] [Principle: standardized benchmarks make progress legible across time and systems] [Feeds on: curated scenario suites] [Fallback: ad-hoc testing.]
The same standard scenarios run on every company across time. Regressions alarm automatically; improvement becomes measurable against a company's own past, not just claimed.

**Calibration Ledger** [v2] [Principle: proper scoring of predictions against outcomes — confidence without a calibration history is noise] [Feeds on: every prediction any seat makes, joined to outcomes] [Fallback: uncalibrated confidence, i.e., the industry default.]
Whenever a seat predicts — cost estimates, forecast outcomes, world-model output — the prediction is logged and Brier-scored against reality. Seats carry public calibration records.

**Transparency Reports** [v4] [Principle: documented, inspectable system behavior as a norm, not a favor] [Feeds on: all ledgers] [Fallback: private dashboards only.]
Per-company, publishable reports rendered from ledgers: what shipped, what it cost, what failed, what was learned. For the platform itself, published by default — the build-in-public instinct, industrialized.

### Plane 6 — Economics: how compute replaces headcount without replacing accountability

**Reserve/Settle Metering** [v1 semantics, v2 billing] [Principle: atomic reservation and settlement — no unaccounted spend] [Feeds on: every call] [Fallback: none; law 4.]
Projected cost reserved before every call, actuals settled after, receipts on every run. v2 exposes the same semantics as customer billing — platform fee plus metered tokens with margin.

**Allocation Engine** [v2] [Principle: performance scales predictably with resources — so measure the curve and spend on the steep part] [Feeds on: `evals/` tokens-per-outcome by loop] [Fallback: flat budgets.]
Per-loop, per-company curves of outcome quality against tokens spent. The dashboard's core chart. Spend migrates to where the curve is steepest; the flat parts get starved deliberately.

**Compute-Optimal Rebalancer** [v3] [Principle: under fixed compute, nearly everyone misallocates until the balance is measured — the correction is usually more data and smaller models] [Feeds on: allocation curves + routing history] [Fallback: founder intuition, which the data will usually embarrass.]
The org-level correction: companies systematically overbuy frontier calls and underbuy loop *frequency*. Under a fixed budget the rebalancer proposes the tier-mix and cadence shift that the curves support — more cheap runs, fewer expensive ones, measurably better outcomes per dollar.

**Margin Systems** [continuous] [Principle: efficiency engineering is what makes scale economical] [Feeds on: context and routing telemetry] [Fallback: lower margins.]
Caching, batching, deduplication, distillation, quantization — platform gross margin treated as a systems artifact under permanent engineering, never a pricing decision.

### Plane 7 — Ecosystem: how the format outlives the company

**Open Company Format** [v2 spec'd] — see Plane 0; versioned, documented, implementable by anyone.

**The Hub** [v4] [Principle: the shared-artifact hub becomes the ecosystem's center of gravity] [Feeds on: format stability + community] [Fallback: private templates.]
A registry of loop definitions, seat templates, policy packs, and eval suites. Companies share components the way models share weights. The marketplace deferred since the first wedge discussion lands here — after the format is stable, never before.

**Replay Engine** [v1 invariant → v3 tooling] [Principle: annotated reproducibility as the standard of proof] [Feeds on: stored run inputs] [Fallback: logs.]
Any run replays from stored inputs; traces render as annotated, human-readable execution stories. Debugging is reading, not archaeology.

**Legibility Standard** [invariant] [Principle: one-sitting readability as a design forcing function; plain English specs as source code] [Feeds on: review discipline + doc lint in CI] [Fallback: none; law 7.]

### Plane 8 — Change governance: how the system evolves itself without drifting

**Decision Graph + Blame-Walker** [v1 edges → v3 walker] [Principle: credit assignment — trace error backward through the graph to the decision that caused it; the deepest lesson of error backpropagation, applied to organizations] [Feeds on: `caused_by` everywhere] [Fallback: manual trace, which the v1 edges already make possible.]
Automated traversal from any failure back to the responsible decision: *this outcome failed because of ADR-007.* Blame lands on decisions, never people — which is what keeps history honest enough to learn from.

**Trust-Region Evolution** [v3] [Principle: bounded policy steps with baselines and rollback, applied to the company itself] [Feeds on: baseline metrics per company] [Fallback: manual change only.]
When the platform proposes changes to a company's own prompts, loops, or policies, the changes are clipped: small, measured against the company's baseline, auto-reverted on regression. Companies evolve inside a trust region or not at all.

**Cross-Company Pattern Corpus** [v3–v4] [Principle: pretraining on a large diverse corpus yields transfer no task-specific system matches; data is the binding constraint on capability] [Feeds on: anonymized aggregate of all ledgers, opt-in, provenance-tracked] [Fallback: per-company learning only.]
The platform's foundation layer: every minted company's captured experience, anonymized and aggregated, becomes the corpus its agents are grounded in — routing priors, failure patterns, cost norms, attack library, world-model training data. This is the asset that compounds with every company and cannot be rented by a competitor at any price. It is the moat, and every plane above exists to feed it or spend it.

---

## 2. The Flywheel

One spine connects the planes:

**Ledgers** (labels, evals, routes, outcomes) → **learned components** (reward model, router policy, distilled cheap tier, adapters, world model, bench norms, attack corpus) → **better and cheaper agents** → **more companies minted, operated more autonomously** → **deeper ledgers.**

Capture funds learning; learning funds margin; margin funds scale; scale funds capture. Every subsystem in this blueprint either feeds the flywheel or spends it — anything that does neither is decoration and gets refused.

---

## 3. Staging and gates

| Stage | Ships | Entry gate (verified, not vibes) |
|---|---|---|
| **v1** (contracted) | Substrate, factory, static router, context cache, gates + labels, critique-first review, replay invariant, reserve/settle semantics | The seven rulings; executable DoD |
| **v2** | Durable loop runtime, curriculum controller, checkable constitution + amendments, calibration ledger, allocation engine, billing, format spec, capability-absorption process | ≥10 companies minted with heavy manual involvement; ledgers complete and fully linked under audit; DoD demo green |
| **v3** | Learned router, preference pipeline + RLAIF, oversight stack, the Adversary, TaileredBench + scenarios, rebalancer, partitioner, distillation, blame-walker, trust-region evolution, pattern corpus (initial) | Corpus thresholds met (labels with reasons, eval depth, routing volume — set from v2 data); reward-model calibration beats baseline on held-out human verdicts |
| **v4** | World model, adapter layer, sovereignty tier, the Hub, transparency reports | v3 learned components beating their fallbacks in production; unit economics positive; format spec stable across two versions |

The gate rule generalizes law 1: **no plane ships before its capture dependency has data.** The stages are not a schedule; they are dependency order.

---

## 4. Systemic failure modes (designed, not discovered)

**Corpus poisoning** — bad or adversarial labels corrupt the learning plane. → Provenance on every label, quarantine on anomaly, human spot-audit sampling; learned components always revertible to fallbacks.
**Reward hacking** — agents optimize the reward model instead of the work. → Multi-metric scoring (no single number to game), the Adversary hunting for it explicitly, trust-region bounds on every update, human gates retained on the irreversible.
**Oversight decay** — gates degrade into rubber stamps. → Gate-quality telemetry (time-on-review, edit rates, downstream failure correlation), sampled deep audits, curriculum tightening when gate quality drops.
**Runaway spend** — a stuck loop burns budget. → Reserve/settle is universal (law 4); attempt bounds; halt-and-name-the-blocker; per-seat caps at the router.
**Provider collapse** — a frontier vendor degrades or disappears. → Registry swap (law 2), sovereignty tier, distilled cheap-tier competence as a floor.
**Legibility decay** — the system works but no one can read it. → Law 7 enforced in CI and review; the one-sitting rule applied to every artifact including this one.
**Blueprint capture** — this document becomes justification for premature building. → The staging gates and the reading rule exist precisely for this; the v1 contract remains the only build authorization.

---

## 5. What this blueprint refuses

No learned router before routing volume exists. No reward model before the label corpus exists. No world model before outcome depth exists. No adapters before per-company breakeven. No Hub before format stability. No agent self-modification outside a trust region with rollback. No subsystem without a fallback, no plane without a gate, no capture skipped because a later plane "will need it eventually" — later planes need *exactly* what v1's ledgers already capture, which is the entire design.

The most advanced version of this platform is not the one with the most subsystems live. It is the one whose flywheel has been spinning longest. v1's one loop, fully captured, is therefore not the modest version of this blueprint — it is this blueprint, begun correctly.

---

## Appendix — Principle index

| Principle | Subsystem |
|---|---|
| AI as the company's operating system; closed loops; the factory; compute replaces headcount | Entire spine: Planes 0, 2, 6 |
| Generality beats machinery; scaffolding depreciates | Law 1; Capability Absorption Review |
| Routing is learned, not configured; parallelism over sequence | Router; Work Partitioner |
| Sparse expert routing — most tokens cheap, few expensive | Router; sparse seat activation |
| Pretraining on a large diverse corpus yields transfer | Cross-Company Pattern Corpus |
| Performance scales predictably; measure the curve, spend on the steep part | Allocation Engine |
| Compute-optimal rebalancing under fixed budget | Compute-Optimal Rebalancer |
| Bounded policy updates within trust regions | Preference Pipeline; Trust-Region Evolution |
| Reward learned from human preferences | Gate labels → reward model |
| Demonstrations → reward model → policy improvement | Preference Pipeline |
| Written constitution; self-critique; AI feedback at scale | Constitution Engine; RLAIF Prefilter |
| Recursive, scalable oversight | Oversight Stack |
| Shard large jobs along clean interfaces | Work Partitioner |
| Partition state; eliminate redundancy | State Manager; Context Engine |
| IO-awareness — the bottleneck is data movement | Context Engine |
| Low-rank adaptation on frozen bases | Adapter Layer |
| Quantization economics | Adapter Layer; Sovereignty Tier |
| Holistic multi-metric evaluation; transparency | TaileredBench; Transparency Reports |
| Standardized benchmarks make progress legible | Scenario Standards |
| Automated red-teaming | The Adversary |
| Machine-written critiques assist human review | Critique-First Review UX |
| Standard interfaces; the shared-artifact hub | Company Format Spec; The Hub |
| One-sitting legibility; English as source code | Law 7; Legibility Standard |
| Local inference sovereignty | Sovereignty Tier |
| Annotated reproducibility | Replay Engine |
| Credit assignment; teacher–student distillation | Blame-Walker; Distillation Pipeline |
| Curriculum learning; earned autonomy | Curriculum Controller |
| Predictive world models | Company World Model |
| The narrow wedge; unscalable work as research | Staging gates; manual minting |
| The one-person company; ride the capability curve | ICP; Registry; Absorption Review |
| Data as the binding constraint; judgment capture as an operation | `labels/`; Gate System; Pattern Corpus |
