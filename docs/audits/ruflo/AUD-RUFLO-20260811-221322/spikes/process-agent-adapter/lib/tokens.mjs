// AUD-RUFLO-20260811-221322 / lane AUD-L7a — spike code, not Tailered runtime.
// Deterministic, MEASURED token accounting + cost. No provider call, no network.
//
// VERIFIED: countTokens() is a pure function of its input string; identical input
//           yields an identical integer on every invocation and every process.
// INFERRED: the mapping from these units to a specific provider's BPE tokenizer.
//           A real adapter MUST replace countTokens() with the provider-reported
//           usage from the API response, never with an estimate.

const TOKEN_UNIT = /[A-Za-z]+|\d|[^\sA-Za-z\d]/gu;

/** Deterministic unit count over a string. Pure; no state. */
export function countTokens(text) {
  if (typeof text !== "string") {
    throw new TypeError("countTokens requires a string.");
  }
  const matches = text.match(TOKEN_UNIT);
  return matches === null ? 0 : matches.length;
}

// Pinned local price table. Keys are the model ALIASES that
// tailered.config.json ships with (models.frontier/mid/cheap). Prices are
// micro-USD per 1000 tokens and are FICTIONAL fixtures for the mock engine.
// A real adapter reads price from the provider invoice/response, not from here.
const PRICE_MICROS_PER_1K = Object.freeze({
  "best-available": { input: 3000, output: 15000 },
  "mid-available": { input: 300, output: 1500 },
  "cheap-available": { input: 80, output: 400 },
});

export function priceTableHas(model) {
  return Object.hasOwn(PRICE_MICROS_PER_1K, model);
}

/**
 * Cost in whole micro-USD, then converted to USD with exactly the same
 * rounding Tailered's money.ts uses (micros are the integer unit of account).
 * Returning a value that is not an exact multiple of 1e-6 would make
 * ReserveSettleBudget.settle() round it, so we round here, deliberately.
 */
export function costUsd(model, inputTokens, outputTokens) {
  const rate = PRICE_MICROS_PER_1K[model];
  if (rate === undefined) {
    throw new Error(`No pinned price for model alias: ${model}`);
  }
  const micros =
    Math.ceil((inputTokens * rate.input) / 1000) +
    Math.ceil((outputTokens * rate.output) / 1000);
  return Number((micros / 1_000_000).toFixed(6));
}
