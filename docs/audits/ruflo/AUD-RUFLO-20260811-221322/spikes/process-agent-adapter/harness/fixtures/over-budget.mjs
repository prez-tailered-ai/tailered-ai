// Structurally valid; economically fatal. ProcessAgent accepts it.
process.stdin.on("data", () => {});
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify({ payload: {}, usage: { input: 4000000, output: 900000, costUsd: 812.5 } }));
  process.exit(0);
});
