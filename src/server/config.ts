import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const PROVIDERS = ["mock", "claude-cli", "api"] as const;
export type ProviderName = (typeof PROVIDERS)[number];

export const TIERS = ["quick", "default", "complex"] as const;
export type Tier = (typeof TIERS)[number];

export const TASKS = ["clarify", "review_round", "grade_answers", "final_assessment"] as const;
export type Task = (typeof TASKS)[number];

const EffortSchema = z.enum(["low", "medium", "high"]);
export type Effort = z.infer<typeof EffortSchema>;

const ModelsConfigSchema = z.object({
  tiers: z.record(
    z.enum(TIERS),
    z.object({ api: z.string().min(1), "claude-cli": z.string().min(1) }),
  ),
  tasks: z.record(
    z.enum(TASKS),
    z.object({
      tier: z.enum(TIERS),
      effort: EffortSchema,
      maxTokens: z.number().int().min(256).max(16000),
    }),
  ),
});
export type ModelsConfig = z.infer<typeof ModelsConfigSchema>;

const flag = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const nonNegativeInt = (fallback: number) =>
  z.coerce.number().int().min(0).default(fallback);

const EnvSchema = z.object({
  LLM_PROVIDER: z.enum(PROVIDERS).default("mock"),
  ANTHROPIC_API_KEY: z.string().optional(),
  LLM_DRY_RUN: flag,
  BUDGET_TOKENS_PER_SESSION: nonNegativeInt(60_000),
  BUDGET_TOKENS_PER_DAY: nonNegativeInt(300_000),
  MOCK_FAILURE: z.enum(["none", "bad_json", "timeout", "rate_limit", "refusal"]).default("none"),
  PORT: z.coerce.number().int().default(8787),
});

export interface AppConfig {
  provider: ProviderName;
  apiKey: string | undefined;
  dryRun: boolean;
  budget: { perSession: number; perDay: number };
  mockFailure: z.infer<typeof EnvSchema>["MOCK_FAILURE"];
  port: number;
  models: ModelsConfig;
  dataDir: string;
}

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

export function loadModelsConfig(path = `${ROOT}models.config.json`): ModelsConfig {
  return ModelsConfigSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(parsed.error)}`);
  }
  const e = parsed.data;
  // Paid calls must be an explicit, complete choice - never a silent fallback.
  if (e.LLM_PROVIDER === "api" && !e.ANTHROPIC_API_KEY?.trim()) {
    throw new Error("LLM_PROVIDER=api requires ANTHROPIC_API_KEY. Use mock or claude-cli until then.");
  }
  return {
    provider: e.LLM_PROVIDER,
    apiKey: e.ANTHROPIC_API_KEY?.trim() || undefined,
    dryRun: e.LLM_DRY_RUN,
    budget: { perSession: e.BUDGET_TOKENS_PER_SESSION, perDay: e.BUDGET_TOKENS_PER_DAY },
    mockFailure: e.MOCK_FAILURE,
    port: e.PORT,
    models: loadModelsConfig(),
    dataDir: `${ROOT}data`,
  };
}
