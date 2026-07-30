import assert from "node:assert/strict";
import test from "node:test";
import { route } from "../src/router.js";

test("router is stateless and escalates only the third codegen attempt", () => {
  assert.equal(route("codegen", { attempts: 0 }).tier, "mid");
  assert.equal(route("codegen", { attempts: 1 }).tier, "mid");
  assert.equal(route("codegen", { attempts: 2 }).tier, "frontier");
  assert.equal(route("codegen", { attempts: 3 }).tier, "mid");
  assert.equal(route("codegen", { attempts: 2 }).tier, "frontier");
});

test("router maps task kinds to the contract tiers", () => {
  assert.equal(route("testgen").tier, "mid");
  assert.equal(route("critique").tier, "mid");
  assert.equal(route("narrate").tier, "cheap");
  assert.equal(route("adr_draft").tier, "cheap");
  assert.equal(route("judge").tier, "frontier");
});
