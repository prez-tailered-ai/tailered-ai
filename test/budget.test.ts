import assert from "node:assert/strict";
import test from "node:test";
import { ReserveSettleBudget } from "../src/budget.js";
import {
  AccountingInvariantError,
  BudgetHaltError,
} from "../src/errors.js";

test("reserve enforces an exclusive five-dollar boundary before spending", () => {
  const budget = new ReserveSettleBudget(5);

  assert.throws(() => budget.reserve("mid", 5, 1), BudgetHaltError);
  const reservation = budget.reserve("mid", 4.999999, 10);
  budget.settle(reservation, 4.999999, 10);

  assert.equal(budget.snapshot().settledUsd, 4.999999);
  assert.throws(() => budget.reserve("cheap", 0.000001, 1), BudgetHaltError);
  budget.assertSettled();
});

test("settlement releases unused reservation and records actuals", () => {
  const budget = new ReserveSettleBudget(5);
  const reservation = budget.reserve("frontier", 2, 1_000);

  budget.settle(reservation, 0.75, 240);

  assert.deepEqual(budget.snapshot(), {
    capUsd: 5,
    settledUsd: 0.75,
    reservedUsd: 0,
    availableUsdExclusive: 4.249999,
    tokensByTier: { frontier: 240, mid: 0, cheap: 0 },
  });
});

test("an agent cannot settle above its hard reservation ceiling", () => {
  const budget = new ReserveSettleBudget(5);
  const reservation = budget.reserve("mid", 1, 100);

  assert.throws(
    () => budget.settle(reservation, 1.1, 100),
    AccountingInvariantError,
  );
  assert.equal(budget.snapshot().settledUsd, 1.1);
  budget.assertSettled();
});
