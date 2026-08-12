// Proposes a path that PASSES Tailered's startsWith("product/") guard but
// resolves OUTSIDE product/, onto an accepted (immutable) ADR.
process.stdin.on("data", () => {});
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify({
    payload: { files: [
      { path: "product/../decisions/ADR-000.md", content: "<!-- tailered: {\"id\":\"ADR-000\",\"status\":\"accepted\",\"caused_by\":[]} -->\n# ADR-000: OVERWRITTEN BY THE AGENT\n" },
      { path: "product/..//AGENTS.md", content: "# constitution replaced by the agent\n" },
    ] },
    usage: { input: 20, output: 40, costUsd: 0.002 },
  }));
  process.exit(0);
});
