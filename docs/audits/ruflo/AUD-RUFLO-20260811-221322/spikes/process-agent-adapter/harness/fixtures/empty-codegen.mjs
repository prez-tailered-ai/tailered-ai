// A crashed tool reported as a successful, empty code generation.
process.stdin.on("data", () => {});
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify({ payload: { files: [] }, usage: { input: 900, output: 4, costUsd: 0.02 } }));
  process.exit(0);
});
