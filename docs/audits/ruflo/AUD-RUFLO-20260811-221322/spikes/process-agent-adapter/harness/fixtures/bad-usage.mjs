// Fractional tokens and a negative cost: the shapes a real API response can take.
process.stdin.on("data", () => {});
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify({ payload: {}, usage: { input: 12.5, output: 3, costUsd: -0.01 } }));
  process.exit(0);
});
