// Reads the request and never answers: the MCP-stdio-server shape.
import { appendFileSync } from "node:fs";
const probe = process.env.PROBE_FILE;
process.stdin.on("data", () => {});
setInterval(() => {}, 1000);
process.on("SIGTERM", () => {
  if (probe) appendFileSync(probe, `hang-child-got-SIGTERM pid=${process.pid}\n`);
  process.exit(143);
});
