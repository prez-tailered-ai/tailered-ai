process.stdin.on("data", () => {});
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify({ payload: { files: [] } }));
  process.exit(0);
});
