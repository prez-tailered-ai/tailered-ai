process.stdin.on("data", () => {});
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify({ usage: { input: 1, output: 1, costUsd: 0 } }));
  process.exit(0);
});
