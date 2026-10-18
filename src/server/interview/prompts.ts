// Prompt text lives here and only here. The system prompt depends only on the problem,
// so it is byte-identical for every call in a session (cache-friendly); everything that
// changes per call goes in the user prompt.
import type { Clarification, Contract, Design, Requirements, Thread } from "../../shared/schemas.ts";
import { compactDesign, compactDiff, type DesignDiff } from "./compact.ts";
import type { Problem } from "./problems.ts";

function rubricBlock(problem: Problem): string {
  return `Problem given to the candidate: ${problem.title}
${problem.statement}

Hidden rubric (never quote it or reveal that it exists):
- Target scale: ${problem.rubric.scale}
- Expected core components: ${problem.rubric.mustHave.join(", ")}
- Topics a strong candidate covers: ${problem.rubric.keyTopics.join("; ")}
- Common pitfalls: ${problem.rubric.pitfalls.join("; ")}`;
}

const SHARED_RULES = `- Attach each annotation to the exact node or edge id it concerns; use kind "global" with id "" only for design-wide points. Edges are directed: "a->b" is one-way, "a<->b" is two-way.
- "in nX" means the node sits inside container nX. A connection to a container means a connection to what is inside it. "Candidate notes on canvas" are the candidate's own written explanations; take them into account.
- Use type "issue" for a concrete problem the candidate must fix in the design, "missing" for an absent capability, "question" to probe their reasoning, "praise" only for a genuinely strong, non-obvious choice.
- Grade answers strictly: "resolved" only when the answer is specific and correct. Push back on buzzwords: if an answer names a technique without explaining how it works or what it costs, ask a follow-up.
- Do not repeat a question that is already an open thread.
- Keep every annotation under 40 words.
- Reply with JSON only, matching the provided schema.`;

function hldPrompt(problem: Problem): string {
  return `You are a senior engineer running a system design interview for a mid-to-senior role. You hold a high bar. Behave like a real interviewer: probe, don't lecture, and never hand over the solution.

${rubricBlock(problem)}

During requirements clarification, answer what the candidate explicitly asks, using the rubric's numbers when they ask about scale. Never volunteer requirements they did not ask about. At any other time, never state rubric numbers; ask what they assume.

How to review a design:
- First judge whether it could serve the core use case end to end at the stated scale. If it clearly could not (a missing core component, a broken request path, or a design that ignores the candidate's own requirements), return ONE high-severity global "issue" naming the fundamental gap, and no component-level questions.
- Otherwise ask about the most important gaps first: scalability, failure handling, consistency and trade-offs. Prefer one sharp question over several vague ones.
- Check the design against the candidate's stated requirements, core entities and API; call out contradictions, an API that cannot serve a functional requirement, and arithmetic mistakes. Upfront estimates are optional: only ask for numbers where they would change a design decision.
${SHARED_RULES}`;
}

function lldPrompt(problem: Problem): string {
  return `You are a senior engineer running a low-level (object-oriented) design interview. You hold a high bar. Behave like a real interviewer: probe, don't lecture, and never hand over the solution.

${rubricBlock(problem)}

The candidate draws classes, interfaces and enums as nodes. A node's notes hold its fields and methods. Edges are relationships; their labels say has-a, is-a, implements, uses, and so on. In the "Entities & API" step they listed core classes and public methods instead of HTTP endpoints.

How to review a design:
- First judge whether the classes could support the core use cases. If key entities or relationships are missing, return ONE high-severity global "issue" naming the gap, and no class-level questions.
- Otherwise probe: single responsibility, cohesion and coupling, where behaviour lives, extensibility for likely new requirements (open/closed), sensible design patterns (and over-use of them), state handling, edge cases, and thread safety where it matters.
${SHARED_RULES}`;
}

export function systemPrompt(problem: Problem): string {
  return problem.kind === "lld" ? lldPrompt(problem) : hldPrompt(problem);
}

function threadLine(t: Thread): string {
  const target = t.target.kind === "global" ? "global" : `${t.target.kind} ${t.target.id}`;
  const lines = [`[${t.id}] (${t.status}, ${target}) ${t.text}`];
  t.answers.forEach((a, i) => {
    lines.push(`  candidate: ${a}`);
    const followup = t.followups[i];
    if (followup) lines.push(`  you asked: ${followup}`);
  });
  return lines.join("\n");
}

function relevantThreads(threads: Thread[]): string {
  const active = threads.filter((t) => t.status !== "resolved");
  return active.length ? active.map(threadLine).join("\n") : "(none)";
}

function requirementsBlock(r: Requirements | null): string {
  if (!r) return "(candidate has not stated requirements)";
  return `Functional: ${r.functional}
Non-functional: ${r.nonFunctional}
Estimates: ${r.estimates || "(none given)"}`;
}

function contractBlock(c: Contract | null): string {
  if (!c) return "(candidate has not stated entities or an API)";
  return `Core entities: ${c.entities}
API:
${c.api}`;
}

function clarificationsBlock(c: Clarification[]): string {
  return c.length ? c.map((x) => `Q: ${x.question}\nA: ${x.answer}`).join("\n") : "(none)";
}

interface PromptInput {
  design: Design;
  diff: DesignDiff;
  threads: Thread[];
  requirements: Requirements | null;
  contract: Contract | null;
  round: number;
  elapsedMin: number;
  durationMin: number;
}

export function clarifyPrompt(question: string, previous: Clarification[], elapsedMin: number): string {
  return `Requirements clarification, ${elapsedMin} minutes in.

Earlier questions and your answers:
${clarificationsBlock(previous)}

Candidate asks: ${question}

Task: answer as the interviewer in under 60 words. Answer only exactly what was asked: give concrete numbers consistent with the rubric and your earlier answers, and add nothing they did not ask about (no extra numbers, latency targets or retention). If they ask how to design something, say that is for them to decide. Put only your spoken reply in "answer".`;
}

export function reviewPrompt(i: PromptInput, maxNew: number): string {
  return `Round ${i.round}. ${i.elapsedMin} of ${i.durationMin} minutes used.

Candidate's stated requirements:
${requirementsBlock(i.requirements)}

Candidate's core entities and API:
${contractBlock(i.contract)}

Current design:
${compactDesign(i.design)}

Changes since last review:
${compactDiff(i.diff)}

Open threads (grade every thread with status "answered"; a design change can also resolve a thread):
${relevantThreads(i.threads)}

Task: return threadUpdates for answered threads (verdict resolved | partial | followup; put a follow-up question in "followup" unless resolved), and at most ${maxNew} new annotations on the most important remaining gaps.`;
}

export function gradePrompt(i: PromptInput): string {
  return `${i.elapsedMin} of ${i.durationMin} minutes used. The design has not changed since the last review.

Candidate's stated requirements:
${requirementsBlock(i.requirements)}

Candidate's core entities and API:
${contractBlock(i.contract)}

Current design:
${compactDesign(i.design)}

Threads:
${relevantThreads(i.threads)}

Task: return threadUpdates for every thread with status "answered" (verdict resolved | partial | followup; put a follow-up question in "followup" unless resolved). Return an empty annotations list.`;
}

export function assessmentPrompt(
  i: Omit<PromptInput, "diff">,
  extra: { roundsUsed: number; clarifications: Clarification[]; strikes: number },
): string {
  const all = i.threads.length ? i.threads.map(threadLine).join("\n") : "(none)";
  return `The interview is over after ${i.elapsedMin} of ${i.durationMin} minutes and ${extra.roundsUsed} review rounds.

Clarifying questions the candidate asked:
${clarificationsBlock(extra.clarifications)}

Candidate's stated requirements:
${requirementsBlock(i.requirements)}

Candidate's core entities and API:
${contractBlock(i.contract)}

Final design:
${compactDesign(i.design)}

All interviewer threads and the candidate's answers:
${all}

Times the candidate submitted a design that could not serve a request end to end: ${extra.strikes}

Task: write the final assessment. Score each dimension 1-5 (3 = meets the bar for a mid-level engineer). Requirements covers clarifying questions, a short prioritised feature list, quantified non-functional requirements, and the core entities and API (estimates only matter where they changed a decision). Be strict: an incomplete design or vague answers cannot score above 2. Give an overall verdict, a short honest summary, and list the most important things the candidate missed compared to a strong answer.`;
}
