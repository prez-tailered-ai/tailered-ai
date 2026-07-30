import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  BOUNDS,
  type CompanyConfig,
  type ModelRegistry,
  type ModelTier,
} from "./contracts.js";
import { ValidationError } from "./errors.js";

const MODEL_TIERS: ModelTier[] = ["frontier", "mid", "cheap"];

export const DEFAULT_COMPANY_CONFIG: CompanyConfig = Object.freeze({
  version: 1,
  models: Object.freeze({
    frontier: "best-available",
    mid: "mid-available",
    cheap: "cheap-available",
  }),
  bounds: Object.freeze({
    maxAttemptsPerCheck: BOUNDS.maxAttemptsPerCheck,
    maxCostPerRunUsdExclusive: BOUNDS.maxCostPerRunUsd,
    demoTimeMinutes: BOUNDS.demoTimeMinutes,
  }),
});

export async function loadCompanyConfig(root: string): Promise<CompanyConfig> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      await readFile(resolve(root, "tailered.config.json"), "utf8"),
    ) as unknown;
  } catch (error) {
    throw new ValidationError(
      `Cannot read tailered.config.json: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return parseCompanyConfig(parsed);
}

export function parseCompanyConfig(value: unknown): CompanyConfig {
  if (!isRecord(value) || value.version !== 1) {
    throw new ValidationError("tailered.config.json version must be 1.");
  }
  if (!isRecord(value.models)) {
    throw new ValidationError("tailered.config.json models must be an object.");
  }
  if (!isRecord(value.bounds)) {
    throw new ValidationError("tailered.config.json bounds must be an object.");
  }

  const models = {} as ModelRegistry;
  for (const tier of MODEL_TIERS) {
    const alias = value.models[tier];
    if (typeof alias !== "string" || alias.trim() === "") {
      throw new ValidationError(
        `tailered.config.json models.${tier} must be a non-empty alias.`,
      );
    }
    models[tier] = alias;
  }

  const maxAttemptsPerCheck = integerBound(
    value.bounds.maxAttemptsPerCheck,
    "bounds.maxAttemptsPerCheck",
  );
  const maxCostPerRunUsdExclusive = numberBound(
    value.bounds.maxCostPerRunUsdExclusive,
    "bounds.maxCostPerRunUsdExclusive",
  );
  const demoTimeMinutes = numberBound(
    value.bounds.demoTimeMinutes,
    "bounds.demoTimeMinutes",
  );

  if (maxAttemptsPerCheck > BOUNDS.maxAttemptsPerCheck) {
    throw new ValidationError(
      `bounds.maxAttemptsPerCheck cannot exceed the v1 limit of ${BOUNDS.maxAttemptsPerCheck}.`,
    );
  }
  if (maxCostPerRunUsdExclusive > BOUNDS.maxCostPerRunUsd) {
    throw new ValidationError(
      `bounds.maxCostPerRunUsdExclusive cannot exceed the v1 limit of $${BOUNDS.maxCostPerRunUsd.toFixed(2)}.`,
    );
  }
  if (demoTimeMinutes > BOUNDS.demoTimeMinutes) {
    throw new ValidationError(
      `bounds.demoTimeMinutes cannot exceed the v1 limit of ${BOUNDS.demoTimeMinutes}.`,
    );
  }

  return {
    version: 1,
    models,
    bounds: {
      maxAttemptsPerCheck,
      maxCostPerRunUsdExclusive,
      demoTimeMinutes,
    },
  };
}

function integerBound(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new ValidationError(`${name} must be a positive integer.`);
  }
  return value as number;
}

function numberBound(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ValidationError(`${name} must be a positive finite number.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
