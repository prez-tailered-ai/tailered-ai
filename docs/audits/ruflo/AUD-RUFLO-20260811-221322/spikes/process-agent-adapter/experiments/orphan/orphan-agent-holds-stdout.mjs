// The agent answers correctly and exits 0, but leaves behind a worker that
// inherited fd 1. The write end of the stdout pipe therefore stays open.
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const child = spawn(process.execPath, [join(here, "grandchild.mjs")], {
  detached: true,
  stdio: ["ignore", 1, "ignore"],
  env: { ...process.env, GRANDCHILD_TAG: "stdout-holder" },
});
child.unref();
process.stdin.on("data", () => {});
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify({
    payload: { violations: [], flags: [] },
    usage: { input: 11, output: 7, costUsd: 0.0009 },
  }));
  process.exit(0);
});
