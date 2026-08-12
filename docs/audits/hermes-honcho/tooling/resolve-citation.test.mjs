/**
 * Regression tests for the audit harness defect disclosed in 01-baseline-and-methodology.md.
 *
 * Run:  node --test docs/audits/hermes-honcho/tooling/
 *
 * Self-contained: no network, no frozen checkouts, no dependencies. Existence is injected.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { resolveCitation, bindRepo, REPOS } from "./resolve-citation.mjs";

const ROOTS = {
  "hermes-agent": "/frozen/hermes-agent",
  honcho: "/frozen/honcho",
  "tailered-ai": "/frozen/tailered-ai",
};

/** Pretend only these paths exist, in these repos. */
const PRESENT = new Set([
  "/frozen/hermes-agent/agent/curator.py",
  "/frozen/hermes-agent/tools/approval.py",
  "/frozen/honcho/src/crud/document.py",
  "/frozen/tailered-ai/src/ship.ts",
]);
const exists = (p) => PRESENT.has(p);

test("resolves a Hermes path to an immutable Hermes permalink at the frozen SHA", () => {
  const r = resolveCitation("agent/curator.py:452-459", ROOTS, exists);
  assert.equal(r.repo, "hermes-agent");
  assert.match(r.url, /^https:\/\/github\.com\/NousResearch\/hermes-agent\/blob\/ed5e17f4b86da0c4f09c0694757b6074ae6b9d16\//u);
  assert.match(r.url, /#L452-L459$/u);
});

test("resolves a Honcho path to Honcho, not to Hermes", () => {
  const r = resolveCitation("src/crud/document.py:685", ROOTS, exists);
  assert.equal(r.repo, "honcho");
  assert.match(r.url, /plastic-labs\/honcho\/blob\/a92fb1e0789fd29e9674aec133328513ed0dcda3\//u);
});

test("resolves a Tailered path to the target repository", () => {
  const r = resolveCitation("src/ship.ts:420", ROOTS, exists);
  assert.equal(r.repo, "tailered-ai");
  assert.match(r.url, /prez-tailered-ai\/tailered-ai\/blob\/6172653e0aca0981d0abaf4ad8e9d587667737e9\//u);
});

test("strips a leading repo-name segment before resolving", () => {
  const r = resolveCitation("hermes-agent/tools/approval.py:382", ROOTS, exists);
  assert.equal(r.repo, "hermes-agent");
  assert.equal(r.label, "tools/approval.py:382");
});

// ---------------------------------------------------------------------------
// THE DEFECT THIS FILE EXISTS TO PREVENT
// ---------------------------------------------------------------------------

test("REGRESSION: an absolute path is rejected, never attributed to a repository", () => {
  // path.join(root, "/abs") discards root and returns "/abs", so a naive existence check
  // succeeds against whichever repo is tested first. That silently attributed an
  // out-of-scope file to Hermes during this audit.
  const leaked = "/Users/someone/src/other-project/server/route.ts";
  const always = () => true; // worst case: everything "exists"
  const r = resolveCitation(leaked, ROOTS, always);
  assert.equal(r.repo, null, "absolute path must not be attributed to any repository");
  assert.equal(r.reason, "absolute-path-rejected");
});

test("REGRESSION: attribution is by path existence, never by identifier prefix", () => {
  // Same citation, two ids whose prefixes point at different repos. The id must not matter.
  const viaHermesLookingId = resolveCitation("src/crud/document.py:685", ROOTS, exists);
  const viaHonchoLookingId = resolveCitation("src/crud/document.py:685", ROOTS, exists);
  assert.equal(viaHermesLookingId.repo, "honcho");
  assert.deepEqual(viaHermesLookingId, viaHonchoLookingId);

  // And a path that exists nowhere resolves to nothing rather than guessing.
  const missing = resolveCitation("agent/does_not_exist.py:1", ROOTS, exists);
  assert.equal(missing.repo, null);
  assert.equal(missing.reason, "not-found-in-any-frozen-checkout");
});

test("REGRESSION: fan-out work items must carry an explicit repo key", () => {
  assert.throws(
    () => bindRepo({ id: "CLAIM-something-about-hermes" }),
    /explicit repo key/u,
    "a work item without a repo key must be rejected, not inferred from its id",
  );
  assert.throws(() => bindRepo({ id: "HA-101", repo: "not-a-repo" }), /explicit repo key/u);
  assert.equal(bindRepo({ id: "HA-101", repo: "hermes-agent" }).key, "hermes-agent");
});

test("every frozen repo pin is a full 40-character commit SHA", () => {
  for (const r of REPOS) {
    assert.match(r.sha, /^[0-9a-f]{40}$/u, `${r.key} must pin a full SHA, not a branch`);
  }
});
