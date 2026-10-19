import { describe, expect, it } from "vitest";
import { CONCEPT_IDS, CONCEPTS } from "../src/shared/concepts.ts";
import type { Assessment } from "../src/shared/schemas.ts";
import { PROBLEMS } from "../src/server/interview/problems.ts";
import { decideOutcome } from "../src/server/interview/passBar.ts";

const strong: Assessment = {
  scores: (["requirements", "high_level_design", "scalability", "reliability", "trade_offs", "communication"] as const).map(
    (dimension) => ({ dimension, score: 4, comment: "" }),
  ),
  verdict: "hire",
  summary: "",
  missed: [],
};
const required = ["ddia-replication", "ddia-partitioning"] as const;
const solidAll = required.map((concept) => ({ concept, level: "solid" as const, evidence: "explained it" }));
const base = { required: [...required], knowledge: solidAll, assessment: strong, strikes: 0, reviewedRounds: 2 };

describe("pass bar", () => {
  it("passes only when everything clears the bar", () => {
    expect(decideOutcome(base)).toEqual({ passed: true, reasons: [] });
  });

  it("fails a 'hire' verdict when a required area is only surface-level", () => {
    const knowledge = [{ ...solidAll[0]!, level: "surface" as const }, solidAll[1]!];
    const out = decideOutcome({ ...base, knowledge });
    expect(out.passed).toBe(false);
    expect(out.reasons[0]).toMatch(/Replication and replication lag: surface level only.*Study: DDIA · Replication/);
  });

  it("fails areas the interview never reached", () => {
    const out = decideOutcome({ ...base, knowledge: [solidAll[0]!] });
    expect(out.reasons.some((r) => r.includes("never got to it"))).toBe(true);
  });

  it("fails low scores, weak verdicts, strikes and unreviewed designs", () => {
    const weak = { ...strong, verdict: "lean_hire" as const, scores: [{ ...strong.scores[0]!, score: 2 }] };
    const out = decideOutcome({ ...base, assessment: weak, strikes: 3, reviewedRounds: 0 });
    expect(out.passed).toBe(false);
    expect(out.reasons.join(" ")).toMatch(/never reached a reviewable state/);
    expect(out.reasons.join(" ")).toMatch(/3 times/);
    expect(out.reasons.join(" ")).toMatch(/requirements: 2\/5/);
    expect(out.reasons.join(" ")).toMatch(/lean hire/);
  });

  it("accepts deep as passing", () => {
    expect(decideOutcome({ ...base, knowledge: solidAll.map((k) => ({ ...k, level: "deep" as const })) }).passed).toBe(true);
  });
});

describe("knowledge map", () => {
  it("defines every concept fully and uses each in at least one problem", () => {
    const used = new Set(PROBLEMS.flatMap((p) => p.rubric.concepts));
    for (const id of CONCEPT_IDS) {
      const c = CONCEPTS[id];
      expect(c.title && c.ref && c.bar && c.probe).toBeTruthy();
      expect(c.keywords.length).toBeGreaterThan(2);
      expect(used.has(id)).toBe(true);
    }
  });

  it("gives every problem 3-5 areas from the right family", () => {
    for (const p of PROBLEMS) {
      expect(p.rubric.concepts.length).toBeGreaterThanOrEqual(3);
      expect(p.rubric.concepts.length).toBeLessThanOrEqual(5);
      expect(p.rubric.concepts.every((c) => c.startsWith("ood-"))).toBe(p.kind === "lld");
    }
  });
});
