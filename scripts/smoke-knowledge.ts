// Checks the knowledge bar against a real model through the claude CLI (your subscription):
// 1) a review must include at least one knowledge probe tagged with a concept id;
// 2) a buzzword-only answer must not be graded above "surface", and a real explanation must reach "solid".
// Run: npm run smoke:knowledge
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadModelsConfig } from "../src/server/config.ts";
import { Budget } from "../src/server/llm/budget.ts";
import { createLlmClient } from "../src/server/llm/client.ts";
import { createClaudeCliProvider } from "../src/server/llm/claudeCliProvider.ts";
import { findProblem } from "../src/server/interview/problems.ts";
import { gradePrompt, reviewPrompt, systemPrompt } from "../src/server/interview/prompts.ts";
import { diffDesigns } from "../src/server/interview/compact.ts";
import { ReviewResultSchema, type Design, type Session, type Thread } from "../src/shared/schemas.ts";

const problem = findProblem("url-shortener");
if (!problem) throw new Error("problem missing");

const design: Design = {
  nodes: [
    { id: "n1", type: "client", label: "Browser", notes: "", parent: "" },
    { id: "n2", type: "load_balancer", label: "ALB", notes: "", parent: "" },
    { id: "n3", type: "service", label: "URL service", notes: "base62 of a counter range per instance", parent: "" },
    { id: "n4", type: "cache", label: "Redis", notes: "cache-aside for redirects", parent: "" },
    { id: "n5", type: "nosql_db", label: "DynamoDB", notes: "partitioned by short code, 3 replicas", parent: "" },
  ],
  edges: [
    { id: "e1", from: "n1", to: "n2", mode: "sync", direction: "one_way", label: "" },
    { id: "e2", from: "n2", to: "n3", mode: "sync", direction: "one_way", label: "" },
    { id: "e3", from: "n3", to: "n4", mode: "sync", direction: "one_way", label: "" },
    { id: "e4", from: "n3", to: "n5", mode: "sync", direction: "one_way", label: "" },
  ],
};
const requirements = { functional: "shorten; redirect", nonFunctional: "p99 redirect < 50 ms; 99.99% available", estimates: "" };
const contract = { entities: "ShortUrl", api: "POST /v1/urls\nGET /{code}" };
const untested: Session["knowledge"] = problem.rubric.concepts.map((concept) => ({ concept, level: "untested", evidence: "" }));

const llm = createLlmClient({
  provider: createClaudeCliProvider(),
  providerName: "claude-cli",
  dryRun: false,
  models: loadModelsConfig(),
  budget: new Budget({ perSession: 40_000, perDay: 0 }, join(tmpdir(), "interview-sim-smoke.json")),
});
const system = systemPrompt(problem);
const base = { design, requirements, contract, round: 2, elapsedMin: 20, durationMin: 45 };
let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures++;
};

// 1) Review: does the interviewer probe knowledge?
const review = await llm.call({
  task: "review_round", system,
  prompt: reviewPrompt({ ...base, diff: diffDesigns(undefined, design), threads: [], knowledge: untested }, 5),
  schema: ReviewResultSchema, context: { problemId: problem.id, design, threads: [] }, sessionTokensUsed: 0,
});
const probes = review.data.annotations.filter((a) => problem.rubric.concepts.includes(a.concept as never));
console.log("\nKnowledge probes:\n" + probes.map((p) => `  [${p.concept}] ${p.text}`).join("\n"));
check(probes.length >= 1, "review includes at least one knowledge probe tagged with a required concept");

// 2) Grading: buzzwords vs a real explanation, on the replication area.
const ask = "A user updates their link and immediately reloads, but the read hits a lagging replica. What do they see, and how do you fix it?";
const thread = (id: string, answer: string): Thread => ({
  id, source: "llm", round: 2, target: { kind: "global", id: "" }, type: "question", severity: "high",
  text: ask, concept: "ddia-replication", status: "answered", answers: [answer], followups: [],
});
const buzz = thread("t1", "We use replicas and caching, so it's highly available and consistent.");
const real = thread(
  "t2",
  "Replication is asynchronous, so the follower can be behind and the user sees the old URL. For read-your-writes I " +
    "send that user's reads to the leader for ~1 minute after a write (tracked by a timestamp in their session), or " +
    "pass the write's version and only read from replicas that have caught up. Cost: more leader load right after writes.",
);
const graded = await llm.call({
  task: "grade_answers", system,
  prompt: gradePrompt({ ...base, diff: diffDesigns(design, design), threads: [buzz], knowledge: untested }),
  schema: ReviewResultSchema, context: { problemId: problem.id, design, threads: [buzz] }, sessionTokensUsed: 0,
});
const gradedReal = await llm.call({
  task: "grade_answers", system,
  prompt: gradePrompt({ ...base, diff: diffDesigns(design, design), threads: [real], knowledge: untested }),
  schema: ReviewResultSchema, context: { problemId: problem.id, design, threads: [real] }, sessionTokensUsed: 0,
});
const levelOf = (r: typeof graded) => r.data.conceptUpdates.find((u) => u.concept === "ddia-replication")?.level ?? "(not graded)";
console.log(`\nBuzzword answer graded: ${levelOf(graded)}\nReal explanation graded: ${levelOf(gradedReal)}`);
check(["none", "surface"].includes(levelOf(graded)), "buzzword answer is graded none/surface, not solid");
check(["solid", "deep"].includes(levelOf(gradedReal)), "real explanation is graded solid/deep");

console.log(`\n${failures === 0 ? "All checks passed" : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
