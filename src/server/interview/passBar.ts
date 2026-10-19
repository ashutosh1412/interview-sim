// The pass/fail decision. It is made here, by code, so the model's verdict can never
// pass someone on its own: every required knowledge area must reach "solid".
import { CONCEPTS, levelRank, PASSING_LEVEL, type ConceptId, type ConceptLevel } from "../../shared/concepts.ts";
import type { Assessment, Session } from "../../shared/schemas.ts";

const PASSING_VERDICTS: ReadonlySet<Assessment["verdict"]> = new Set(["hire", "strong_hire"]);
/** "Meets the bar" on the 1-5 scale. */
const MIN_DIMENSION_SCORE = 3;
const MAX_STRIKES = 2;

const LEVEL_TEXT: Record<ConceptLevel, string> = {
  untested: "never got to it",
  none: "not shown",
  surface: "surface level only",
  solid: "solid",
  deep: "deep",
};

export interface PassInput {
  required: ConceptId[];
  knowledge: Session["knowledge"];
  assessment: Assessment;
  strikes: number;
  /** Rounds where the design was actually reviewed by the interviewer. */
  reviewedRounds: number;
}

export function decideOutcome(input: PassInput): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const byConcept = new Map(input.knowledge.map((k) => [k.concept, k.level]));

  for (const id of input.required) {
    const level = byConcept.get(id) ?? "untested";
    if (levelRank(level) < levelRank(PASSING_LEVEL)) {
      const c = CONCEPTS[id];
      reasons.push(`${c.title}: ${LEVEL_TEXT[level]} (needs solid). Study: ${c.ref}.`);
    }
  }
  if (input.reviewedRounds === 0) reasons.push("The design never reached a reviewable state.");
  if (input.strikes > MAX_STRIKES) reasons.push(`Submitted a design that couldn't serve a request ${input.strikes} times.`);
  for (const s of input.assessment.scores) {
    if (s.score < MIN_DIMENSION_SCORE) reasons.push(`${s.dimension.replaceAll("_", " ")}: ${s.score}/5 (needs 3).`);
  }
  if (!PASSING_VERDICTS.has(input.assessment.verdict)) {
    reasons.push(`Interviewer's overall verdict: ${input.assessment.verdict.replaceAll("_", " ")}.`);
  }
  return { passed: reasons.length === 0, reasons };
}
