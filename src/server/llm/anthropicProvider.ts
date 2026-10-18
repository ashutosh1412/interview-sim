// Paid provider. Only constructed when LLM_PROVIDER=api and a key is present (see config.ts).
import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "../errors.ts";
import type { LlmProvider, LlmRequest, LlmResponse } from "./types.ts";

// Server-side refusal fallback is supported on these models; Haiku has none.
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);

function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Anthropic.RateLimitError) return new AppError("llm_rate_limited", "Anthropic API rate limit", { cause: error });
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new AppError("llm_timeout", "Anthropic API timed out", { cause: error });
  if (error instanceof Anthropic.APIUserAbortError) return new AppError("llm_timeout", "Anthropic API call aborted", { cause: error });
  if (error instanceof Anthropic.AuthenticationError) return new AppError("llm_unavailable", "Anthropic API key was rejected", { cause: error });
  if (error instanceof Anthropic.InternalServerError) return new AppError("llm_unavailable", "Anthropic API is unavailable", { cause: error });
  if (error instanceof Anthropic.APIConnectionError) return new AppError("llm_unavailable", "Could not reach the Anthropic API", { cause: error });
  if (error instanceof Anthropic.APIError) return new AppError("llm_unavailable", `Anthropic API error ${error.status}`, { cause: error });
  return new AppError("llm_unavailable", "Unexpected error calling the Anthropic API", { cause: error });
}

export function createAnthropicProvider(apiKey: string): LlmProvider {
  // The SDK retries 429/5xx itself; our own retry in structured.ts only covers bad output.
  const client = new Anthropic({ apiKey, maxRetries: 2 });

  return {
    name: "api",
    async complete(req: LlmRequest): Promise<LlmResponse> {
      const withFallback = FALLBACK_MODELS.has(req.model);
      try {
        const response = await client.beta.messages.create(
          {
            model: req.model,
            max_tokens: req.maxTokens,
            // The system prompt is identical for every call in a session, so it is cached.
            system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
            messages: [{ role: "user", content: req.prompt }],
            output_config: {
              effort: req.effort,
              format: { type: "json_schema", schema: req.jsonSchema },
            },
            ...(withFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
          },
          { signal: req.signal },
        );

        if (response.stop_reason === "refusal") {
          throw new AppError("llm_refused", "The model declined to answer this request");
        }
        if (response.stop_reason === "max_tokens") {
          throw new AppError("llm_bad_output", "Response was cut off at max_tokens");
        }
        const text = response.content
          .flatMap((block) => (block.type === "text" ? [block.text] : []))
          .join("");
        const u = response.usage;
        return {
          text,
          usage: {
            inputTokens:
              u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
            outputTokens: u.output_tokens,
          },
        };
      } catch (error) {
        throw toAppError(error);
      }
    },
  };
}
