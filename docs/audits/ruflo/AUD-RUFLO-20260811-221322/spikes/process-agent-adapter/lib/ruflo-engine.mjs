// AUD-RUFLO-20260811-221322 / lane AUD-L7a — spike code, not Tailered runtime.
//
// The Ruflo engine: runs a REAL ruflo invocation under the adapter's
// containment, then returns a Tailered-shaped payload.
//
// Containment applied here, each one load-bearing:
//   cwd    = ctx.workDir   (an ephemeral mkdtemp, NEVER the company repo)
//   env    = sealedEnv()   (no inherited API keys, HOME redirected)
//   argv   = safeRufloArgv (cannot be empty, cannot start with "mcp")
//   spawn  = ctx.spawnSandboxed (detached => own process group => reapable)
//   stdio  = pipes         (a ruflo child can never write to Tailered's fd 1)
//
// INFERRED: everything about what ruflo would PRODUCE with real credentials.
// VERIFIED: everything about where it writes, what it inherits, and whether
//           its process tree survives cancellation.

import { safeRufloArgv, sealedEnv } from "./ruflo-argv.mjs";

export const ENGINE_ID = "ruflo-3.37.0-sandboxed";
export const PROVIDER_ID = "ruflo.cli.local";

export function resolveModel(alias) {
  // Ruflo does not report a model identity on stdout for a non-LLM command,
  // so the honest answer is that identity is UNKNOWN, not the requested alias.
  return `UNKNOWN(requested=${alias})`;
}

export async function generate(request, ctx) {
  const binary = process.env.RUFLO_BIN;
  if (binary === undefined) throw new Error("RUFLO_BIN is not set.");
  const subcommand = process.env.RUFLO_SUBCOMMAND ?? "init";
  const rest = (process.env.RUFLO_ARGS ?? "").split(" ").filter(Boolean);
  const argv = safeRufloArgv(subcommand, rest);

  const child = ctx.spawnSandboxed(process.execPath, [binary, ...argv], {
    cwd: ctx.workDir,
    env: sealedEnv({ home: ctx.workDir }),
  });

  const observed = await new Promise((done) => {
    const out = [];
    const err = [];
    let bytes = 0;
    child.stdout.on("data", (c) => { bytes += c.byteLength; if (bytes < 200_000) out.push(c); });
    child.stderr.on("data", (c) => err.push(c));
    child.on("error", (error) => done({ how: "spawn-error", detail: String(error) }));
    child.on("close", (code, signal) => done({
      how: "closed",
      exit_code: code,
      signal,
      stdout_bytes: bytes,
      stdout_head: Buffer.concat(out).toString("utf8").slice(0, 400),
      stderr_head: Buffer.concat(err).toString("utf8").slice(0, 400),
    }));
    child.stdin.end("");
  });

  // Fail closed for work-producing task kinds. A crashed tool has produced no
  // files and no tests; reporting a "successful" empty payload would be the
  // exact anti-pattern this audit is looking for.
  const toolFailed = observed.how !== "closed" || observed.exit_code !== 0;
  if (toolFailed && (request.taskKind === "codegen" || request.taskKind === "testgen")) {
    throw new Error(
      `ruflo ${argv.join(" ")} did not succeed (${observed.how}` +
        ` exit=${String(observed.exit_code)} signal=${String(observed.signal)}); ` +
        `refusing to synthesise a ${request.taskKind} payload.`,
    );
  }

  // A Tailered-shaped payload. The critique task is the honest fit: we have an
  // observation about the run, not generated code.
  return {
    violations: [],
    flags: [
      `ruflo ${argv.join(" ")} ${observed.how}` +
        (observed.exit_code === undefined ? "" : ` exit=${String(observed.exit_code)} signal=${String(observed.signal)}`),
    ],
    __ruflo_observation: observed,
    __containment: { cwd: ctx.workDir, argv, env_sealed: true },
    __request_echo: { runId: request.runId, taskKind: request.taskKind },
  };
}
