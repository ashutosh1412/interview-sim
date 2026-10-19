import { describe, expect, it } from "vitest";
import { loadModelsConfig } from "../src/server/config.ts";
import { AppError } from "../src/server/errors.ts";
import { Budget } from "../src/server/llm/budget.ts";
import { createLlmClient, resolveRoute } from "../src/server/llm/client.ts";
import { extractJson, toLlmJsonSchema } from "../src/server/llm/jsonSchema.ts";
import type { LlmProvider, LlmRequest } from "../src/server/llm/types.ts";
import { ReviewResultSchema } from "../src/shared/schemas.ts";
import { unlimitedBudget, urlDesign } from "./helpers.ts";

const models = loadModelsConfig();
const noBudget = unlimitedBudget;
const valid = JSON.stringify({ annotations: [], threadUpdates: [] });

function scripted(replies: string[]): LlmProvider & { requests: LlmRequest[] } {
  const requests: LlmRequest[] = [];
  return {
    name: "scripted",
    requests,
    async complete(req) {
      requests.push(req);
      const text = replies[requests.length - 1] ?? valid;
      return { text, usage: { inputTokens: 10, outputTokens: 5 } };
    },
  };
}

const callArgs = {
  task: "review_round" as const,
  system: "sys",
  prompt: "prompt",
  schema: ReviewResultSchema,
  context: { problemId: "url-shortener", design: urlDesign, threads: [] },
  sessionTokensUsed: 0,
};

function client(provider: LlmProvider, budget = noBudget()) {
  return createLlmClient({ provider, providerName: "api", dryRun: false, models, budget });
}

describe("llm client", () => {
  it("returns validated data and usage on the first try", async () => {
    const p = scripted([valid]);
    const res = await client(p).call(callArgs);
    expect(res.data).toEqual({ annotations: [], threadUpdates: [], conceptUpdates: [] });
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 5, calls: 1 });
    expect(p.requests[0]?.model).toBe("claude-sonnet-5-5");
  });

  it("retries once with a correction note after invalid JSON", async () => {
    const p = scripted(["not json", valid]);
    const res = await client(p).call(callArgs);
    expect(res.usage.calls).toBe(2);
    expect(p.requests[1]?.prompt).toContain("not valid JSON");
  });

  it("retries once after a schema violation, then gives up", async () => {
    const bad = JSON.stringify({ annotations: "nope" });
    const p = scripted([bad, bad]);
    await expect(client(p).call(callArgs)).rejects.toMatchObject({ code: "llm_bad_output" });
    expect(p.requests).toHaveLength(2);
    expect(p.requests[1]?.prompt).toContain("failed validation");
  });

  it("refuses a call that would exceed the session budget, before sending it", async () => {
    const p = scripted([valid]);
    const budget = new Budget({ perSession: 100, perDay: 0 }, "/nonexistent/usage.json");
    await expect(client(p, budget).call(callArgs)).rejects.toBeInstanceOf(AppError);
    expect(p.requests).toHaveLength(0);
  });

  it("routes tasks to tiers per provider", () => {
    expect(resolveRoute(models, "api", "grade_answers").model).toBe("claude-haiku-5-5");
    expect(resolveRoute(models, "api", "final_assessment").model).toBe("claude-opus-5-5");
    expect(resolveRoute(models, "claude-cli", "review_round").model).toBe("sonnet");
  });
});

describe("json helpers", () => {
  it("strips size constraints from the schema sent to the model", () => {
    const text = JSON.stringify(toLlmJsonSchema(ReviewResultSchema));
    expect(text).not.toMatch(/maxLength|maxItems|minLength|\$schema/);
    expect(text).toContain("annotations");
  });

  it("parses fenced JSON", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => extractJson("nope")).toThrow();
  });
});
