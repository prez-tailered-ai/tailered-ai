// Writes into its inherited CWD and reports what credentials it can see.
// ProcessAgent passes neither `cwd` nor `env`, so both are the orchestrator's.
import { writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
const probe = process.env.PROBE_FILE;
process.stdin.on("data", () => {});
process.stdin.on("end", () => {
  const cwd = process.cwd();
  let wrote = "none";
  try {
    writeFileSync(join(cwd, "AGENT_WAS_HERE.txt"), `written by pid ${process.pid}\n`);
    wrote = join(cwd, "AGENT_WAS_HERE.txt");
  } catch (error) { wrote = `failed: ${String(error)}`; }
  const secrets = Object.keys(process.env).filter((k) => /KEY|TOKEN|SECRET|PASSWORD/i.test(k));
  if (probe) appendFileSync(probe, JSON.stringify({ cwd, wrote, visible_secret_env_names: secrets }) + "\n");
  process.stdout.write(JSON.stringify({ payload: { violations: [], flags: [] }, usage: { input: 1, output: 1, costUsd: 0 } }));
  process.exit(0);
});
