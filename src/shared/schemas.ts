// Single source of truth for every shape that crosses a boundary:
// browser <-> server, and server <-> LLM. Types are inferred from these schemas.
import { z } from "zod";

import { COMPONENT_TYPES, type ComponentType } from "./components.ts";

export { COMPONENT_TYPES, type ComponentType };

export const ComponentTypeSchema = z.enum(COMPONENT_TYPES);

const Id = z.string().min(1).max(64);
const ShortText = z.string().max(200);

export const DesignNodeSchema = z.object({
  id: Id,
  type: ComponentTypeSchema,
  // Text and sticky notes keep their content in the label, so it can be longer.
  label: z.string().max(500),
  notes: z.string().max(500).default(""),
  /** Id of the container (group, region, AZ, VPC) this node sits inside; "" for none. */
  parent: z.string().max(64).default(""),
});
export type DesignNode = z.infer<typeof DesignNodeSchema>;

export const DesignEdgeSchema = z.object({
  id: Id,
  from: Id,
  to: Id,
  mode: z.enum(["sync", "async"]).default("sync"),
  /** one_way: from -> to only. two_way: requests flow both ways. */
  direction: z.enum(["one_way", "two_way"]).default("one_way"),
  label: ShortText.default(""),
});
export type DesignEdge = z.infer<typeof DesignEdgeSchema>;

export const DesignSchema = z.object({
  nodes: z.array(DesignNodeSchema).max(120),
  edges: z.array(DesignEdgeSchema).max(200),
});
export type Design = z.infer<typeof DesignSchema>;

export const AnnotationTargetSchema = z.object({
  kind: z.enum(["node", "edge", "global"]),
  id: z.string().describe("Node or edge id from the design; empty string for global"),
});
export type AnnotationTarget = z.infer<typeof AnnotationTargetSchema>;

export const AnnotationTypeSchema = z.enum(["question", "issue", "missing", "praise"]);
export const SeveritySchema = z.enum(["low", "medium", "high"]);

// What the LLM is allowed to produce for one annotation. Ids are assigned by the server.
export const LlmAnnotationSchema = z.object({
  target: AnnotationTargetSchema,
  type: AnnotationTypeSchema,
  severity: SeveritySchema,
  text: z.string().min(1).max(400),
});
export type LlmAnnotation = z.infer<typeof LlmAnnotationSchema>;

export const ThreadVerdictSchema = z.enum(["resolved", "partial", "followup"]);

export const LlmThreadUpdateSchema = z.object({
  threadId: z.string(),
  verdict: ThreadVerdictSchema,
  followup: z.string().max(400).describe("Follow-up question; empty string if none"),
});
export type LlmThreadUpdate = z.infer<typeof LlmThreadUpdateSchema>;

// Output contract for review_round and grade_answers.
export const ReviewResultSchema = z.object({
  annotations: z.array(LlmAnnotationSchema).max(8),
  threadUpdates: z.array(LlmThreadUpdateSchema).max(20),
});
export type ReviewResult = z.infer<typeof ReviewResultSchema>;

export const DIMENSIONS = [
  "requirements",
  "high_level_design",
  "scalability",
  "reliability",
  "trade_offs",
  "communication",
] as const;

// Output contract for final_assessment.
export const AssessmentSchema = z.object({
  scores: z.array(
    z.object({
      dimension: z.enum(DIMENSIONS),
      score: z.number().int().min(1).max(5),
      comment: z.string().max(400),
    }),
  ),
  verdict: z.enum(["strong_hire", "hire", "lean_hire", "lean_no_hire", "no_hire"]),
  summary: z.string().max(1200),
  missed: z.array(z.string().max(300)).max(10),
});
export type Assessment = z.infer<typeof AssessmentSchema>;

// Output contract for clarify (requirements Q&A).
export const ClarifyResultSchema = z.object({
  answer: z.string().min(1).max(800),
});
export type ClarifyResult = z.infer<typeof ClarifyResultSchema>;

export const RequirementsSchema = z.object({
  functional: z.string().trim().min(1, "List at least one functional requirement").max(2000),
  nonFunctional: z.string().trim().min(1, "List at least one non-functional requirement").max(2000),
  estimates: z.string().trim().max(2000).default(""),
});
export type Requirements = z.infer<typeof RequirementsSchema>;

/** Step 2 of a real interview: the nouns of the system and the API contract, before boxes and arrows. */
export const ContractSchema = z.object({
  entities: z.string().trim().min(1, "List the core entities").max(1000),
  api: z.string().trim().min(1, "Sketch at least one API endpoint").max(3000),
});
export type Contract = z.infer<typeof ContractSchema>;

export const ClarificationSchema = z.object({ question: z.string(), answer: z.string(), at: z.string() });
export type Clarification = z.infer<typeof ClarificationSchema>;

export const ThreadStatusSchema = z.enum(["open", "answered", "resolved", "followup"]);
export type ThreadStatus = z.infer<typeof ThreadStatusSchema>;

export const ThreadSchema = z.object({
  id: z.string(),
  source: z.enum(["rules", "llm"]),
  round: z.number().int(),
  target: AnnotationTargetSchema,
  type: AnnotationTypeSchema,
  severity: SeveritySchema,
  text: z.string(),
  status: ThreadStatusSchema,
  answers: z.array(z.string()),
  followups: z.array(z.string()),
});
export type Thread = z.infer<typeof ThreadSchema>;

export const UsageSchema = z.object({
  calls: z.number().int(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
});
export type Usage = z.infer<typeof UsageSchema>;

export const SessionSchema = z.object({
  id: z.string(),
  problemId: z.string(),
  durationMin: z.number().int(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  // Defaults keep sessions saved by older versions loadable.
  phase: z.enum(["requirements", "api", "design"]).default("requirements"),
  clarifications: z.array(ClarificationSchema).default([]),
  requirements: RequirementsSchema.nullable().default(null),
  contract: ContractSchema.nullable().default(null),
  /** Submits rejected as not reviewable (no end-to-end design). Real interviewers notice. */
  strikes: z.number().int().default(0),
  rounds: z.array(
    z.object({ at: z.string(), design: DesignSchema, task: z.string(), note: z.string() }),
  ),
  threads: z.array(ThreadSchema),
  assessment: AssessmentSchema.nullable(),
  usage: UsageSchema,
});
export type Session = z.infer<typeof SessionSchema>;

// ---- HTTP API contracts ----

export const StartSessionRequestSchema = z.object({
  problemId: z.string(),
  durationMin: z.union([z.literal(30), z.literal(45), z.literal(60)]),
});

export const AnswerSchema = z.object({
  threadId: z.string(),
  text: z.string().trim().min(1).max(2000),
});
export type Answer = z.infer<typeof AnswerSchema>;

export const SubmitRoundRequestSchema = z.object({
  design: DesignSchema,
  answers: z.array(AnswerSchema).max(30),
  // Client-generated id so a double click or retry never runs (or bills) twice.
  requestId: z.string().min(8).max(64),
});
export type SubmitRoundRequest = z.infer<typeof SubmitRoundRequestSchema>;

export const ClarifyRequestSchema = z.object({
  question: z.string().trim().min(3).max(500),
  requestId: z.string().min(8).max(64),
});

export const FinishRequestSchema = z.object({
  design: DesignSchema,
  requestId: z.string().min(8).max(64),
});

export const PublicProblemSchema = z.object({
  id: z.string(),
  title: z.string(),
  track: z.string(),
  statement: z.string(),
});
export type PublicProblem = z.infer<typeof PublicProblemSchema>;

export const StatusSchema = z.object({
  provider: z.string(),
  dryRun: z.boolean(),
  budget: z.object({ perSession: z.number(), perDay: z.number(), usedToday: z.number() }),
});
export type Status = z.infer<typeof StatusSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
