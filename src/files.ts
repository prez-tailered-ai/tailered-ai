import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  readdir,
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
  const excluded = new Set([
    ...HASH_EXCLUSIONS,
    ...(options.excludeTopLevel ?? []),
  ]);
  const maxBytes = options.maxBytes ?? 512_000;
  const files = await listFiles(root, excluded);
  const entries: Array<{ path: string; content: string }> = [];
  let bytes = 0;

  for (const path of files) {
    const fileStat = await stat(path);
    if (fileStat.size > maxBytes || bytes + fileStat.size > maxBytes) {
      continue;
    }
    const content = await readFile(path, "utf8");
    bytes += Buffer.byteLength(content);
    entries.push({
      path: relative(resolve(root), path).split(sep).join("/"),
      content,
    });
  }

  return JSON.stringify({
    repoHash: await hashDirectory(root, {
      excludeTopLevel: [...excluded],
    }),
    files: entries,
  });
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
