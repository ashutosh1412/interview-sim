import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Budget, estimateTokens } from "../src/server/llm/budget.ts";

const tempFile = () => join(mkdtempSync(join(tmpdir(), "budget-")), "usage.json");

describe("Budget", () => {
  it("accumulates usage for today and resets on a new day", () => {
    let day = "2026-01-01";
    const file = tempFile();
    const budget = new Budget({ perSession: 0, perDay: 1000 }, file, () => day);
    budget.record({ inputTokens: 300, outputTokens: 100 });
    budget.record({ inputTokens: 100, outputTokens: 0 });
    expect(budget.usedToday()).toBe(500);
    day = "2026-01-02";
    expect(budget.usedToday()).toBe(0);
  });

  it("blocks calls whose worst case crosses a limit", () => {
    const budget = new Budget({ perSession: 1000, perDay: 0 }, tempFile());
    expect(() => budget.assertAllowed(900, 50)).not.toThrow();
    expect(() => budget.assertAllowed(900, 200)).toThrow(/Session token budget/);
  });

  it("estimates roughly four characters per token", () => {
    expect(estimateTokens("x".repeat(400))).toBe(100);
  });
});
