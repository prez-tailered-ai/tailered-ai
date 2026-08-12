# 27 — Erratum

**Append-only.** No statement in artifacts 00-26 is deleted or rewritten. The original text
stands as the historical record of what the audit concluded at its frozen baseline. This
file records what was later shown to be wrong, and what is true now.

**These corrections do not change the audit verdict or the disposition counts.** The verdict
remains *adopt nothing as-is*. The counts remain 0 ADOPT · 0 REPLACE · 1 ADAPT ·
1 INTEROPERATE (gated) · 7 REFERENCE · 4 DEFER · 7 REJECT. No disposition moves. No risk
register entry changes state. R-01 remains OPEN.

| Term | Meaning here |
|---|---|
| **Audit baseline** | `6172653e0aca0981d0abaf4ad8e9d587667737e9` — the frozen target commit |
| **Current main** | The state after the P0-A corrective closure merged at `978fbcc31577f6378b8dca4564ceafa6473f1c5e` |

---

## E-01 — TA-003

**Original statement**, [`11-tailered-gap-matrix.md`](11-tailered-gap-matrix.md) row TA-003:

> Agent and gate writes are restricted to `product/` — **VERIFIED** (POC-A), citing
> `src/ship.ts:557-569`.

**Correction:**

```text
AT AUDIT BASELINE 6172653e:
REFUTED.
The runtime used a textual product/ prefix check. In-repository traversal and
symlink redirection could mutate protected files while the run reported shipped.
CURRENT STATE:
VERIFIED after P0-A corrective closure on main.
```

**Why the original was wrong.** The cited code tested a string prefix. `product/../decisions/ADR-000.md` satisfies that prefix and resolves outside the capability root. The
run reported `outcome: "shipped"` while the charter was overwritten. Six escape classes
succeeded at the baseline; four further classes survived the first fix and were closed by
the corrective merge.

**Evidence for the current state:**
[`docs/foundation/p0-agent-safety/p0-a/report.md`](../../foundation/p0-agent-safety/p0-a/report.md),
[`p0-a/test-matrix.md`](../../foundation/p0-agent-safety/p0-a/test-matrix.md),
[`p0-a/evidence/threat-matrix-v2-caproot.txt`](../../foundation/p0-agent-safety/p0-a/evidence/threat-matrix-v2-caproot.txt),
[`corrective/CLOSURE-RECEIPT.md`](../../foundation/p0-agent-safety/corrective/CLOSURE-RECEIPT.md).

---

## E-02 — TA-004

**Original statement**, [`11-tailered-gap-matrix.md`](11-tailered-gap-matrix.md) row TA-004:

> Path traversal rejected; repository-relative paths only — **VERIFIED** (POC-A), citing
> `src/files.ts:16-32`.

That row conflated two distinct claims. It is split here.

**Correction:**

```text
Repository-root escape rejection:
VERIFIED at the audit baseline.
Containment beneath the product/ capability root:
REFUTED at the audit baseline.
VERIFIED after P0-A corrective closure.
```

**Why the original was wrong.** `resolveRepoPath` proves only that a resolved path stays
inside the repository root. An in-repository sideways hop never leaves that root, so the
function returns successfully for a path that escapes `product/`. The cited lines are
correct for the first claim and prove nothing about the second.

---

## E-03 — POC-A scope

**Original statement**, [`00-executive-verdict.md`](00-executive-verdict.md):

> POC-A: path traversal | halted; file **absent from disk**

**Correction:**

```text
POC-A proved that the tested repository-root escape payload was rejected.
It did not prove containment against in-repository traversal or a moved
capability root.
```

**Why the original was wrong.** POC-A executed `product/../../../tmp/...`, which escapes the
repository root and is correctly refused. The result was generalised to a path-guard
conclusion. Two untested classes — in-repository traversal, and a capability root that is
itself a symbolic link — were both live at the baseline.

---

## The generalisable lesson

All three errors share one shape: **a guard was tested against attacker-supplied input, and
never against a moved boundary.** POC-A varied the payload. It never varied `product/`
itself. A threat model organised only around attacker input cannot see an attack that moves
the defender's reference point.

This is recorded here because it is the transferable finding, and because the same mistake
recurred once inside the remediation itself before the merge gate caught it. Full account:
[`p0-a/report.md` section 16](../../foundation/p0-agent-safety/p0-a/report.md).

---

## What is unchanged

- The verdict, the 20 terminal dispositions, and the disposition counts.
- Every finding about Hermes and about Honcho. Neither upstream system is implicated; both
  errors concern the target's own invariant register.
- **R-01, the ledger concurrency defect, remains OPEN.** It is untouched by P0-A and is the
  subject of a separate remediation.
- The frozen baselines. This erratum does not re-freeze or re-audit anything.
- Every citation in artifacts 00-26 remains a valid permalink at its frozen commit.
