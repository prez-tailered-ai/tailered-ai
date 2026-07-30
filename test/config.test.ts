import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_COMPANY_CONFIG,
  parseCompanyConfig,
} from "../src/config.js";
import { ValidationError } from "../src/errors.js";

test("company config preserves the v1 bounds and central model aliases", () => {
  const parsed = parseCompanyConfig(structuredClone(DEFAULT_COMPANY_CONFIG));

  assert.deepEqual(parsed, DEFAULT_COMPANY_CONFIG);
  assert.equal(parsed.models.frontier, "best-available");
  assert.equal(parsed.bounds.maxCostPerRunUsdExclusive, 5);
});

test("company config cannot widen a contracted v1 bound", () => {
  const config = structuredClone(DEFAULT_COMPANY_CONFIG);
  config.bounds.maxAttemptsPerCheck = 4;

  assert.throws(() => parseCompanyConfig(config), ValidationError);
});
