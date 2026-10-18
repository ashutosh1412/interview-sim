// Runs the local `claude` CLI in headless mode, so calls are billed to the user's
// Claude subscription instead of API credits. Used for realistic testing before
// the paid API is switched on.
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { z } from "zod";
import { AppError } from "../errors.ts";
import type { LlmProvider, LlmRequest, LlmResponse } from "./types.ts";

const CliResultSchema = z.object({
  is_error: z.boolean().default(false),
  result: z.string().default(""),
  structured_output: z.unknown().optional(),
  usage: z
    .object({
      input_tokens: z.number().default(0),
      output_tokens: z.number().default(0),
      cache_read_input_tokens: z.number().default(0),
      cache_creation_input_tokens: z.number().default(0),
    })
    .partial()
    .default({}),
});

// The CLI reports limits only as text, so this is the one place we match on wording.
const RATE_LIMIT_PATTERN = /rate limit|usage limit|too many requests|overloaded/i;
const STDERR_SNIPPET = 300;

export function buildCliArgs(req: LlmRequest): string[] {
  return [
    "-p",
    "--output-format", "json",
    "--model", req.model,
    "--effort", req.effort,
    "--system-prompt", req.system,
    "--json-schema", JSON.stringify(req.jsonSchema),
    // No tools, no project files, no saved session: a pure text-in, JSON-out call.
    "--tools", "",
    "--safe-mode",
    "--no-session-persistence",
  ];
}

export function parseCliOutput(stdout: string): LlmResponse {
  let raw: unknown;
  try {
    raw = JSON.parse(stdout);
  } catch (cause) {
    throw new AppError("llm_bad_output", "claude CLI did not return JSON", { cause });
  }
  const out = CliResultSchema.parse(raw);
  if (out.is_error) {
    const code = RATE_LIMIT_PATTERN.test(out.result) ? "llm_rate_limited" : "llm_unavailable";
    throw new AppError(code, `claude CLI error: ${out.result.slice(0, STDERR_SNIPPET)}`);
  }
  const usage = out.usage;
  return {
    text: out.structured_output === undefined ? out.result : JSON.stringify(out.structured_output),
    usage: {
      inputTokens:
        (usage.input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0) +
        (usage.cache_creation_input_tokens ?? 0),
      outputTokens: usage.output_tokens ?? 0,
    },
  };
}

export function createClaudeCliProvider(binary = "claude"): LlmProvider {
  return {
    name: "claude-cli",
    complete(req: LlmRequest): Promise<LlmResponse> {
      return new Promise((resolve, reject) => {
        // Run outside the project so the CLI picks up no repository context.
        const child = spawn(binary, buildCliArgs(req), { cwd: tmpdir(), stdio: ["pipe", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        const onAbort = () => {
          child.kill("SIGTERM");
          reject(new AppError("llm_timeout", "claude CLI timed out"));
        };
        req.signal.addEventListener("abort", onAbort, { once: true });

        child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
        child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
        child.on("error", (cause) => {
          req.signal.removeEventListener("abort", onAbort);
          reject(new AppError("llm_unavailable", "Could not start the claude CLI. Is it installed and logged in?", { cause }));
        });
        child.on("close", (code) => {
          req.signal.removeEventListener("abort", onAbort);
          if (req.signal.aborted) return;
          if (code !== 0 && !stdout.trim()) {
            const message = stderr.trim().slice(0, STDERR_SNIPPET) || `exit code ${code}`;
            const errorCode = RATE_LIMIT_PATTERN.test(message) ? "llm_rate_limited" : "llm_unavailable";
            reject(new AppError(errorCode, `claude CLI failed: ${message}`));
            return;
          }
          try {
            resolve(parseCliOutput(stdout));
          } catch (error) {
            reject(error);
          }
        });

        child.stdin.end(req.prompt);
      });
    },
  };
}
