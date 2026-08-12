/**
 * Citation resolver for the Hermes/Honcho audit.
 *
 * Converts a `path:line` citation into an immutable GitHub permalink.
 *
 * INVARIANT (the reason this file exists):
 *   The repository a citation belongs to is determined ONLY by checking whether the cited
 *   path actually exists in that frozen checkout. It is NEVER inferred from a finding-id
 *   prefix, a label, or any other model-authored string.
 *
 * The audit disclosed a harness defect in which verification work was routed to a repository
 * by an id-prefix heuristic. Synthesised ids did not match the heuristic, 19 verifications
 * were pointed at the wrong checkout, and every one returned "REFUTED — cited files do not
 * exist," which is indistinguishable from a genuine refutation unless the reasoning is read.
 *
 * `resolve-citation.test.mjs` locks both that invariant and the absolute-path trap below.
 */
import { existsSync } from "node:fs";
import { join, isAbsolute } from "node:path";

/** Frozen upstream references (read-only) and the target repository. */
export const REPOS = [
  {
    key: "hermes-agent",
    url: "https://github.com/NousResearch/hermes-agent",
    sha: "ed5e17f4b86da0c4f09c0694757b6074ae6b9d16",
    strip: ["hermes-agent/"],
  },
  {
    key: "honcho",
    url: "https://github.com/plastic-labs/honcho",
    sha: "a92fb1e0789fd29e9674aec133328513ed0dcda3",
    strip: ["honcho/"],
  },
  {
    key: "tailered-ai",
    url: "https://github.com/prez-tailered-ai/tailered-ai",
    sha: "6172653e0aca0981d0abaf4ad8e9d587667737e9",
    strip: ["tailered-ai/"],
  },
];

const CITATION = /^([A-Za-z0-9_./-]+\.[A-Za-z0-9_]+)(?::(\d+)(?:-(\d+))?)?$/u;

/**
 * @param {string} citation  e.g. "agent/curator.py:452-459"
 * @param {Record<string,string>} roots  repo key -> local checkout root
 * @param {(p: string) => boolean} [exists]  injectable for tests
 * @returns {{repo: string|null, url: string|null, label: string, reason?: string}}
 */
export function resolveCitation(citation, roots, exists = existsSync) {
  const raw = String(citation ?? "").trim().replace(/^`|`$/gu, "");

  // An absolute path is never a valid citation. It is local-machine leakage, and — the
  // trap — path.join(root, "/abs/path") DISCARDS the root and returns the absolute path,
  // so an existence check would succeed against every repository in turn and attribute the
  // citation to whichever was tested first.
  if (isAbsolute(raw) || raw.startsWith("~")) {
    return { repo: null, url: null, label: raw, reason: "absolute-path-rejected" };
  }

  const m = CITATION.exec(raw);
  if (!m) {
    return { repo: null, url: null, label: raw, reason: "unparsable" };
  }
  const [, path, from, to] = m;

  for (const repo of REPOS) {
    const root = roots[repo.key];
    if (!root) continue;
    for (const candidate of candidates(path, repo)) {
      if (isAbsolute(candidate)) continue; // defence in depth
      if (!exists(join(root, candidate))) continue;
      const anchor = from ? `#L${from}${to ? `-L${to}` : ""}` : "";
      const label = candidate + (from ? `:${from}${to ? `-${to}` : ""}` : "");
      return {
        repo: repo.key,
        url: `${repo.url}/blob/${repo.sha}/${candidate}${anchor}`,
        label,
      };
    }
  }
  return { repo: null, url: null, label: raw, reason: "not-found-in-any-frozen-checkout" };
}

function* candidates(path, repo) {
  yield path;
  for (const prefix of repo.strip) {
    if (path.startsWith(prefix)) yield path.slice(prefix.length);
  }
}

/**
 * Repository binding for any fan-out unit of work (verification, re-audit, re-check).
 *
 * Callers MUST pass an explicit repo key. This function exists so that "which repository
 * does this work concern?" is always structured data travelling with the work item, never
 * a string pattern recovered downstream.
 */
export function bindRepo(item) {
  if (!item || typeof item.repo !== "string" || !REPOS.some((r) => r.key === item.repo)) {
    throw new TypeError(
      `Work item must carry an explicit repo key (one of: ${REPOS.map((r) => r.key).join(", ")}). ` +
        `Inferring a repository from an id prefix is prohibited.`,
    );
  }
  return REPOS.find((r) => r.key === item.repo);
}
