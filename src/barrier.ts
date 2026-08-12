/**
 * Deterministic interleaving points, for tests only.
 *
 * R6 requires contention to be reproduced deterministically rather than by luck: "A test that
 * passes because the race did not happen is not evidence." Proving mutual exclusion means
 * forcing two writers to interleave at the exact boundary where the old code lost, which needs
 * a hook inside the critical section.
 *
 * A hook inside a critical section is also a way to wedge production, so this one is built to
 * be unreachable from outside its own process:
 *
 *   - the registry is an in-process `Map`, empty by default;
 *   - **no environment variable, file, socket, or signal can populate it** — the only way in is
 *     `installBarrier`, called from code already running in the process;
 *   - reaching a barrier with nothing installed costs one `Map.get` and returns synchronously
 *     without allocating a promise.
 *
 * So a deployed process cannot be paused by configuration, by a file an agent wrote, or by
 * anything an attacker can reach. It could only be paused by code that already runs inside it,
 * which is a strictly weaker capability than that code already has.
 */

export type BarrierPoint =
  /** Between reading allocator state and persisting the increment. The original Race A site. */
  | "allocate:after-read"
  /** Between the uniqueness check and the append. The original Race A site, second half. */
  | "append:after-uniqueness"
  /** Before an ADR file is created with `wx`. */
  | "adr:before-create"
  /** Before the finalisation intent is written. */
  | "finalize:before-intent"
  /** Before the terminal `EvalRow` is appended. The Race B site. */
  | "finalize:before-terminal-eval"
  /** Before the finalised marker is written. */
  | "finalize:before-marker";

export const BARRIER_POINTS: readonly BarrierPoint[] = [
  "allocate:after-read",
  "append:after-uniqueness",
  "adr:before-create",
  "finalize:before-intent",
  "finalize:before-terminal-eval",
  "finalize:before-marker",
];

export type BarrierHandler = (context: BarrierContext) => Promise<void> | void;

export interface BarrierContext {
  point: BarrierPoint;
  /** Free-form identification of the caller, so a handler can tell two writers apart. */
  label?: string | undefined;
}

const handlers = new Map<BarrierPoint, BarrierHandler>();

/**
 * Reach a barrier. A no-op unless a handler was installed in this process.
 *
 * Returns synchronously when nothing is installed so the production path does not pay for an
 * awaited promise on every allocation and append.
 */
export function barrier(point: BarrierPoint, label?: string): void | Promise<void> {
  const handler = handlers.get(point);
  if (handler === undefined) return;
  return Promise.resolve(handler({ point, label }));
}

/** Test-only. Returns an uninstall function. */
export function installBarrier(point: BarrierPoint, handler: BarrierHandler): () => void {
  handlers.set(point, handler);
  return () => {
    if (handlers.get(point) === handler) handlers.delete(point);
  };
}

/** Test-only. Removes every installed handler. */
export function clearBarriers(): void {
  handlers.clear();
}

/** True when any handler is installed. Used by tests to assert they cleaned up after themselves. */
export function barriersInstalled(): number {
  return handlers.size;
}
