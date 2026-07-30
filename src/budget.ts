import type { ModelTier } from "./contracts.js";
import {
  AccountingInvariantError,
  BudgetHaltError,
  ValidationError,
} from "./errors.js";
import { microsToUsd, usdToMicros } from "./money.js";

interface Reservation {
  id: string;
  tier: ModelTier;
  projectedMicros: number;
  projectedTokens: number;
}

export interface BudgetSnapshot {
  capUsd: number;
  settledUsd: number;
  reservedUsd: number;
  availableUsdExclusive: number;
  tokensByTier: Record<ModelTier, number>;
}

export class ReserveSettleBudget {
  readonly #capMicros: number;
  readonly #reservations = new Map<string, Reservation>();
  readonly #tokensByTier: Record<ModelTier, number> = {
    frontier: 0,
    mid: 0,
    cheap: 0,
  };
  #settledMicros = 0;
  #sequence = 0;

  constructor(capUsd: number) {
    this.#capMicros = usdToMicros(capUsd);
    if (this.#capMicros <= 0) {
      throw new ValidationError("Budget cap must be greater than zero.");
    }
  }

  reserve(tier: ModelTier, projectedCostUsd: number, projectedTokens: number): string {
    const projectedMicros = usdToMicros(projectedCostUsd);
    if (!Number.isSafeInteger(projectedTokens) || projectedTokens < 0) {
      throw new ValidationError("Projected tokens must be a non-negative integer.");
    }

    const projectedTotal =
      this.#settledMicros + this.#reservedMicros() + projectedMicros;
    if (projectedTotal >= this.#capMicros) {
      throw new BudgetHaltError(
        `Budget reservation denied: projected total $${microsToUsd(projectedTotal).toFixed(6)} is not below the exclusive $${microsToUsd(this.#capMicros).toFixed(2)} cap.`,
      );
    }

    const id = `reservation-${String(++this.#sequence).padStart(4, "0")}`;
    this.#reservations.set(id, {
      id,
      tier,
      projectedMicros,
      projectedTokens,
    });
    return id;
  }

  settle(
    reservationId: string,
    actualCostUsd: number,
    actualTokens: number,
  ): void {
    const reservation = this.#requireReservation(reservationId);
    const actualMicros = usdToMicros(actualCostUsd);
    if (!Number.isSafeInteger(actualTokens) || actualTokens < 0) {
      throw new ValidationError("Actual tokens must be a non-negative integer.");
    }
    if (actualMicros > reservation.projectedMicros) {
      this.#reservations.delete(reservationId);
      this.#settledMicros += actualMicros;
      this.#tokensByTier[reservation.tier] += actualTokens;
      throw new AccountingInvariantError(
        `Settlement $${microsToUsd(actualMicros).toFixed(6)} exceeds reservation $${microsToUsd(reservation.projectedMicros).toFixed(6)}. Agent projections must be hard ceilings.`,
      );
    }
    if (actualTokens > reservation.projectedTokens) {
      this.#reservations.delete(reservationId);
      this.#settledMicros += actualMicros;
      this.#tokensByTier[reservation.tier] += actualTokens;
      throw new AccountingInvariantError(
        `Settlement ${actualTokens} tokens exceeds the ${reservation.projectedTokens}-token reservation.`,
      );
    }

    this.#reservations.delete(reservationId);
    this.#settledMicros += actualMicros;
    this.#tokensByTier[reservation.tier] += actualTokens;
  }

  settleProjection(reservationId: string): void {
    const reservation = this.#requireReservation(reservationId);
    this.settle(
      reservationId,
      microsToUsd(reservation.projectedMicros),
      reservation.projectedTokens,
    );
  }

  snapshot(): BudgetSnapshot {
    const reservedMicros = this.#reservedMicros();
    return {
      capUsd: microsToUsd(this.#capMicros),
      settledUsd: microsToUsd(this.#settledMicros),
      reservedUsd: microsToUsd(reservedMicros),
      availableUsdExclusive: microsToUsd(
        Math.max(0, this.#capMicros - this.#settledMicros - reservedMicros - 1),
      ),
      tokensByTier: { ...this.#tokensByTier },
    };
  }

  assertSettled(): void {
    if (this.#reservations.size > 0) {
      throw new AccountingInvariantError(
        `${this.#reservations.size} budget reservation(s) remain unsettled.`,
      );
    }
  }

  #reservedMicros(): number {
    let total = 0;
    for (const reservation of this.#reservations.values()) {
      total += reservation.projectedMicros;
    }
    return total;
  }

  #requireReservation(reservationId: string): Reservation {
    const reservation = this.#reservations.get(reservationId);
    if (!reservation) {
      throw new AccountingInvariantError(
        `Unknown or already-settled reservation: ${reservationId}`,
      );
    }
    return reservation;
  }
}
