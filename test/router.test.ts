import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_COMPANY_CONFIG } from "../src/config.js";
import { route } from "../src/router.js";

test("router is stateless and escalates only the third codegen attempt", () => {
  const models = DEFAULT_COMPANY_CONFIG.models;
  assert.equal(route("codegen", { attempts: 0 }, models).tier, "mid");
  assert.equal(route("codegen", { attempts: 1 }, models).tier, "mid");
  assert.equal(route("codegen", { attempts: 2 }, models).tier, "frontier");
  assert.equal(route("codegen", { attempts: 3 }, models).tier, "mid");
  assert.equal(route("codegen", { attempts: 2 }, models).tier, "frontier");
});

test("router maps task kinds to the contract tiers", () => {
  const models = DEFAULT_COMPANY_CONFIG.models;
  assert.equal(route("testgen", { attempts: 0 }, models).tier, "mid");
  assert.equal(route("critique", { attempts: 0 }, models).tier, "mid");
  assert.equal(route("narrate", { attempts: 0 }, models).tier, "cheap");
  assert.equal(route("adr_draft", { attempts: 0 }, models).tier, "cheap");
  assert.equal(route("judge", { attempts: 0 }, models).tier, "frontier");
});

test("router model identity comes only from the supplied registry", () => {
  const models = {
    frontier: "frontier-swapped",
    mid: "mid-swapped",
    cheap: "cheap-swapped",
  };

  assert.equal(
    route("codegen", { attempts: 2 }, models).model,
    "frontier-swapped",
  );
  assert.equal(
    route("critique", { attempts: 0 }, models).model,
    "mid-swapped",
  );
  assert.equal(
    route("adr_draft", { attempts: 0 }, models).model,
    "cheap-swapped",
  );
});
