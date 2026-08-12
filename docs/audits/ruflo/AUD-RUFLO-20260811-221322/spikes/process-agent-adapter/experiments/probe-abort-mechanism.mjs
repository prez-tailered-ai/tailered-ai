// Isolate the mechanism behind ORPHAN-2: after the direct child exits, does
// AbortSignal.timeout still fire on the ChildProcess?
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const results = {};

// Case 1: child exits at t=200ms, a grandchild holds fd 1 until t=3000ms.
// timeoutMs = 800. If the abort still worked, we would see an AbortError at ~800ms.
const script = `
const { spawn } = require("node:child_process");
const g = spawn(process.execPath, ["-e", "setTimeout(()=>process.exit(0),3000)"],
  { detached: true, stdio: ["ignore", 1, "ignore"] });
g.unref();
process.stdout.write(JSON.stringify({payload:{},usage:{input:1,output:1,costUsd:0}}));
setTimeout(() => process.exit(0), 200);
`;

const started = Date.now();
await new Promise((done) => {
  const child = spawn(process.execPath, ["-e", script], {
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    signal: AbortSignal.timeout(800),
  });
  const events = [];
  child.on("error", (e) => {
    events.push({ event: "error", name: e.name, at: Date.now() - started });
  });
  child.on("exit", (code) => events.push({ event: "exit", code, at: Date.now() - started }));
  child.on("close", (code) => {
    events.push({ event: "close", code, at: Date.now() - started });
    results.case1 = { timeout_ms: 800, events };
    done();
  });
  child.stdin.end("{}\n");
});

// Case 2: control — same child, no grandchild. The abort must fire normally
// when the child hangs.
const started2 = Date.now();
await new Promise((done) => {
  const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    signal: AbortSignal.timeout(800),
  });
  const events = [];
  child.on("error", (e) => events.push({ event: "error", name: e.name, at: Date.now() - started2 }));
  child.on("exit", (code, sig) => events.push({ event: "exit", code, sig, at: Date.now() - started2 }));
  child.on("close", () => {
    events.push({ event: "close", at: Date.now() - started2 });
    results.case2_control = { timeout_ms: 800, events };
    done();
  });
  child.stdin.end("{}\n");
});

results.node_version = process.version;
writeFileSync(process.env.OUT_FILE ?? "/out/abort-mechanism.json", JSON.stringify(results, null, 2) + "\n");
console.log(JSON.stringify(results, null, 2));
