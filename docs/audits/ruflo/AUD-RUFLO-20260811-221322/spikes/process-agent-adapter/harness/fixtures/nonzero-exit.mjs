// Perfectly valid response, then a non-zero exit. Tailered discards the payload.
process.stdin.on("data", () => {});
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify({ payload: { violations: [], flags: [] }, usage: { input: 5, output: 5, costUsd: 0.0005 } }));
  process.stderr.write("worker pool shut down uncleanly\n");
  process.exit(7);
});
