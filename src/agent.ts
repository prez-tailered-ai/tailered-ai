import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import type {
  AgentProjection,
  AgentRequest,
  AgentResponse,
  ProcessAgentConfig,
} from "./contracts.js";
import { ValidationError } from "./errors.js";

export interface Agent {
  project(request: AgentRequest): AgentProjection;
  invoke(request: AgentRequest): Promise<AgentResponse>;
}

export class ProcessAgent implements Agent {
  constructor(readonly config: ProcessAgentConfig) {
    validateProcessAgentConfig(config);
  }

  static async fromFile(path: string): Promise<ProcessAgent> {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as ProcessAgentConfig;
    return new ProcessAgent(parsed);
  }

  project(request: AgentRequest): AgentProjection {
    const projection = this.config.projections[request.tier];
    return {
      maxCostUsd: projection.maxCostUsd,
      maxTokens: projection.maxTokens,
    };
  }

  async invoke(request: AgentRequest): Promise<AgentResponse> {
    const output = await runProcess(
      this.config.command,
      this.config.args,
      `${JSON.stringify(request)}\n`,
      this.config.timeoutMs,
    );

    let response: unknown;
    try {
      response = JSON.parse(output);
    } catch (error) {
      throw new ValidationError(
        `Agent returned invalid JSON: ${String(error)}`,
      );
    }
    validateAgentResponse(response);
    return response;
  }
}

async function runProcess(
  command: string,
  args: string[],
  input: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      signal: AbortSignal.timeout(timeoutMs),
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const maxOutputBytes = 5_000_000;

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > maxOutputBytes) {
        child.kill("SIGTERM");
        reject(new ValidationError("Agent stdout exceeded 5 MB."));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes <= maxOutputBytes) {
        stderr.push(chunk);
      }
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code !== 0) {
        reject(
          new ValidationError(
            `Agent process failed (${signal ?? `exit ${String(code)}`}): ${Buffer.concat(stderr).toString("utf8").trim()}`,
          ),
        );
        return;
      }
      resolve(Buffer.concat(stdout).toString("utf8"));
    });
    child.stdin.end(input);
  });
}

function validateProcessAgentConfig(
  config: ProcessAgentConfig,
): asserts config is ProcessAgentConfig {
  if (
    typeof config.command !== "string" ||
    config.command.trim() === "" ||
    !Array.isArray(config.args) ||
    !config.args.every((value) => typeof value === "string")
  ) {
    throw new ValidationError("Agent command and args are invalid.");
  }
  if (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs <= 0) {
    throw new ValidationError("Agent timeoutMs must be a positive integer.");
  }
  for (const tier of ["frontier", "mid", "cheap"] as const) {
    const projection = config.projections[tier];
    if (
      !projection ||
      !Number.isFinite(projection.maxCostUsd) ||
      projection.maxCostUsd < 0 ||
      !Number.isSafeInteger(projection.maxTokens) ||
      projection.maxTokens < 0
    ) {
      throw new ValidationError(`Invalid ${tier} agent projection.`);
    }
  }
}

function validateAgentResponse(
  response: unknown,
): asserts response is AgentResponse {
  if (!isRecord(response) || !isRecord(response.usage)) {
    throw new ValidationError("Agent response must include payload and usage.");
  }
  const { input, output, costUsd } = response.usage;
  if (
    typeof input !== "number" ||
    !Number.isSafeInteger(input) ||
    input < 0 ||
    typeof output !== "number" ||
    !Number.isSafeInteger(output) ||
    output < 0 ||
    typeof costUsd !== "number" ||
    !Number.isFinite(costUsd) ||
    costUsd < 0
  ) {
    throw new ValidationError("Agent usage is invalid.");
  }
  if (!("payload" in response)) {
    throw new ValidationError("Agent response payload is missing.");
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
