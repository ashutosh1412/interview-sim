// The one entry point the interview code uses to talk to a model:
// route task -> model, enforce budget and timeout, validate output, retry once on bad output.
import type { z } from "zod";
import type { AppConfig, ModelsConfig, ProviderName, Task } from "../config.ts";
import { AppError } from "../errors.ts";
import { createAnthropicProvider } from "./anthropicProvider.ts";
import { Budget, estimateTokens } from "./budget.ts";
import { createClaudeCliProvider } from "./claudeCliProvider.ts";
import { extractJson, toLlmJsonSchema } from "./jsonSchema.ts";
import { createMockProvider } from "./mockProvider.ts";
import type { LlmProvider, LlmRequest, LlmUsage } from "./types.ts";

const TIMEOUT_MS: Record<ProviderName, number> = { mock: 5_000, "claude-cli": 180_000, api: 120_000 };
const MAX_ATTEMPTS = 2;

export interface CallArgs<T> {
  task: Task;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  context: LlmRequest["context"];
  sessionTokensUsed: number;
}

export interface CallResult<T> {
  data: T;
  usage: LlmUsage & { calls: number };
}

export interface LlmClient {
  readonly providerName: ProviderName;
  readonly dryRun: boolean;
  readonly budget: Budget;
  call<T>(args: CallArgs<T>): Promise<CallResult<T>>;
}

export function resolveRoute(models: ModelsConfig, provider: ProviderName, task: Task) {
  const taskConfig = models.tasks[task];
  // mock has no models of its own; show what the API would use so dry runs are informative
  const modelKey = provider === "claude-cli" ? "claude-cli" : "api";
  return { ...taskConfig, model: models.tiers[taskConfig.tier][modelKey] };
}

function createDryRunProvider(inner: LlmProvider): LlmProvider {
  return {
    name: `dry-run(${inner.name})`,
    async complete(req) {
      const est = estimateTokens(req.system + req.prompt);
      console.info(
        `[dry-run] task=${req.task} model=${req.model} effort=${req.effort} ` +
          `estInputTokens=${est} maxOutputTokens=${req.maxTokens}\n--- prompt ---\n${req.prompt}\n--------------`,
      );
      return inner.complete(req);
    },
  };
}

export function createProvider(config: AppConfig): LlmProvider {
  const mock = createMockProvider(config.mockFailure);
  if (config.dryRun) return createDryRunProvider(mock);
  switch (config.provider) {
    case "mock":
      return mock;
    case "claude-cli":
      return createClaudeCliProvider();
    case "api":
      if (!config.apiKey) throw new Error("API provider requires a key");
      return createAnthropicProvider(config.apiKey);
  }
}

export function createLlmClient(deps: {
  provider: LlmProvider;
  providerName: ProviderName;
  dryRun: boolean;
  models: ModelsConfig;
  budget: Budget;
}): LlmClient {
  const { provider, providerName, models, budget } = deps;

  async function call<T>(args: CallArgs<T>): Promise<CallResult<T>> {
    const route = resolveRoute(models, providerName, args.task);
    const jsonSchema = toLlmJsonSchema(args.schema);
    const total = { inputTokens: 0, outputTokens: 0, calls: 0 };
    let prompt = args.prompt;
    let lastError: AppError | undefined;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const worstCase = estimateTokens(args.system + prompt) + route.maxTokens;
      budget.assertAllowed(args.sessionTokensUsed + total.inputTokens + total.outputTokens, worstCase);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS[providerName]);
      let text: string;
      try {
        const res = await provider.complete({
          task: args.task,
          model: route.model,
          effort: route.effort,
          maxTokens: route.maxTokens,
          system: args.system,
          prompt,
          jsonSchema,
          context: args.context,
          signal: controller.signal,
        });
        text = res.text;
        total.inputTokens += res.usage.inputTokens;
        total.outputTokens += res.usage.outputTokens;
        total.calls += 1;
        budget.record(res.usage);
      } finally {
        clearTimeout(timer);
      }

      let json: unknown;
      try {
        json = extractJson(text);
      } catch {
        lastError = new AppError("llm_bad_output", "Model output was not valid JSON");
        prompt = `${args.prompt}\n\nYour previous reply was not valid JSON. Reply with only the JSON object.`;
        continue;
      }
      const parsed = args.schema.safeParse(json);
      if (parsed.success) return { data: parsed.data, usage: total };

      const issues = parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      lastError = new AppError("llm_bad_output", `Model output failed validation: ${issues}`);
      prompt = `${args.prompt}\n\nYour previous reply failed validation (${issues}). Reply with only a corrected JSON object.`;
    }

    throw lastError ?? new AppError("llm_bad_output", "Model output was invalid");
  }

  return { providerName, dryRun: deps.dryRun, budget, call };
}
