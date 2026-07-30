import type { RunOutcome } from "./contracts.js";

export class TaileredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends TaileredError {}

export class AppendOnlyViolationError extends TaileredError {}

export class AccountingInvariantError extends TaileredError {}

export class RunHaltError extends TaileredError {
  constructor(
    readonly outcome: Exclude<RunOutcome, "shipped">,
    readonly blocker: string,
  ) {
    super(blocker);
  }
}

export class BudgetHaltError extends RunHaltError {
  constructor(blocker: string) {
    super("halted_budget", blocker);
  }
}

export class AttemptsHaltError extends RunHaltError {
  constructor(blocker: string) {
    super("halted_attempts", blocker);
  }
}

export class RejectedRunError extends RunHaltError {
  constructor(blocker: string) {
    super("rejected", blocker);
  }
}
