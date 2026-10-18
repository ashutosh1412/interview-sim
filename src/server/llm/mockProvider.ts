// Free, deterministic stand-in for a real model. It answers about the user's actual
// nodes and threads, so the whole UI loop can be exercised without spending anything.
import type { AppConfig } from "../config.ts";
import { AppError } from "../errors.ts";
import { findProblem } from "../interview/problems.ts";
import { isComponent } from "../../shared/components.ts";
import type {
  Assessment,
  ClarifyResult,
  ComponentType,
  LlmAnnotation,
  LlmThreadUpdate,
  ReviewResult,
} from "../../shared/schemas.ts";
import type { LlmProvider, LlmRequest, LlmResponse } from "./types.ts";

const QUESTION_BANK: Partial<Record<ComponentType, string>> = {
  load_balancer: "Which load-balancing algorithm do you use here, and how are unhealthy instances removed?",
  api_gateway: "What does the gateway own (auth, rate limits, routing) versus the services behind it?",
  service: "Is this service stateless? How many instances do you need at peak, and how do they scale?",
  worker: "What happens if a worker crashes halfway through a job? Can jobs run twice?",
  cache: "What is your caching strategy here (cache-aside, write-through) and how do you invalidate entries?",
  sql_db: "How does this database handle your peak write load? Replicas, sharding, or both?",
  nosql_db: "What is the partition key, and how do you avoid hot partitions?",
  queue: "What delivery guarantee does this queue give, and how do consumers stay idempotent?",
  object_storage: "How do clients upload and fetch large objects without going through your app servers?",
  cdn: "What content is cached at the CDN and how is it invalidated?",
  search: "How is the search index kept in sync with the source of truth?",
  stream: "How many partitions, what is the partition key, and how do consumers handle reprocessing?",
  pubsub: "What happens to a message if one subscriber is down for an hour?",
  auth: "How do other services validate a user's token without calling you on every request?",
  rate_limiter: "Which algorithm, and where do the counters live so every instance sees the same count?",
  scheduler: "What stops the same job from running twice if two scheduler instances fire?",
  data_warehouse: "How does data get here, and how fresh does it need to be?",
  vector_db: "How do you keep embeddings in sync when the source documents change?",
  ml_model: "What is the latency budget for inference, and how do you roll out a new model version safely?",
  notification: "How do you avoid sending duplicate notifications when a send is retried?",
  serverless: "What happens to latency on a cold start, and is that acceptable here?",
  dns: "How do you route users to the nearest healthy region?",
};

const SHORT_ANSWER_CHARS = 80;

function reviewRound(req: LlmRequest): ReviewResult {
  const { design, threads, problemId } = req.context;

  const threadUpdates: LlmThreadUpdate[] = threads
    .filter((t) => t.status === "answered")
    .map((t) => {
      const latest = t.answers.at(-1) ?? "";
      return latest.length >= SHORT_ANSWER_CHARS
        ? { threadId: t.id, verdict: "resolved", followup: "" }
        : {
            threadId: t.id,
            verdict: "followup",
            followup: "Can you go one level deeper? What exactly happens under failure or at 10x load?",
          };
    });

  if (req.task === "grade_answers") return { annotations: [], threadUpdates };

  const askedTargets = new Set(threads.map((t) => `${t.target.kind}:${t.target.id}`));
  const askedTexts = new Set(threads.map((t) => t.text));
  const annotations: LlmAnnotation[] = [];

  for (const node of design.nodes) {
    if (!isComponent(node.type)) continue;
    const question = QUESTION_BANK[node.type];
    if (!question || askedTargets.has(`node:${node.id}`)) continue;
    annotations.push({
      target: { kind: "node", id: node.id },
      type: "question",
      severity: node.type.endsWith("_db") ? "high" : "medium",
      text: question,
    });
    if (annotations.length >= 3) break;
  }

  const asyncEdge = design.edges.find(
    (e) => e.mode === "async" && !askedTargets.has(`edge:${e.id}`),
  );
  if (asyncEdge) {
    annotations.push({
      target: { kind: "edge", id: asyncEdge.id },
      type: "question",
      severity: "medium",
      text: "This call is async. How does the caller learn about failures, and what is the retry policy?",
    });
  }

  const global = findProblem(problemId)?.mockQuestions.find((q) => !askedTexts.has(q));
  if (global) {
    annotations.push({ target: { kind: "global", id: "" }, type: "question", severity: "high", text: global });
  }

  return { annotations, threadUpdates };
}

function clarify(req: LlmRequest): ClarifyResult {
  const q = (req.context.question ?? "").toLowerCase();
  const rubric = findProblem(req.context.problemId)?.rubric;
  if (rubric && /scale|users|traffic|qps|load|how many|volume|dau|latency|storage|read|write/.test(q)) {
    return { answer: `Assume ${rubric.scale}.` };
  }
  if (/how (should|do) i|which (database|db)|should i use/.test(q)) {
    return { answer: "That's a design decision for you to make. Tell me what you'd pick and why." };
  }
  return { answer: "Good question. Keep it to the core use case for now and state your assumption explicitly." };
}

function finalAssessment(req: LlmRequest): Assessment {
  const { threads, design } = req.context;
  const resolved = threads.filter((t) => t.status === "resolved").length;
  const ratio = threads.length === 0 ? 0 : resolved / threads.length;
  const base = Math.max(1, Math.min(5, Math.round(1 + ratio * 4)));
  const size = Math.min(5, Math.max(1, Math.ceil(design.nodes.filter((n) => isComponent(n.type)).length / 2)));

  return {
    scores: [
      { dimension: "requirements", score: base, comment: "Mock score based on resolved threads." },
      { dimension: "high_level_design", score: size, comment: "Mock score based on design coverage." },
      { dimension: "scalability", score: base, comment: "Mock score." },
      { dimension: "reliability", score: base, comment: "Mock score." },
      { dimension: "trade_offs", score: base, comment: "Mock score." },
      { dimension: "communication", score: base, comment: "Mock score." },
    ],
    verdict: ratio >= 0.75 ? "hire" : ratio >= 0.5 ? "lean_hire" : "lean_no_hire",
    summary: `Mock assessment: ${resolved} of ${threads.length} interviewer threads resolved. Switch LLM_PROVIDER to claude-cli for a real evaluation.`,
    missed: [],
  };
}

function waitForAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(new AppError("llm_timeout", "Mock timeout")), {
      once: true,
    });
  });
}

export function createMockProvider(failure: AppConfig["mockFailure"]): LlmProvider {
  return {
    name: "mock",
    async complete(req: LlmRequest): Promise<LlmResponse> {
      switch (failure) {
        case "bad_json":
          return { text: "Sure! Here are my thoughts: {not json", usage: { inputTokens: 0, outputTokens: 0 } };
        case "timeout":
          return waitForAbort(req.signal);
        case "rate_limit":
          throw new AppError("llm_rate_limited", "Mock rate limit");
        case "refusal":
          throw new AppError("llm_refused", "Mock refusal");
        case "none":
          break;
      }
      const body =
        req.task === "final_assessment" ? finalAssessment(req) : req.task === "clarify" ? clarify(req) : reviewRound(req);
      return { text: JSON.stringify(body), usage: { inputTokens: 0, outputTokens: 0 } };
    },
  };
}
