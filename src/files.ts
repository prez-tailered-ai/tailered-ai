import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { ValidationError } from "./errors.js";

const HASH_EXCLUSIONS = new Set([".git", "node_modules", "dist"]);

export function resolveRepoPath(root: string, relativePath: string): string {
  if (isAbsolute(relativePath) || relativePath.includes("\0")) {
    throw new ValidationError(`Path must be repository-relative: ${relativePath}`);
  }

  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(resolvedRoot, relativePath);
  const fromRoot = relative(resolvedRoot, resolvedPath);
  if (
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromRoot)
  ) {
    throw new ValidationError(`Path escapes repository root: ${relativePath}`);
  }
  return resolvedPath;
}

/**
 * Resolves a repository-relative path against a capability root and proves the
 * destination lies strictly beneath that root's canonical subtree.
 *
 * This is the single enforcement point for externally supplied write paths —
 * agent code generation, critique repair, and founder gate edits all route
 * through it. A string prefix test is not sufficient: `product/../decisions/x`
 * starts with `product/` yet resolves outside it, and a symlink beneath the root
 * can redirect a lexically contained path anywhere on the filesystem.
 *
 * Fails closed: containment must be positively established, or the write is
 * refused. The residual TOCTOU boundary is documented in
 * docs/foundation/p0-agent-safety/p0-a/containment-contract.md.
 */
export async function resolveContainedWritePath(
  root: string,
  capabilityRoot: string,
  relativePath: string,
): Promise<string> {
  const requested = resolveRepoPath(root, relativePath);
  const lexicalCapabilityRoot = resolveRepoPath(root, capabilityRoot);

  const withinRoot = relative(lexicalCapabilityRoot, requested);
  if (
    withinRoot === "" ||
    withinRoot === ".." ||
    withinRoot.startsWith(`..${sep}`) ||
    isAbsolute(withinRoot)
  ) {
    throw new ValidationError(
      `Path escapes the ${capabilityRoot} capability root: ${relativePath}`,
    );
  }

  // The capability root must itself be a real directory, reached without
  // traversing a symbolic link at any point below the repository root.
  // Canonicalising it instead — `realpath(root/product)` — would silently
  // ACCEPT a symlinked `product/` and adopt its target as the boundary, which
  // makes the boundary whatever the link points at. Symlinks ABOVE the
  // repository root belong to the operator's own filesystem layout (`/tmp` ->
  // `/private/tmp`), are not agent-reachable, and are resolved here once.
  let canonicalCapabilityRoot: string;
  try {
    canonicalCapabilityRoot = await realpath(root);
  } catch (error) {
    throw new ValidationError(
      `Repository root is unavailable, so containment cannot be established: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const capabilitySegments = relative(resolve(root), lexicalCapabilityRoot)
    .split(sep)
    .filter((segment) => segment !== "");
  for (const segment of capabilitySegments) {
    const candidate = resolve(canonicalCapabilityRoot, segment);
    let entry;
    try {
      entry = await lstat(candidate);
    } catch (error) {
      throw new ValidationError(
        `Capability root ${capabilityRoot} is unavailable, so containment cannot be established: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    if (entry.isSymbolicLink()) {
      throw new ValidationError(
        `Capability root ${capabilityRoot} traverses a symbolic link and cannot be contained: ${relativePath}`,
      );
    }
    if (!entry.isDirectory()) {
      throw new ValidationError(
        `Capability root ${capabilityRoot} is not a directory, so containment cannot be established: ${relativePath}`,
      );
    }
    canonicalCapabilityRoot = candidate;
  }

  // Walk each component that already exists. A symlink anywhere on the path can
  // be repointed at any moment, so it can never be part of a proven containment
  // decision — reject rather than resolve.
  let inspected = canonicalCapabilityRoot;
  for (const segment of withinRoot.split(sep)) {
    const candidate = resolve(inspected, segment);
    let entry;
    try {
      entry = await lstat(candidate);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        // This component does not exist yet, so no deeper component can either.
        break;
      }
      throw new ValidationError(
        `Cannot establish containment for ${relativePath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    if (entry.isSymbolicLink()) {
      throw new ValidationError(
        `Path traverses a symbolic link and cannot be contained: ${relativePath}`,
      );
    }
    inspected = candidate;
  }

  const canonicalWithinRoot = relative(canonicalCapabilityRoot, inspected);
  if (
    canonicalWithinRoot !== "" &&
    (canonicalWithinRoot === ".." ||
      canonicalWithinRoot.startsWith(`..${sep}`) ||
      isAbsolute(canonicalWithinRoot))
  ) {
    throw new ValidationError(
      `Path resolves outside the ${capabilityRoot} capability root: ${relativePath}`,
    );
  }

  return resolve(canonicalCapabilityRoot, withinRoot);
}

export async function writeAtomic(
  targetPath: string,
  content: string,
): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.tailered-${randomUUID()}.tmp`;
  await writeFile(temporaryPath, content, { encoding: "utf8", flag: "wx" });
  await rename(temporaryPath, targetPath);
}

export async function writeNewFile(
  targetPath: string,
  content: string,
): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content, { encoding: "utf8", flag: "wx" });
}

export async function appendJsonLine(
  targetPath: string,
  value: unknown,
): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  const handle = await open(targetPath, "a");
  try {
    await handle.write(`${JSON.stringify(value)}\n`, null, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function readJsonLines<T>(targetPath: string): Promise<T[]> {
  let content: string;
  try {
    content = await readFile(targetPath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const rows: T[] = [];
  for (const [index, line] of content.split("\n").entries()) {
    if (line.trim() === "") {
      continue;
    }
    try {
      rows.push(JSON.parse(line) as T);
    } catch (error) {
      throw new ValidationError(
        `Invalid JSONL at ${targetPath}:${index + 1}: ${String(error)}`,
      );
    }
  }
  return rows;
}

export async function hashDirectory(
  root: string,
  options: { excludeTopLevel?: string[] } = {},
): Promise<string> {
  const excluded = new Set([
    ...HASH_EXCLUSIONS,
    ...(options.excludeTopLevel ?? []),
  ]);
  const files = await listFiles(root, excluded);
  const hash = createHash("sha256");

  for (const path of files) {
    const relativePath = relative(resolve(root), path).split(sep).join("/");
    hash.update(relativePath);
    hash.update("\0");
    hash.update(await readFile(path));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function snapshotRepository(
  root: string,
  options: {
    excludeTopLevel?: string[];
    maxBytes?: number;
  } = {},
): Promise<string> {
  return (await captureRepositorySnapshot(root, options)).snapshot;
}

export interface RepositorySnapshot {
  repoHash: string;
  snapshot: string;
  bytes: number;
}

export async function captureRepositorySnapshot(
  root: string,
  options: {
    excludeTopLevel?: string[];
    maxBytes?: number;
  } = {},
): Promise<RepositorySnapshot> {
  const excluded = new Set([
    ...HASH_EXCLUSIONS,
    ...(options.excludeTopLevel ?? []),
  ]);
  const maxBytes = options.maxBytes ?? 512_000;
  const files = await listFiles(root, excluded);
  const entries: Array<{ path: string; content: string }> = [];
  const hash = createHash("sha256");
  let includedBytes = 0;

  for (const path of files) {
    const relativePath = relative(resolve(root), path).split(sep).join("/");
    const fileStat = await stat(path);
    const content = await readFile(path);
    hash.update(relativePath);
    hash.update("\0");
    hash.update(content);
    hash.update("\0");

    if (
      fileStat.size > maxBytes ||
      includedBytes + fileStat.size > maxBytes
    ) {
      continue;
    }
    includedBytes += fileStat.size;
    entries.push({
      path: relativePath,
      content: content.toString("utf8"),
    });
  }

  const repoHash = hash.digest("hex");
  const snapshot = JSON.stringify({
    repoHash,
    files: entries,
  });
  return {
    repoHash,
    snapshot,
    bytes: Buffer.byteLength(snapshot),
  };
}

async function listFiles(root: string, excludedTopLevel: Set<string>): Promise<string[]> {
  const resolvedRoot = resolve(root);
  const results: string[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      const relativePath = relative(resolvedRoot, path);
      const topLevel = relativePath.split(sep)[0];
      if (topLevel && excludedTopLevel.has(topLevel)) {
        continue;
      }
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        results.push(path);
      }
    }
  }

  try {
    await visit(resolvedRoot);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return results;
}

export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
