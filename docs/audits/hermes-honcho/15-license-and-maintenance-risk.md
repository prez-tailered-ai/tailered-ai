# 15 — Licensing, maintenance, and upstream risk

Licenses were verified at the frozen commits by walking **every** `LICENSE`/`COPYING` file
and **every** manifest license field in both trees. Nothing below states a legal conclusion
beyond what the license text supports; items needing counsel are flagged as such.

---

## Part 1 — Hermes Agent (MIT)

### Per-component license table

| Component | License | Evidence | Risk |
|---|---|---|---|
| Root / core runtime | **MIT** | `LICENSE`, `pyproject.toml`, `package.json`, GitHub API all agree (LIC-H-01) | None |
| `plugins/security-guidance` | Apache-2.0, vendored from Anthropic | Correct `LICENSE` + `NOTICE` present (LIC-H-02) | None — properly attributed |
| 8 bundled skills | Apache-2.0 declared in `SKILL.md` frontmatter | **No accompanying LICENSE file** (LIC-H-03) | Low |
| 4 bundled components | MIT under **third-party** copyright holders | Not Nous Research (LIC-H-04) | Low |
| **GSAP 3.15.0** | **Non-OSI, commercially restricted** | Declared **production dependency of the shipped web dashboard** (LIC-H-05) | **MEDIUM** |
| 13 npm components | **MPL-2.0** (weak copyleft), plus CC-BY-4.0 and Python-2.0 entries | Production tree (LIC-H-06) | Low-Medium |
| 8 npm workspace manifests | **No license field**; 15 root lockfile entries carry none | (LIC-H-07) | Low |
| Vendored native code | Public-domain SQLite amalgamation | Provenance documented (LIC-H-09) | None |

**LIC-H-08 (MEDIUM):** there is **no third-party license notice, no attribution file, and no
SBOM anywhere in the tree**, and no SPDX headers. A consumer redistributing any part of this
would be assembling attribution from scratch.

The GSAP entry is the one that matters commercially: an MIT repository shipping a
commercially-restricted package as a production dependency of a user-facing dashboard. It
does not affect the Python agent core, but it does affect anyone shipping `web/`.

### HA-601 (CRITICAL) — the repository is deliberately un-packageable

This single fact resolves the consumption question before any preference is expressed.

`setup.py:49-50, 66-67` raises `RuntimeError` on `bdist_wheel` **and** `sdist` unless
`HERMES_NIX_BUILD=1`, and `website/docs/getting-started/platform-support.md:47-48` lists
PyPI and Homebrew as **explicitly unsupported**. There is no wheel, no sdist, no published
artifact.

**A consumer physically cannot take a direct dependency on this project.** Supported
distribution is `curl | bash`, Docker, or Nix. "Direct dependency" is therefore not a
trade-off to weigh — it is unavailable.

### Maintenance profile

| Signal | Value | Assessment |
|---|---|---|
| Commit velocity | **13,521 commits / 90 days (~1,051 per week)** from **1,716 distinct authors** | Extreme |
| Contributor concentration | top author **36.1%**, top three **56.2%** | High (LIC/HA-603) |
| Open PRs / issues / forks | **20,714 / 10,360 / 45,128** | Review backlog larger than the entire commit history of most projects (HA-604) |
| Releases | 24 in 5 months (~6.4 days), but **1,152 commits unreleased** at the frozen commit | HA-610 |
| Versioning | **four mutually inconsistent version identifiers**; no semver, deprecation, or API-stability policy | HA-609 |
| God files | **ten source files exceed 10,000 lines**; `gateway/run.py` alone is **28,226** | HA-611 |
| Dependencies | 92 direct Python packages across 44 extras → **249 locked** | HA-612 |

### CI quality — strong supply chain, weak enforcement

**Genuinely above average (HA-615):** all **149/149** `uses:` references are 40-hex
SHA-pinned; there is **no `pull_request_target` anywhere**; every direct Python dependency is
`==`-exact-pinned with CVE rationale in comments; `.npmrc:4` sets `min-release-age=14`.

**Against that:**

- **HA-605 (HIGH):** **zero code-coverage measurement** anywhere in CI, despite 25,985 test
  functions.
- **HA-606 (HIGH):** exactly **one** ruff rule is enforced repo-wide (`select = ["PLW1514"]`
  at `pyproject.toml:463`), which *replaces* ruff's pyflakes defaults — so undefined names
  and unused imports do not block merge. Type-checking is advisory-only.
- **HA-607 (HIGH):** the desktop E2E suite was hard-disabled with `if: ${{ false && ... }}`
  while **still sitting in the required-check `needs` list**, where `skipped` scores as ✅.
- **HA-608 (MEDIUM):** the canonical test runner **auto-retries every failing test file
  once** by default, so a flake that passes on retry reports green.
- **HA-619 (MEDIUM):** integration tests are excluded by default and never run in CI; 362
  skip markers across the suite.
- **HA-614 (MEDIUM):** 27 modules (~10,700 lines) have no test referencing them by name.

### Consumption recommendation for Hermes

**Architectural borrowing**, with selective source reuse limited to genuinely deterministic
utilities. Direct dependency is impossible (HA-601); a pinned fork would mean tracking a
1,051-commits-per-week upstream with no API-stability policy and a merge gate that does not
measure coverage. API integration is available only via the process/subprocess boundary,
which is exactly what Architecture D proposes and `19` Gate 3 defers.

---

## Part 2 — Honcho (AGPL-3.0)

### Per-component license table

| Component | Declared | License text present? | Risk |
|---|---|---|---|
| Server (`src/`) | **AGPL-3.0**, verbatim, §13 present and unmodified at `LICENSE:540` | Yes | Copyleft — see below |
| Root `pyproject.toml` | **no license key at all** | — | Low |
| `sdks/python` | Apache-2.0 (`pyproject.toml:6`) | **No LICENSE file** | **HIGH** (LIC-O-02) |
| `sdks/typescript` | Apache-2.0 (`package.json:6`) | **No LICENSE file** | **HIGH** |
| `honcho-cli` | MIT (`pyproject.toml:7`) | **No LICENSE file** | **HIGH** |
| `mcp/package.json` | none | — | Low |
| `docs/` | ISC | — | Low |

The string "Apache" appears in exactly three places repo-wide and **no Apache-2.0 license
text exists anywhere in the tree**. No SPDX headers in `sdks/`, `mcp/src`, or
`honcho-cli/src`.

**LIC-O-03 (HIGH):** `sdks/python/README.md:156-158` asserts "Apache 2.0" while its relative
link `../../LICENSE` resolves to the **AGPL-3.0** root text. The one document telling a
Python SDK consumer what license they have simultaneously names Apache 2.0 and points at
AGPL-3.0. The TypeScript SDK README has no license section at all.

**This is a counsel-review item.** A declared license with no corresponding text, contradicted
by its own README, is not something an audit can resolve.

### LIC-O-04 (HIGH) — the network-service boundary, from the text

Reporting only what the license says at this commit:

- **§13 (`LICENSE:540-551`)**: *"Notwithstanding any other provision of this License, **if
  you modify the Program**, your modified version must prominently offer all users
  interacting with it remotely through a computer network … an opportunity to receive the
  Corresponding Source **of your version**…"* — the obligation is **conditioned on
  modification**, and its object is the Corresponding Source **of the modified Program**.
- **`LICENSE:72-78`** defines "modify" as copying from or adapting the work in a fashion
  requiring copyright permission.
- **`LICENSE:87-89`**: *"**Mere interaction with a user through a computer network, with no
  transfer of a copy, is not conveying.**"*
- **`LICENSE:146-154` (§2)**: *"This License explicitly affirms your unlimited permission to
  run the unmodified Program."*

**What the text supports:** running an **unmodified** Honcho server and calling it over HTTP
from a separate application is the case §2 explicitly permits and §13 does not trigger,
because §13 is conditioned on modification. **What the text does not support:** any claim
that modifying the server, or linking its source into another program, is free of
obligation.

**What this audit will not do** is state a conclusion about whether a particular Tailered
deployment triggers disclosure. That is a legal determination on specific facts.
**Flagged for counsel.** The audit's *engineering* recommendation follows regardless: keep a
clean service/API boundary, run the server unmodified, and never vendor AGPL server source —
which is exactly disposition #3 in `17` (`INTEROPERATE`, never `ADOPT`).

### HO-501 / HO-502 — the benchmark claims

The README's only benchmark statement — *"Honcho has defined the Pareto Frontier of Agent
Memory"* (`README.md:22, 273`) — links **exclusively off-repo**.

`tests/bench/` contains **12.4K lines of real harness code** for LongMemEval, BEAM, LoCoMo,
and OOLONG, with pinned judges. But **no dataset, no result file, and no CI job exists** —
every benchmark input directory is gitignored and no workflow references `bench`.
**Nothing in the repository reproduces any number** (HO-501, HIGH).

Worse, the in-repo baselines are configured unequally:

- **HO-502 (CRITICAL):** LoCoMo **excludes adversarial (unanswerable) questions for Honcho**
  (`locomo.py:358`) but **not for the baseline** (`locomo_baseline.py:227`).
- **HO-504 (HIGH):** BEAM's `instruction_following` questions are answered by **the same
  model that judges them**, unconditionally.
- **HO-505 (HIGH):** BEAM/LongMemEval baselines are budget- and model-asymmetric — the
  baseline is truncated to 140K tokens while Honcho ingests the full haystack.
- **HO-503 (HIGH):** the LoCoMo judge uses a custom leniency rubric that mandates passes on
  substring containment and permits **overruling the gold answer**.
- **HO-506 (MEDIUM):** no seed anywhere, and temperature is pinned only on judges.
- **HO-508 (HIGH):** the "token efficiency" metric **excludes all ingestion and dream LLM
  cost**.

**Consequently this audit repeats no Honcho benchmark number as fact**, and marks the
headline claim `DOCUMENTATION_ONLY`. That is not an accusation of bad faith — the harness is
substantive and the judges are pinned — but comparisons configured this way cannot support
the conclusion drawn from them, and the audit's own governing rule forbade repeating
marketing benchmarks without reproduction.

### Maintenance profile

| Signal | Value | Assessment |
|---|---|---|
| Commit velocity | 99 commits / 90 days, 20 authors | Healthy and human-scale |
| Concentration | top three **51%** | Elevated (HO-540) |
| Releases | monthly through v3.0.12 (2026-08-10) | Regular; breaking changes disclosed but frequent (HO-541) |
| CI | pytest on `pgvector:pg15` + basedpyright; 71.5K-LOC test tree | **Strong for the server** |
| Test coverage gaps | benchmark and MCP surfaces untested (HO-542); schema built from models, not migrations (HO-104) | Notable |
| God files | `src/utils/agent_tools.py` at 2,796 lines | Contained |
| SDKs | hand-written (Stainless core removed), versioned independently of the server (HO-520); Python SDK advertises 3.8/3.9 support its own code cannot satisfy (HO-521) | Medium |

Honcho is a **materially healthier and more legible project than Hermes** on every
maintenance axis except license clarity. Its risks are architectural (`08`, `09`), not
organisational.

---

## Consumption recommendation, both upstreams

| Option | Hermes | Honcho |
|---|---|---|
| Direct dependency | **Impossible** (HA-601) | Possible for SDKs, but their license is unresolved (LIC-O-02/03) |
| API / service integration | Only via subprocess boundary — `19` Gate 3, deferred | **The only acceptable mode** — unmodified server, clean HTTP boundary |
| Pinned fork | Rejected — 1,051 commits/week, no stability policy | Rejected — forking AGPL server source creates the §13 modification condition |
| Selective source reuse | Only deterministic utilities | **No** — AGPL |
| **Architectural borrowing** | **Recommended** | **Recommended** |

Neither upstream should be tracked on `main`. Both would be pinned to the audited SHA if
used at all, per the audit's standing rule against automatic upstream tracking.
