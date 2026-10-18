import type { Effort, Task } from "../config.ts";
import type { Design, Thread } from "../../shared/schemas.ts";

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmRequest {
  task: Task;
  model: string;
  effort: Effort;
  maxTokens: number;
  /** Stable across a session so real providers can cache it. */
  system: string;
  /** Volatile per-call content. */
  prompt: string;
  /** JSON Schema the response must satisfy. */
  jsonSchema: Record<string, unknown>;
  /**
   * The structured data the prompt was rendered from. Real providers ignore it;
   * the mock provider uses it to answer about the user's actual nodes and threads.
   */
  context: { problemId: string; design: Design; threads: Thread[]; question?: string };
  signal: AbortSignal;
}

export interface LlmResponse {
  /** Raw model text, expected to be JSON. Parsing and validation happen in one place: client.ts. */
  text: string;
  usage: LlmUsage;
}

export interface LlmProvider {
  readonly name: string;
  complete(request: LlmRequest): Promise<LlmResponse>;
}
