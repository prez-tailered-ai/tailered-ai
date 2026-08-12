// Emits prose before its JSON — the classic "helpful CLI banner" failure.
process.stdin.on("data", () => {});
process.stdin.on("end", () => {
  process.stdout.write("Initializing swarm...\n");
  process.stdout.write(JSON.stringify({ payload: {}, usage: { input: 1, output: 1, costUsd: 0 } }));
  process.exit(0);
});
