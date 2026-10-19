// End-to-end interview simulation on a real model (claude CLI, your subscription).
// Runs the real interview service (rules, prompts, grading, pass bar). The candidate is
// played by Claude too: a "strong" one who answers with mechanisms and trade-offs, and a
// "weak" one who answers with buzzwords. A healthy bar passes strong and fails weak.
//
// Run: npm run sim                         (all problems, both candidates)
//      npm run sim -- rag-chatbot strong   (filter by problem id and/or persona)
// Env: SIM_STRONG_MODEL=opus SIM_STRONG_EFFORT=high  (a stronger simulated strong candidate)
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { CONCEPTS, type ConceptId } from "../src/shared/concepts.ts";
import type { Contract, Design, Requirements, Session } from "../src/shared/schemas.ts";
import { loadModelsConfig } from "../src/server/config.ts";
import { Budget } from "../src/server/llm/budget.ts";
import { createLlmClient } from "../src/server/llm/client.ts";
import { createClaudeCliProvider } from "../src/server/llm/claudeCliProvider.ts";
import { extractJson, toLlmJsonSchema } from "../src/server/llm/jsonSchema.ts";
import type { LlmProvider } from "../src/server/llm/types.ts";
import { compactDesign } from "../src/server/interview/compact.ts";
import { findProblem } from "../src/server/interview/problems.ts";
import { createInterviewService } from "../src/server/interview/service.ts";
import { createMemorySessionStore } from "../src/server/interview/sessionStore.ts";

type Persona = "strong" | "weak";

interface Script {
  /** What a strong candidate asks before writing requirements (weak candidates skip this). */
  clarify: string[];
  requirements: Record<Persona, Requirements>;
  contract: Record<Persona, Contract>;
  design: Record<Persona, Design>;
}

const n = (id: string, type: Design["nodes"][number]["type"], label: string, notes = "", parent = "") => ({ id, type, label, notes, parent });
const e = (id: string, from: string, to: string, label = "", mode: "sync" | "async" = "sync") => ({
  id, from, to, mode, direction: "one_way" as const, label,
});

const SCRIPTS: Record<string, Script> = {
  "url-shortener": {
    clarify: [
      "How many new links per day and redirects per second should I plan for, and what is the read:write ratio?",
      "Do we need custom aliases, expiry and click analytics, or just create and redirect?",
      "What latency and availability do redirects need?",
    ],
    requirements: {
      strong: {
        functional: "1. Create a short link for a long URL\n2. Redirect a short link to the original\n3. Optional custom alias and expiry",
        nonFunctional: "Redirect p99 < 50 ms; 99.99% available for redirects; 100M new links/month, ~100:1 read:write; links kept 5 years",
        estimates: "~40 writes/s, ~4k reads/s average, ~40k peak; 6B links over 5 years at ~500 B = ~3 TB",
      },
      weak: { functional: "shorten urls, redirect", nonFunctional: "fast and scalable", estimates: "" },
    },
    contract: {
      strong: { entities: "ShortLink(code, longUrl, ownerId, expiresAt), User", api: "POST /v1/links  body: { longUrl, alias?, expiresAt? } -> { code }\nGET /{code} -> 302 Location: longUrl\nDELETE /v1/links/{code}" },
      weak: { entities: "Url", api: "POST /shorten\nGET /url" },
    },
    design: {
      strong: {
        nodes: [
          n("n1", "client", "Browser"), n("n2", "cdn", "CDN", "caches 302s for hot links, short TTL"),
          n("n3", "load_balancer", "ALB"), n("n4", "service", "Link service", "stateless; codes = base62(counter); each instance leases a counter range of 10k from ZooKeeper"),
          n("n5", "cache", "Redis cluster", "cache-aside for code->url, TTL 1h; invalidated from CDC on delete"),
          n("n6", "nosql_db", "DynamoDB", "partition key = code; multi-AZ replication; strongly consistent read for owner after write"),
          n("n7", "external", "ZooKeeper", "counter range leases"), n("n8", "stream", "Kafka clicks", "partitioned by code"),
          n("n9", "worker", "Analytics consumers", "idempotent by event id"),
        ],
        edges: [e("e1", "n1", "n2"), e("e2", "n2", "n3"), e("e3", "n3", "n4"), e("e4", "n4", "n5"), e("e5", "n4", "n6"),
          e("e6", "n4", "n7"), e("e7", "n4", "n8", "click events", "async"), e("e8", "n8", "n9", "", "async")],
      },
      weak: {
        nodes: [n("n1", "client", "Browser"), n("n2", "load_balancer", "LB"), n("n3", "service", "App"), n("n4", "sql_db", "Database", "replicas")],
        edges: [e("e1", "n1", "n2"), e("e2", "n2", "n3"), e("e3", "n3", "n4")],
      },
    },
  },
  "rag-chatbot": {
    clarify: [
      "How many employees and documents, and roughly how many questions per second at peak?",
      "Which sources (wiki, PDFs, tickets) and how quickly must a document change show up in answers?",
      "How are permissions modelled: per document, per group, inherited from the source system?",
      "What answer latency is acceptable, and do answers need citations?",
    ],
    requirements: {
      strong: {
        functional: "1. Ask a question, get an answer grounded in internal docs with citations\n2. Only use docs the user may see\n3. Say 'I don't know' when sources don't cover it",
        nonFunctional: "Answer p95 < 5 s, first token < 1 s; doc changes searchable within 15 min; 50k employees, ~20 QPS peak; zero cross-permission leaks",
        estimates: "10M docs -> ~200M chunks of ~500 tokens; 1536-dim embeddings ~1.2 TB with index overhead",
      },
      weak: { functional: "chatbot answers questions from docs", nonFunctional: "accurate and fast", estimates: "" },
    },
    contract: {
      strong: { entities: "Document(acl), Chunk(docId, text, embedding, acl), Conversation, Answer(citations)", api: "POST /v1/conversations/{id}/messages  body: { text } -> stream of tokens + citations\nPOST /v1/feedback  body: { answerId, rating }" },
      weak: { entities: "Doc, Question", api: "POST /ask" },
    },
    design: {
      strong: {
        nodes: [
          n("n1", "client", "Chat UI"), n("n2", "api_gateway", "Gateway", "SSO auth; user's groups resolved per request"),
          n("n3", "service", "RAG orchestrator", "query rewrite -> hybrid retrieve (ACL filter) -> rerank top 50 to 8 -> generate with citations"),
          n("n4", "vector_db", "Vector index", "HNSW; ACL groups stored as metadata, filtered at query time"),
          n("n5", "search", "BM25 index", "keyword/exact matches; fused with RRF"), n("n6", "ml_model", "Reranker", "cross-encoder"),
          n("n7", "llm", "LLM", "streaming; temperature 0; JSON with citation ids"),
          n("n8", "object_storage", "Doc store"), n("n9", "queue", "Doc change events", "CDC from wiki/drive"),
          n("n10", "worker", "Ingestion", "parse, chunk 500 tokens with overlap, embed, upsert; idempotent by doc version"),
          n("n11", "monitoring", "Evals & tracing", "offline eval set + LLM judge validated on human labels; retrieval recall@k"),
        ],
        edges: [e("e1", "n1", "n2"), e("e2", "n2", "n3"), e("e3", "n3", "n4"), e("e4", "n3", "n5"), e("e5", "n3", "n6"), e("e6", "n3", "n7"),
          e("e7", "n8", "n9", "", "async"), e("e8", "n9", "n10", "", "async"), e("e9", "n10", "n4"), e("e10", "n10", "n5"), e("e11", "n3", "n11", "", "async")],
      },
      weak: {
        nodes: [n("n1", "client", "UI"), n("n2", "load_balancer", "LB"), n("n3", "service", "Bot"), n("n4", "llm", "GPT"), n("n5", "vector_db", "Vector DB")],
        edges: [e("e1", "n1", "n2"), e("e2", "n2", "n3"), e("e3", "n3", "n4"), e("e4", "n3", "n5")],
      },
    },
  },
  "parking-lot": {
    clarify: [
      "Which vehicle and spot types do we support, and should new ones be easy to add?",
      "How many floors, spots and entry gates operate at the same time?",
      "How is the fee calculated, and can pricing rules change?",
    ],
    requirements: {
      strong: {
        functional: "1. Park a vehicle in a suitable spot and issue a ticket\n2. Leave: compute fee and free the spot\n3. Show free spots per floor and type",
        nonFunctional: "Up to 5 floors x 500 spots; 10 entry gates acting concurrently; new vehicle/spot types and pricing rules added without changing existing classes",
        estimates: "",
      },
      weak: { functional: "park cars", nonFunctional: "works well", estimates: "" },
    },
    contract: {
      strong: { entities: "ParkingLot, Floor, ParkingSpot, Vehicle, Ticket, SpotAllocationStrategy, FeePolicy", api: "ParkingLot.park(vehicle): Ticket\nParkingLot.leave(ticket, now): Receipt\nFloor.freeSpots(type): int" },
      weak: { entities: "ParkingLot, Car", api: "park()\nunpark()" },
    },
    design: {
      strong: {
        nodes: [
          n("n1", "class", "ParkingLot", "- floors: List<Floor>\n- allocator: SpotAllocationStrategy\n- feePolicy: FeePolicy\n+ park(v): Ticket\n+ leave(t, now): Receipt"),
          n("n2", "class", "Floor", "- spots: Map<SpotType, Deque<ParkingSpot>>\n- lock per spot type\n+ tryTake(type): Optional<ParkingSpot>\n+ release(spot)"),
          n("n3", "class", "ParkingSpot", "- id, type: SpotType\n- occupiedBy: Vehicle?"),
          n("n4", "enum", "SpotType", "COMPACT, REGULAR, LARGE, EV"),
          n("n5", "class", "Vehicle", "- plate\n- type: VehicleType\n+ fitsIn(): Set<SpotType>"),
          n("n6", "interface", "SpotAllocationStrategy", "+ choose(floors, vehicle): Optional<ParkingSpot>"),
          n("n7", "class", "NearestFirstStrategy", "implements SpotAllocationStrategy"),
          n("n8", "interface", "FeePolicy", "+ fee(ticket, now): Money"),
          n("n9", "class", "HourlyFeePolicy", "rates per SpotType; Money in cents"),
          n("n10", "class", "Ticket", "- id, spot, issuedAt (immutable)"),
        ],
        edges: [e("e1", "n1", "n2", "has many"), e("e2", "n2", "n3", "has many"), e("e3", "n3", "n4", "uses"), e("e4", "n1", "n6", "uses"),
          e("e5", "n7", "n6", "implements"), e("e6", "n1", "n8", "uses"), e("e7", "n9", "n8", "implements"), e("e8", "n10", "n3", "refers to"), e("e9", "n5", "n4", "fits")],
      },
      weak: {
        nodes: [n("n1", "class", "ParkingLot", "park(), unpark()"), n("n2", "class", "Car"), n("n3", "class", "Spot")],
        edges: [e("e1", "n1", "n3", "has"), e("e2", "n3", "n2", "has")],
      },
    },
  },
};

const PERSONA_PROMPT: Record<Persona, string> = {
  strong:
    "You are a strong senior engineer in a system design interview. You have studied 'Designing Data-Intensive Applications' and 'AI Engineering' in depth. Answer each question for THIS design: explain the mechanism, a concrete failure scenario and the trade-off you accept, with numbers where useful. 60-130 words per answer. Commit to a decision.",
  weak:
    "You are a junior candidate in a system design interview who knows buzzwords but not how things work. Answer every question in one or two short sentences of generic buzzwords (e.g. 'we use caching and replicas so it scales', 'we add a queue'). Never explain mechanisms, failure cases or trade-offs.",
};

const AnswersSchema = z.object({ answers: z.array(z.object({ threadId: z.string(), text: z.string().min(1) })) });
/** The app's answer box accepts 2000 characters. */
const MAX_ANSWER_CHARS = 2000;
const STRONG_MODEL = process.env.SIM_STRONG_MODEL ?? "sonnet";
const STRONG_EFFORT = z.enum(["low", "medium", "high"]).parse(process.env.SIM_STRONG_EFFORT ?? "low");
const MAX_ANSWER_ROUNDS = 3;
const MAX_QUESTIONS_PER_TURN = 6;
const MINUTES_PER_ROUND = 8;

async function candidateAnswers(
  cli: LlmProvider,
  persona: Persona,
  context: { statement: string; design: Design; questions: { id: string; text: string; followup?: string }[] },
) {
  const prompt = `Problem: ${context.statement}

Your design:
${compactDesign(context.design)}

Interviewer questions to answer (answer every one, using its id):
${context.questions.map((q) => `[${q.id}] ${q.text}${q.followup ? `\n  Follow-up: ${q.followup}` : ""}`).join("\n")}

Return JSON {"answers":[{"threadId","text"}]}.`;
  const res = await cli.complete({
    task: "review_round",
    model: persona === "strong" ? STRONG_MODEL : "haiku",
    effort: persona === "strong" ? STRONG_EFFORT : "low",
    maxTokens: 6000,
    system: PERSONA_PROMPT[persona],
    prompt,
    jsonSchema: toLlmJsonSchema(AnswersSchema),
    context: { problemId: "", design: context.design, threads: [] },
    signal: AbortSignal.timeout(180_000),
  });
  const answers = AnswersSchema.parse(extractJson(res.text)).answers.map((a) => ({ ...a, text: a.text.slice(0, MAX_ANSWER_CHARS) }));
  return { answers, usage: res.usage };
}

async function runOne(problemId: string, persona: Persona) {
  const problem = findProblem(problemId);
  const script = SCRIPTS[problemId];
  if (!problem || !script) throw new Error(`No script for ${problemId}`);

  let clock = Date.now();
  const cli = createClaudeCliProvider();
  const llm = createLlmClient({
    provider: cli, providerName: "claude-cli", dryRun: false, models: loadModelsConfig(),
    budget: new Budget({ perSession: 0, perDay: 0 }, join(tmpdir(), "interview-sim-sim.json")),
  });
  const service = createInterviewService({ store: createMemorySessionStore(), llm, now: () => clock });
  const design = script.design[persona];
  let req = 0;
  const rid = () => `sim-${problemId}-${persona}-${++req}`;
  const transcript: string[] = [];
  let candidateCalls = 0;

  const s = service.start(problemId, 60);
  if (persona === "strong") {
    for (const question of script.clarify) {
      const after = await service.clarify(s.id, question, rid());
      transcript.push(`CLARIFY: ${question}\n  -> ${after.clarifications.at(-1)?.answer}`);
    }
  }
  service.lockRequirements(s.id, script.requirements[persona]);
  service.lockContract(s.id, script.contract[persona]);

  clock += MINUTES_PER_ROUND * 60_000;
  let session: Session = await service.submitRound(s.id, { design, answers: [], requestId: rid() });
  transcript.push(`round 1: ${session.rounds.at(-1)?.note}`);

  for (let round = 0; round < MAX_ANSWER_ROUNDS; round++) {
    const open = session.threads.filter((t) => t.status === "open" || t.status === "followup").slice(0, MAX_QUESTIONS_PER_TURN);
    if (!open.length) break;
    const { answers } = await candidateAnswers(cli, persona, {
      statement: problem.statement,
      design,
      questions: open.map((t) => ({ id: t.id, text: t.text, followup: t.followups.at(-1) })),
    });
    candidateCalls++;
    for (const a of answers) {
      const q = open.find((t) => t.id === a.threadId);
      if (q) transcript.push(`Q[${q.id}${q.concept ? ` ${q.concept}` : ""}] ${q.text}\nA: ${a.text}`);
    }
    clock += MINUTES_PER_ROUND * 60_000;
    session = await service.submitRound(s.id, {
      design,
      answers: answers.filter((a) => open.some((t) => t.id === a.threadId)),
      requestId: rid(),
    });
    transcript.push(`round ${round + 2}: ${session.rounds.at(-1)?.note}`);
  }

  session = await service.finish(s.id, design, rid());
  return { problemId, persona, session, transcript, candidateCalls };
}

// ---------- main ----------
const args = process.argv.slice(2);
const problems = Object.keys(SCRIPTS).filter((id) => !args.some((a) => a in SCRIPTS) || args.includes(id));
const personas = (["strong", "weak"] as const).filter((p) => !args.includes("strong") && !args.includes("weak") || args.includes(p));
const results = [];

for (const problemId of problems) {
  for (const persona of personas) {
    const started = Date.now();
    process.stdout.write(`\n▶ ${problemId} / ${persona} … `);
    try {
      const r = await runOne(problemId, persona);
      const sec = Math.round((Date.now() - started) / 1000);
      const o = r.session.outcome;
      console.log(`${o?.passed ? "PASSED" : "NOT PASSED"} (${sec}s, ${r.session.usage.calls} interviewer + ${r.candidateCalls} candidate calls)`);
      console.log(`  verdict: ${r.session.assessment?.verdict}  scores: ${r.session.assessment?.scores.map((x) => `${x.dimension}=${x.score}`).join(" ")}`);
      for (const k of r.session.knowledge) {
        console.log(`  ${k.level.padEnd(8)} ${CONCEPTS[k.concept as ConceptId].title}${k.evidence ? ` — ${k.evidence.slice(0, 110)}` : ""}`);
      }
      if (!o?.passed) console.log(`  reasons: ${o?.reasons.length ?? 0}`);
      results.push({ problemId, persona, passed: o?.passed ?? false, session: r.session, transcript: r.transcript });
    } catch (error) {
      console.log(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
      results.push({ problemId, persona, passed: false, error: String(error) });
    }
  }
}

const reportPath = process.env.SIM_REPORT ?? join(tmpdir(), `interview-sim-report-${Date.now()}.json`);
writeFileSync(reportPath, JSON.stringify(results, null, 2));
console.log(`\nFull transcripts: ${reportPath}`);
const ok = results.every((r) => r.passed === (r.persona === "strong"));
console.log(ok ? "Bar behaves as intended: strong passed, weak failed." : "Bar did NOT behave as intended for at least one run.");
