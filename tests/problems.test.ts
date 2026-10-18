import { describe, expect, it } from "vitest";
import { COMPONENT_TYPES, isClassShape } from "../src/shared/components.ts";
import { PublicProblemSchema, TRACKS } from "../src/shared/schemas.ts";
import { PROBLEMS, toPublicProblem } from "../src/server/interview/problems.ts";
import { systemPrompt } from "../src/server/interview/prompts.ts";

describe("problem bank", () => {
  it("has 30 problems with unique ids, covering every track", () => {
    expect(PROBLEMS).toHaveLength(30);
    expect(new Set(PROBLEMS.map((p) => p.id)).size).toBe(30);
    for (const track of TRACKS) expect(PROBLEMS.some((p) => p.track === track)).toBe(true);
  });

  it("keeps the original ids so saved sessions still open", () => {
    for (const id of ["url-shortener", "rate-limiter", "chat-app", "news-feed"]) {
      expect(PROBLEMS.some((p) => p.id === id)).toBe(true);
    }
  });

  it.each(PROBLEMS.map((p) => [p.id, p] as const))("%s is complete and consistent", (_, p) => {
    expect(PublicProblemSchema.parse(toPublicProblem(p))).toBeTruthy();
    expect(p.statement.length).toBeGreaterThan(40);
    expect(p.rubric.keyTopics.length).toBeGreaterThanOrEqual(3);
    expect(p.rubric.pitfalls.length).toBeGreaterThanOrEqual(2);
    expect(p.mockQuestions).toHaveLength(2);
    for (const t of p.rubric.mustHave) expect(COMPONENT_TYPES).toContain(t);
    // LLD problems expect class shapes; system design problems expect infrastructure.
    expect(p.rubric.mustHave.every(isClassShape)).toBe(p.kind === "lld");
    expect(p.kind === "lld").toBe(p.track === "Low-level design");
  });

  it("uses the object-oriented interviewer for LLD problems", () => {
    const lld = PROBLEMS.find((p) => p.kind === "lld");
    const hld = PROBLEMS.find((p) => p.kind === "hld");
    expect(systemPrompt(lld!)).toMatch(/low-level \(object-oriented\) design interview/);
    expect(systemPrompt(hld!)).toMatch(/system design interview/);
    expect(systemPrompt(hld!)).not.toMatch(/object-oriented/);
  });
});
