// AUD-RUFLO-20260811-221322 / lane AUD-L7a — spike code, not Tailered runtime.
//
// Guards the adapter applies to its OWN output before emitting it.
// These exist because Tailered's own guards are weaker than they look:
//
//   src/ship.ts:559  if (!file.path.startsWith("product/")) throw ...
//
// That is a TEXTUAL prefix test. "product/../decisions/ADR-000.md" satisfies it,
// and src/files.ts:resolveRepoPath only rejects escapes from the REPOSITORY
// root, not from product/. See finding RUF-710 (PRE-EXISTING TAILERED defect).
// A trustworthy adapter must therefore normalise paths itself and refuse
// anything that does not land inside product/ after normalisation.

import { posix } from "node:path";

const PLACEHOLDER_PATTERNS = [
  /\brest (?:of (?:the )?(?:file|code) )?unchanged\b/iu,
  /\/\/\s*\.\.\.\s*(?:existing|unchanged|rest)/iu,
  /\bTODO\b\s*[:(]/u,
  /\bYOUR[_ ]CODE[_ ]HERE\b/iu,
  /^\s*\.\.\.\s*$/mu,
  /\[(?:truncated|omitted|snip)\]/iu,
];

/** Normalised confinement: the path must resolve INSIDE product/. */
export function assertConfinedToProduct(rawPath) {
  if (typeof rawPath !== "string" || rawPath === "") {
    throw new Error("File proposal path must be a non-empty string.");
  }
  if (rawPath.includes("\0")) {
    throw new Error(`File proposal path contains NUL: ${rawPath}`);
  }
  if (posix.isAbsolute(rawPath) || /^[A-Za-z]:[\\/]/u.test(rawPath)) {
    throw new Error(`File proposal path must be relative: ${rawPath}`);
  }
  if (rawPath.includes("\\")) {
    throw new Error(`File proposal path must use forward slashes: ${rawPath}`);
  }
  const normalised = posix.normalize(rawPath);
  if (normalised === "product" || !normalised.startsWith("product/")) {
    throw new Error(
      `File proposal escapes product/ after normalisation: ${rawPath} -> ${normalised}`,
    );
  }
  if (normalised.split("/").includes("..")) {
    throw new Error(`File proposal path traverses upward: ${rawPath}`);
  }
  return normalised;
}

/** Whole files only. No placeholders, no elisions, no truncation markers. */
export function assertCompleteFile(file) {
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(file.content)) {
      throw new Error(
        `File proposal ${file.path} is not a whole file (matched ${pattern}).`,
      );
    }
  }
  if (!file.content.endsWith("\n")) {
    throw new Error(`File proposal ${file.path} is not newline-terminated.`);
  }
}

export function guardPayload(taskKind, payload, limits) {
  if (taskKind !== "codegen") return payload;
  if (payload === null || typeof payload !== "object" || !Array.isArray(payload.files)) {
    throw new Error("codegen payload must carry a files array.");
  }
  // Tailered accepts `{files: []}` (src/ship.ts:615-618 checks only that it is
  // an array), so an agent whose tool crashed can report a successful, empty
  // codegen. The loop then re-runs the same failing check, burns an attempt,
  // and settles real cost for zero work. Refuse it here.
  if (payload.files.length === 0) {
    throw new Error("codegen produced zero files; refusing to report success.");
  }
  const seen = new Set();
  for (const file of payload.files) {
    if (file === null || typeof file !== "object") {
      throw new Error("codegen file entry must be an object.");
    }
    if (typeof file.content !== "string") {
      throw new Error(`codegen file ${String(file.path)} has non-string content.`);
    }
    const normalised = assertConfinedToProduct(file.path);
    if (seen.has(normalised)) {
      throw new Error(`codegen proposes ${normalised} twice in one response.`);
    }
    seen.add(normalised);
    assertCompleteFile(file);
    const bytes = Buffer.byteLength(file.content);
    if (bytes > limits.maxFileBytes) {
      throw new Error(
        `codegen file ${normalised} is ${bytes} bytes, over the ${limits.maxFileBytes}-byte adapter limit.`,
      );
    }
  }
  return payload;
}
