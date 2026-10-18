import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/server/config.ts";

describe("loadConfig", () => {
  it("defaults to the free mock provider", () => {
    expect(loadConfig({}).provider).toBe("mock");
  });

  it("refuses the paid provider without a key", () => {
    expect(() => loadConfig({ LLM_PROVIDER: "api" })).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => loadConfig({ LLM_PROVIDER: "api", ANTHROPIC_API_KEY: "  " })).toThrow();
  });

  it("rejects unknown providers", () => {
    expect(() => loadConfig({ LLM_PROVIDER: "openai" })).toThrow(/Invalid environment/);
  });

  it("parses budgets and flags", () => {
    const c = loadConfig({ LLM_DRY_RUN: "true", BUDGET_TOKENS_PER_SESSION: "0" });
    expect(c.dryRun).toBe(true);
    expect(c.budget.perSession).toBe(0);
  });
});
