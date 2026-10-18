// Real calls through the claude CLI (your subscription), using the normal model routing:
// one clarifying question, then one review of a weak-but-complete design.
// Run: npm run smoke:cli   (or: npm run smoke:cli -- --clarify)
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadModelsConfig } from "../src/server/config.ts";
import { Budget } from "../src/server/llm/budget.ts";
import { createLlmClient, resolveRoute } from "../src/server/llm/client.ts";
import { createClaudeCliProvider } from "../src/server/llm/claudeCliProvider.ts";
import { findProblem } from "../src/server/interview/problems.ts";
import { clarifyPrompt, reviewPrompt, systemPrompt } from "../src/server/interview/prompts.ts";
import { diffDesigns } from "../src/server/interview/compact.ts";
import { runRules } from "../src/server/interview/rules.ts";
import { ClarifyResultSchema, ReviewResultSchema, type Design, type Requirements } from "../src/shared/schemas.ts";

const models = loadModelsConfig();
const problem = findProblem("url-shortener");
if (!problem) throw new Error("problem missing");

// Complete enough to pass the blocking gate, but weak: no cache on a read-heavy path,
// a single database, and estimates that contradict the stated latency goal.
const design: Design = {
  nodes: [
    { id: "n1", type: "client", label: "Browser", notes: "", parent: "" },
    { id: "n2", type: "load_balancer", label: "ALB", notes: "", parent: "" },
    { id: "n3", type: "service", label: "URL service", notes: "generates code = md5(url)[:6]", parent: "" },
    { id: "n4", type: "sql_db", label: "Postgres", notes: "single instance", parent: "" },
  ],
  edges: [
    { id: "e1", from: "n1", to: "n2", mode: "sync", direction: "two_way", label: "" },
    { id: "e2", from: "n2", to: "n3", mode: "sync", direction: "two_way", label: "" },
    { id: "e3", from: "n3", to: "n4", mode: "sync", direction: "two_way", label: "" },
  ],
};
const requirements: Requirements = {
  functional: "Shorten a URL, redirect short URL to original",
  nonFunctional: "Redirect p99 < 50ms, highly available",
  estimates: "About 100 redirects per second",
};

const blocking = runRules(design, requirements).filter((f) => f.blocking);
if (blocking.length) throw new Error(`Design unexpectedly blocked: ${blocking.map((f) => f.key).join(", ")}`);

const llm = createLlmClient({
  provider: createClaudeCliProvider(),
  providerName: "claude-cli",
  dryRun: false,
  models,
  budget: new Budget({ perSession: 30_000, perDay: 0 }, join(tmpdir(), "interview-sim-smoke.json")),
});
const system = systemPrompt(problem);
const context = { problemId: problem.id, design, threads: [] };

async function timed<T>(label: string, work: () => Promise<T>): Promise<T> {
  const started = Date.now();
  const result = await work();
  console.log(`\n=== ${label} (${((Date.now() - started) / 1000).toFixed(1)}s) ===`);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

const question = "How many new URLs per month, and what read to write ratio?";
console.log(`clarify -> ${resolveRoute(models, "claude-cli", "clarify").model}, review -> ${resolveRoute(models, "claude-cli", "review_round").model}`);

await timed(`clarify: "${question}"`, () =>
  llm.call({
    task: "clarify", system, prompt: clarifyPrompt(question, [], 2),
    schema: ClarifyResultSchema, context: { ...context, question }, sessionTokensUsed: 0,
  }),
);

// Pass --clarify to check only the (cheap) clarify step.
if (!process.argv.includes("--clarify")) await timed("review_round: weak but complete design", () =>
  llm.call({
    task: "review_round", system,
    prompt: reviewPrompt(
      { design, diff: diffDesigns(undefined, design), threads: [], requirements, contract: null, round: 1, elapsedMin: 12, durationMin: 45 },
      5,
    ),
    schema: ReviewResultSchema, context, sessionTokensUsed: 0,
  }),
);
