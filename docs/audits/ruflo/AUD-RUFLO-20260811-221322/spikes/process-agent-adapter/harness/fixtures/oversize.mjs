// >5 MB of stdout. Also records, from inside the child, whether it survives.
import { appendFileSync } from "node:fs";
const probe = process.env.PROBE_FILE;
const chunk = "x".repeat(1 << 20);
process.stdin.on("data", () => {});
process.stdin.on("end", () => {
  process.stdout.write('{"payload":{"blob":"');
  for (let i = 0; i < 8; i += 1) process.stdout.write(chunk);
  process.stdout.write('"},"usage":{"input":1,"output":1,"costUsd":0}}');
});
// If we are still alive 2.5 s after the write, the SIGTERM did not land.
setTimeout(() => {
  if (probe) appendFileSync(probe, `oversize-child-survived pid=${process.pid}\n`);
  process.exit(0);
}, 2500);
