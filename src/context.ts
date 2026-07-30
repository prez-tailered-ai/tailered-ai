import type { ContextTelemetry } from "./contracts.js";
import { captureRepositorySnapshot } from "./files.js";
import type { CompanyLedger } from "./ledger.js";

export interface ContextEnvelope {
  snapshot: string;
  telemetry: ContextTelemetry;
}

export class RunContextCache {
  readonly #snapshots = new Map<string, string>();
  #current:
    | {
        repoHash: string;
        snapshot: string;
        snapshotRef: string;
        bytes: number;
      }
    | undefined;

  constructor(
    readonly root: string,
    readonly runId: string,
    readonly causeId: string,
    readonly ledger: CompanyLedger,
  ) {}

  invalidate(): void {
    this.#current = undefined;
  }

  async get(): Promise<ContextEnvelope> {
    const startedAt = performance.now();
    if (this.#current) {
      return {
        snapshot: this.#current.snapshot,
        telemetry: {
          repo_hash: this.#current.repoHash,
          snapshot_ref: this.#current.snapshotRef,
          bytes: this.#current.bytes,
          cache_hit: true,
          assembly_ms: elapsedMilliseconds(startedAt),
        },
      };
    }

    const captured = await captureRepositorySnapshot(this.root, {
      excludeTopLevel: ["evals", "labels", ".tailered"],
    });
    const stored = this.#snapshots.get(captured.repoHash);
    const snapshot = stored ?? addCausalEdge(captured.snapshot, this.causeId);
    const snapshotRef =
      stored === undefined
        ? await this.ledger.writeContextSnapshot(
            this.runId,
            captured.repoHash,
            snapshot,
          )
        : this.ledger.contextSnapshotRef(this.runId, captured.repoHash);
    this.#snapshots.set(captured.repoHash, snapshot);
    this.#current = {
      repoHash: captured.repoHash,
      snapshot,
      snapshotRef,
      bytes: Buffer.byteLength(snapshot),
    };

    return {
      snapshot,
      telemetry: {
        repo_hash: captured.repoHash,
        snapshot_ref: snapshotRef,
        bytes: Buffer.byteLength(snapshot),
        cache_hit: stored !== undefined,
        assembly_ms: elapsedMilliseconds(startedAt),
      },
    };
  }
}

function elapsedMilliseconds(startedAt: number): number {
  return Number((performance.now() - startedAt).toFixed(3));
}

function addCausalEdge(snapshot: string, causeId: string): string {
  const parsed = JSON.parse(snapshot) as {
    repoHash: string;
    files: Array<{ path: string; content: string }>;
  };
  return JSON.stringify({
    ...parsed,
    caused_by: [causeId],
  });
}
