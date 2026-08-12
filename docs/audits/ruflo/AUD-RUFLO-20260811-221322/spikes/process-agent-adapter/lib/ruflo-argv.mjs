// AUD-RUFLO-20260811-221322 / lane AUD-L7a — spike code, not Tailered runtime.
//
// The MCP-mode trap and the argv that avoids it.
//
// ruflo@3.37.0 bin/ruflo.js:53-55
//   const cliArgs = process.argv.slice(2);
//   const isExplicitMCP = cliArgs.length >= 1 && cliArgs[0] === 'mcp'
//                         && (cliArgs.length === 1 || cliArgs[1] === 'start');
//   const isMCPMode = !process.stdin.isTTY
//                     && (process.argv.length === 2 || isExplicitMCP);
//
// Tailered's ProcessAgent always spawns with stdio ["pipe","pipe","pipe"],
// so process.stdin.isTTY is undefined => !isTTY is ALWAYS true for a Tailered
// agent. The only remaining term is argv. Therefore, for a Tailered-spawned
// ruflo, MCP-server mode is entered whenever:
//     args.length === 0                     (process.argv.length === 2)
//  OR args[0] === "mcp" && (len === 1 || args[1] === "start")
//
// An MCP stdio server is a long-lived JSON-RPC peer. It never terminates on a
// single request, so ProcessAgent's promise cannot settle until
// AbortSignal.timeout(timeoutMs) fires. The run then halts on a fabricated
// "agent failed" path having burned the full timeout and the full projection.

/** Exact predicate for "this argv makes ruflo an MCP stdio server under a pipe". */
export function isMcpModeUnderPipedStdin(args) {
  if (!Array.isArray(args)) throw new TypeError("args must be an array");
  if (args.length === 0) return true;
  return args[0] === "mcp" && (args.length === 1 || args[1] === "start");
}

/**
 * Build the argv for a bounded, one-shot ruflo invocation.
 * Guarantees a non-empty argv whose head is not "mcp", so bin/ruflo.js takes
 * the CLI branch (which calls process.exit(0) after the command handler).
 */
export function safeRufloArgv(subcommand, rest = []) {
  if (typeof subcommand !== "string" || subcommand.trim() === "") {
    throw new Error("A ruflo invocation must name an explicit subcommand.");
  }
  if (subcommand === "mcp") {
    throw new Error(
      "Refusing to build a 'mcp' argv: that is the stdio-server trap.",
    );
  }
  const argv = [subcommand, ...rest];
  if (isMcpModeUnderPipedStdin(argv)) {
    // Unreachable given the guards above; kept as a fail-closed assertion so a
    // future edit cannot silently reintroduce the trap.
    throw new Error("Constructed argv would enter MCP mode. Refusing.");
  }
  return argv;
}

/**
 * The env an untrusted orchestrator subprocess is allowed to see.
 * Deny-by-default: nothing is inherited except what is listed here.
 * No API keys, no HOME of the operator, no CI tokens, no PATH surprises.
 */
export function sealedEnv({ home, path = "/usr/local/bin:/usr/bin:/bin" }) {
  return {
    PATH: path,
    HOME: home,
    // Documented ruflo/claude-flow behaviour: it will still try to write
    // .swarm/, .claude-flow/ and ruvector.db under CWD, so CWD must be the
    // ephemeral sandbox, never the company repository.
    NO_COLOR: "1",
    CI: "1",
    npm_config_yes: "true",
  };
}
