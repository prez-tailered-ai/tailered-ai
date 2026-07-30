import { ValidationError } from "./errors.js";

export const USD_MICROS = 1_000_000;

export function usdToMicros(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new ValidationError(`USD value must be finite and non-negative: ${value}`);
  }

  const micros = Math.round(value * USD_MICROS);
  if (!Number.isSafeInteger(micros)) {
    throw new ValidationError(`USD value exceeds the supported range: ${value}`);
  }
  return micros;
}

export function microsToUsd(micros: number): number {
  if (!Number.isSafeInteger(micros) || micros < 0) {
    throw new ValidationError(`Micro-USD value must be a non-negative integer: ${micros}`);
  }
  return Number((micros / USD_MICROS).toFixed(6));
}
