// The naive integration: the agent starts a background worker and hangs.
// This is exactly the shape of "ruflo swarm start" style orchestration.
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const child = spawn(process.execPath, [join(here, "grandchild.mjs")], {
  detached: true,
  stdio: ["ignore", "ignore", "ignore"],
  env: { ...process.env, GRANDCHILD_TAG: "naive-worker" },
});
child.unref();
process.stderr.write(`[naive-agent] pid=${process.pid} grandchild=${child.pid}\n`);
process.stdin.on("data", () => {});
setInterval(() => {}, 1000);
