// Minimal well-formed agent: proves the harness itself is not the failure.
process.stdin.resume();
process.stdin.on("data", () => {});
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify({
    payload: { violations: [], flags: [] },
    usage: { input: 10, output: 10, costUsd: 0.001 },
  }));
  process.exit(0);
});
