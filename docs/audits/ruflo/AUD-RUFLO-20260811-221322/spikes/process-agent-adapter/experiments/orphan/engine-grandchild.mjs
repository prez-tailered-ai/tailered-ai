// Engine module for adapter.mjs: starts a worker through the adapter's
// spawnSandboxed (detached, tracked) and then never resolves, so the
// adapter's own deadline fires and must reap the whole group.
export const ENGINE_ID = "spike-engine-grandchild";
export const PROVIDER_ID = "local.mock";
export function resolveModel(alias) { return `mock-${alias}`; }
export async function generate(_request, ctx) {
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = dirname(fileURLToPath(import.meta.url));
  ctx.spawnSandboxed(process.execPath, [join(here, "grandchild.mjs")], {
    env: { ...process.env, GRANDCHILD_TAG: "adapter-worker" },
    cwd: ctx.workDir,
  });
  await new Promise(() => {});
}
