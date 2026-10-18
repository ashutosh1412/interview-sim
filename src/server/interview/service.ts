import { randomUUID } from "node:crypto";
import {
  AssessmentSchema,
  ClarifyResultSchema,
  ReviewResultSchema,
  type Answer,
  type Contract,
  type Design,
  type LlmAnnotation,
  type Requirements,
  type ReviewResult,
  type Session,
  type SubmitRoundRequest,
  type Thread,
} from "../../shared/schemas.ts";
import { AppError } from "../errors.ts";
import type { LlmClient } from "../llm/client.ts";
import { diffDesigns, isEmptyDiff } from "./compact.ts";
import { findProblem, type Problem } from "./problems.ts";
import { assessmentPrompt, clarifyPrompt, gradePrompt, reviewPrompt, systemPrompt } from "./prompts.ts";
import { runRules } from "./rules.ts";
import type { SessionStore } from "./sessionStore.ts";

const MAX_NEW_ANNOTATIONS = 5;
const MAX_CLARIFICATIONS = 15;
/** After this many non-reviewable submits, a real interviewer would likely have stopped. */
export const STRIKE_WARNING = 3;
/** Grace period after the clock runs out during which only "finish" is accepted. */
const OVERTIME_MS = 2 * 60_000;
const IDEMPOTENCY_CACHE_SIZE = 200;

export interface InterviewService {
  start(problemId: string, durationMin: number): Session;
  get(id: string): Session;
  clarify(id: string, question: string, requestId: string): Promise<Session>;
  lockRequirements(id: string, requirements: Requirements): Session;
  lockContract(id: string, contract: Contract): Session;
  submitRound(id: string, req: SubmitRoundRequest): Promise<Session>;
  finish(id: string, design: Design, requestId: string): Promise<Session>;
}

function minutesSince(iso: string, now: number): number {
  return Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
}

function applyAnswers(threads: Thread[], answers: Answer[]): void {
  const byId = new Map(threads.map((t) => [t.id, t]));
  for (const { threadId, text } of answers) {
    const thread = byId.get(threadId);
    if (!thread || thread.status === "resolved") continue;
    thread.answers.push(text);
    thread.status = "answered";
  }
}

/**
 * Adds new rule findings and auto-resolves rule threads the design no longer triggers.
 * Returns how many blocking findings are active.
 */
function syncRuleThreads(session: Session, problem: Problem, design: Design, round: number): number {
  const findings = runRules(design, { kind: problem.kind, requirements: session.requirements, contract: session.contract });
  const activeKeys = new Set(findings.map((f) => `r-${f.key}`));
  const threads = session.threads;

  for (const t of threads) {
    if (t.source === "rules" && t.status !== "resolved" && !activeKeys.has(t.id)) t.status = "resolved";
  }
  const existing = new Map(threads.map((t) => [t.id, t]));
  for (const f of findings) {
    const id = `r-${f.key}`;
    const current = existing.get(id);
    if (current) {
      if (current.status === "resolved") current.status = "open"; // regressed
      continue;
    }
    threads.push({
      id, source: "rules", round, target: f.target, type: f.type, severity: f.severity,
      text: f.text, status: "open", answers: [], followups: [],
    });
  }
  return findings.filter((f) => f.blocking).length;
}

/** Keeps annotations pointing at real elements; anything else becomes a global note. */
function sanitizeTarget(a: LlmAnnotation, design: Design): LlmAnnotation["target"] {
  const ids = a.target.kind === "node" ? design.nodes : a.target.kind === "edge" ? design.edges : [];
  return ids.some((x) => x.id === a.target.id) ? a.target : { kind: "global", id: "" };
}

function applyReview(session: Session, result: ReviewResult, design: Design, round: number): void {
  const byId = new Map(session.threads.map((t) => [t.id, t]));
  for (const u of result.threadUpdates) {
    const thread = byId.get(u.threadId);
    if (!thread || thread.status !== "answered") continue;
    if (u.verdict === "resolved") {
      thread.status = "resolved";
    } else {
      thread.status = "followup";
      thread.followups[thread.answers.length - 1] =
        u.followup.trim() || "Can you be more specific about how that works?";
    }
  }

  const seen = new Set(session.threads.map((t) => t.text.trim().toLowerCase()));
  let next = session.threads.filter((t) => t.source === "llm").length + 1;
  for (const a of result.annotations.slice(0, MAX_NEW_ANNOTATIONS)) {
    const key = a.text.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    session.threads.push({
      id: `t${next++}`, source: "llm", round, target: sanitizeTarget(a, design), type: a.type,
      severity: a.severity, text: a.text.trim(), status: "open", answers: [], followups: [],
    });
  }
}

/** Some models nest the whole JSON reply inside the answer string; take the inner text. */
export function unwrapAnswer(answer: string): string {
  const trimmed = answer.trim();
  if (!trimmed.startsWith("{")) return trimmed;
  try {
    const inner: unknown = JSON.parse(trimmed);
    if (inner && typeof inner === "object" && "answer" in inner && typeof inner.answer === "string") {
      return inner.answer.trim();
    }
  } catch {
    // not JSON after all: keep the text as written
  }
  return trimmed;
}

function strikeNote(strikes: number): string {
  const base = `Not reviewable yet: fix the red items so a request can flow end to end (strike ${strikes}).`;
  return strikes >= STRIKE_WARNING
    ? `${base} In a real interview this is where the interviewer would likely end the session. It will count against you.`
    : base;
}

export function createInterviewService(deps: {
  store: SessionStore;
  llm: LlmClient;
  now?: () => number;
}): InterviewService {
  const { store, llm } = deps;
  const now = deps.now ?? Date.now;
  // requestId -> in-flight or finished result. A double click or client retry reuses it.
  const inFlight = new Map<string, Promise<Session>>();

  function once(requestId: string, work: () => Promise<Session>): Promise<Session> {
    const existing = inFlight.get(requestId);
    if (existing) return existing;
    const promise = work().catch((error: unknown) => {
      inFlight.delete(requestId); // failures may be retried with the same id
      throw error;
    });
    inFlight.set(requestId, promise);
    if (inFlight.size > IDEMPOTENCY_CACHE_SIZE) {
      const oldest = inFlight.keys().next().value;
      if (oldest !== undefined) inFlight.delete(oldest);
    }
    return promise;
  }

  function load(id: string): { session: Session; problem: Problem } {
    const session = store.get(id);
    if (!session) throw new AppError("not_found", "Session not found");
    const problem = findProblem(session.problemId);
    if (!problem) throw new AppError("not_found", "Problem not found");
    return { session, problem };
  }

  function assertActive(session: Session): void {
    if (session.finishedAt) throw new AppError("session_finished", "This interview is already finished");
    const deadline = Date.parse(session.startedAt) + session.durationMin * 60_000;
    if (now() > deadline + OVERTIME_MS) {
      throw new AppError("session_finished", "Time is up. Finish the interview to get your assessment.");
    }
  }

  function addUsage(session: Session, usage: { calls: number; inputTokens: number; outputTokens: number }) {
    session.usage.calls += usage.calls;
    session.usage.inputTokens += usage.inputTokens;
    session.usage.outputTokens += usage.outputTokens;
  }

  const tokensUsed = (s: Session) => s.usage.inputTokens + s.usage.outputTokens;
  const lastDesign = (s: Session): Design => s.rounds.at(-1)?.design ?? { nodes: [], edges: [] };

  async function doClarify(id: string, question: string): Promise<Session> {
    const { session, problem } = load(id);
    assertActive(session);
    if (session.clarifications.length >= MAX_CLARIFICATIONS) {
      throw new AppError("bad_request", `That's ${MAX_CLARIFICATIONS} questions. State your assumptions and move on.`);
    }
    const result = await llm.call({
      task: "clarify",
      system: systemPrompt(problem),
      prompt: clarifyPrompt(question, session.clarifications, minutesSince(session.startedAt, now())),
      schema: ClarifyResultSchema,
      context: { problemId: problem.id, design: lastDesign(session), threads: session.threads, question },
      sessionTokensUsed: tokensUsed(session),
    });
    addUsage(session, result.usage);
    session.clarifications.push({ question, answer: unwrapAnswer(result.data.answer), at: new Date(now()).toISOString() });
    store.save(session);
    return session;
  }

  async function doSubmit(id: string, req: SubmitRoundRequest): Promise<Session> {
    const { session, problem } = load(id);
    assertActive(session);
    if (session.phase !== "design") {
      const step = session.phase === "requirements" ? "your requirements" : "your core entities and API";
      throw new AppError("bad_request", `Lock in ${step} before submitting a design.`);
    }

    const round = session.rounds.length + 1;
    const prevDesign = session.rounds.at(-1)?.design;
    const diff = diffDesigns(prevDesign, req.design);
    applyAnswers(session.threads, req.answers);
    const blocking = syncRuleThreads(session, problem, req.design, round);

    const designChanged = prevDesign === undefined || !isEmptyDiff(diff);
    const hasAnswered = session.threads.some((t) => t.status === "answered");

    let task: "review_round" | "grade_answers" | "none" = "none";
    let note: string;
    if (blocking > 0) {
      session.strikes += 1;
      note = strikeNote(session.strikes);
    } else if (designChanged) {
      task = "review_round";
      note = "Reviewed design and answers.";
    } else if (hasAnswered) {
      task = "grade_answers";
      note = "Design unchanged; graded answers only (cheaper model).";
    } else {
      note = "Nothing changed since the last review; no model call made.";
    }

    if (task !== "none") {
      const input = {
        design: req.design, diff, threads: session.threads, requirements: session.requirements,
        contract: session.contract, round,
        elapsedMin: minutesSince(session.startedAt, now()), durationMin: session.durationMin,
      };
      const result = await llm.call({
        task,
        system: systemPrompt(problem),
        prompt: task === "review_round" ? reviewPrompt(input, MAX_NEW_ANNOTATIONS) : gradePrompt(input),
        schema: ReviewResultSchema,
        context: { problemId: problem.id, design: req.design, threads: session.threads },
        sessionTokensUsed: tokensUsed(session),
      });
      applyReview(session, result.data, req.design, round);
      addUsage(session, result.usage);
    }

    session.rounds.push({ at: new Date(now()).toISOString(), design: req.design, task, note });
    store.save(session);
    return session;
  }

  async function doFinish(id: string, design: Design): Promise<Session> {
    const { session, problem } = load(id);
    if (session.finishedAt) return session;
    const result = await llm.call({
      task: "final_assessment",
      system: systemPrompt(problem),
      prompt: assessmentPrompt(
        {
          design, threads: session.threads, requirements: session.requirements, contract: session.contract,
          round: session.rounds.length,
          elapsedMin: minutesSince(session.startedAt, now()), durationMin: session.durationMin,
        },
        { roundsUsed: session.rounds.length, clarifications: session.clarifications, strikes: session.strikes },
      ),
      schema: AssessmentSchema,
      context: { problemId: problem.id, design, threads: session.threads },
      sessionTokensUsed: tokensUsed(session),
    });
    addUsage(session, result.usage);
    session.assessment = result.data;
    session.finishedAt = new Date(now()).toISOString();
    session.rounds.push({ at: session.finishedAt, design, task: "final_assessment", note: "Final assessment." });
    store.save(session);
    return session;
  }

  return {
    start(problemId, durationMin) {
      if (!findProblem(problemId)) throw new AppError("bad_request", "Unknown problem");
      const session: Session = {
        id: randomUUID(), problemId, durationMin, startedAt: new Date(now()).toISOString(),
        finishedAt: null, phase: "requirements", clarifications: [], requirements: null, contract: null, strikes: 0,
        rounds: [], threads: [], assessment: null,
        usage: { calls: 0, inputTokens: 0, outputTokens: 0 },
      };
      store.save(session);
      return session;
    },
    get: (id) => load(id).session,
    clarify: (id, question, requestId) => once(requestId, () => doClarify(id, question)),
    lockRequirements(id, requirements) {
      const { session } = load(id);
      assertActive(session);
      if (session.phase !== "requirements") throw new AppError("bad_request", "Requirements are already locked");
      session.requirements = requirements;
      session.phase = "api";
      store.save(session);
      return session;
    },
    lockContract(id, contract) {
      const { session } = load(id);
      assertActive(session);
      if (session.phase !== "api") {
        throw new AppError("bad_request", session.phase === "requirements" ? "Lock in your requirements first" : "The API is already locked");
      }
      session.contract = contract;
      session.phase = "design";
      store.save(session);
      return session;
    },
    submitRound: (id, req) => once(req.requestId, () => doSubmit(id, req)),
    finish: (id, design, requestId) => once(requestId, () => doFinish(id, design)),
  };
}
