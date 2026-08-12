// Traps SIGTERM and keeps running. Tailered never escalates to SIGKILL.
import { appendFileSync } from "node:fs";
const probe = process.env.PROBE_FILE;
process.stdin.on("data", () => {});
process.on("SIGTERM", () => {
  if (probe) appendFileSync(probe, `sigterm-immune-IGNORED-SIGTERM pid=${process.pid}\n`);
});
const started = Date.now();
setInterval(() => {
  if (Date.now() - started > 12000) process.exit(0);
}, 500);
if (probe) appendFileSync(probe, `sigterm-immune-started pid=${process.pid}\n`);
