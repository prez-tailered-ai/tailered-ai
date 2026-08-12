// Simulates a Ruflo swarm worker / daemon: a process the agent starts that
// keeps running on its own. Heartbeats so survival is provable by timestamp.
import { appendFileSync } from "node:fs";
const probe = process.env.PROBE_FILE;
const tag = process.env.GRANDCHILD_TAG ?? "grandchild";
const deadline = Date.now() + 45000;
function beat(kind) {
  if (!probe) return;
  appendFileSync(probe, JSON.stringify({ tag, kind, pid: process.pid, ppid: process.ppid, at: Date.now() }) + "\n");
}
beat("start");
const timer = setInterval(() => {
  beat("heartbeat");
  if (Date.now() > deadline) { beat("self-exit"); process.exit(0); }
}, 400);
process.on("SIGTERM", () => { beat("sigterm"); clearInterval(timer); process.exit(143); });
