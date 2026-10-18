import { describe, expect, it } from "vitest";
import { loadModelsConfig } from "../src/server/config.ts";
import { createLlmClient } from "../src/server/llm/client.ts";
import { createMockProvider } from "../src/server/llm/mockProvider.ts";
import type { LlmProvider } from "../src/server/llm/types.ts";
import { createInterviewService, unwrapAnswer } from "../src/server/interview/service.ts";
import { createMemorySessionStore } from "../src/server/interview/sessionStore.ts";
import { clone, unlimitedBudget, urlDesign } from "./helpers.ts";

function setup(opts: { now?: () => number; provider?: LlmProvider } = {}) {
  const inner = opts.provider ?? createMockProvider("none");
  const tasks: string[] = [];
  const provider: LlmProvider = {
    name: "counting",
    complete: (req) => {
      tasks.push(req.task);
      return inner.complete(req);
    },
  };
  const llm = createLlmClient({
    provider, providerName: "mock", dryRun: false, models: loadModelsConfig(),
    budget: unlimitedBudget(),
  });
  const service = createInterviewService({ store: createMemorySessionStore(), llm, now: opts.now });
  return { service, tasks };
}

let n = 0;
const rid = () => `request-${++n}`;
const REQS = { functional: "shorten, redirect", nonFunctional: "low latency", estimates: "4k reads/s" };

/** Starts a session and locks requirements, ready for design submits. */
function ready(service: ReturnType<typeof setup>["service"], durationMin = 45) {
  const s = service.start("url-shortener", durationMin);
  service.lockRequirements(s.id, REQS);
  return s;
}

describe("interview service", () => {
  it("runs rules and a review on the first submit", async () => {
    const { service, tasks } = setup();
    const s = ready(service);
    const after = await service.submitRound(s.id, { design: urlDesign, answers: [], requestId: rid() });
    expect(tasks).toEqual(["review_round"]);
    expect(after.threads.some((t) => t.id === "r-single-db:n4")).toBe(true);
    expect(after.threads.filter((t) => t.source === "llm").length).toBeGreaterThan(0);
    expect(after.rounds).toHaveLength(1);
  });

  it("refuses design submits until requirements are locked", async () => {
    const { service, tasks } = setup();
    const s = service.start("url-shortener", 45);
    await expect(service.submitRound(s.id, { design: urlDesign, answers: [], requestId: rid() })).rejects.toMatchObject({
      code: "bad_request",
    });
    expect(tasks).toEqual([]);
  });

  it("answers clarifying questions with the cheap task and records them", async () => {
    const { service, tasks } = setup();
    const s = service.start("url-shortener", 45);
    const after = await service.clarify(s.id, "How many users per day?", rid());
    expect(tasks).toEqual(["clarify"]);
    expect(after.clarifications[0]?.answer).toMatch(/100M/);
    expect(after.phase).toBe("requirements");
    expect(service.lockRequirements(s.id, REQS).phase).toBe("design");
  });

  it("makes no model call for a non-reviewable design and counts a strike", async () => {
    const { service, tasks } = setup();
    const s = ready(service);
    const tiny = { nodes: urlDesign.nodes.slice(0, 2), edges: urlDesign.edges.slice(0, 1) };
    let after = await service.submitRound(s.id, { design: tiny, answers: [], requestId: rid() });
    after = await service.submitRound(s.id, { design: tiny, answers: [], requestId: rid() });
    after = await service.submitRound(s.id, { design: tiny, answers: [], requestId: rid() });
    expect(tasks).toEqual([]);
    expect(after.strikes).toBe(3);
    expect(after.rounds.at(-1)?.note).toMatch(/would likely end/);
    expect(after.threads.some((t) => t.id === "r-no-store" && t.status === "open")).toBe(true);
  });

  it("uses the cheap grading task when only answers changed, and nothing when nothing changed", async () => {
    const { service, tasks } = setup();
    const s = ready(service);
    const r1 = await service.submitRound(s.id, { design: urlDesign, answers: [], requestId: rid() });
    const t1 = r1.threads.find((t) => t.source === "llm")!;
    const r2 = await service.submitRound(s.id, {
      design: clone(urlDesign), answers: [{ threadId: t1.id, text: "short" }], requestId: rid(),
    });
    expect(r2.threads.find((t) => t.id === t1.id)?.status).toBe("followup");
    await service.submitRound(s.id, { design: clone(urlDesign), answers: [], requestId: rid() });
    expect(tasks).toEqual(["review_round", "grade_answers"]);
  });

  it("auto-resolves a rule thread once the design is fixed", async () => {
    const { service } = setup();
    const s = ready(service);
    await service.submitRound(s.id, { design: urlDesign, answers: [], requestId: rid() });
    const fixed = clone(urlDesign);
    fixed.nodes[3]!.notes = "3 replicas across AZs";
    const after = await service.submitRound(s.id, { design: fixed, answers: [], requestId: rid() });
    expect(after.threads.find((t) => t.id === "r-single-db:n4")?.status).toBe("resolved");
  });

  it("runs a duplicated request only once", async () => {
    const { service, tasks } = setup();
    const s = ready(service);
    const body = { design: urlDesign, answers: [], requestId: rid() };
    const [a, b] = await Promise.all([service.submitRound(s.id, body), service.submitRound(s.id, body)]);
    expect(a).toBe(b);
    expect(tasks).toHaveLength(1);
  });

  it("moves annotations on unknown elements to global", async () => {
    const provider: LlmProvider = {
      name: "fake",
      complete: async () => ({
        text: JSON.stringify({
          annotations: [{ target: { kind: "node", id: "ghost" }, type: "question", severity: "low", text: "Where is it?" }],
          threadUpdates: [],
        }),
        usage: { inputTokens: 1, outputTokens: 1 },
      }),
    };
    const { service } = setup({ provider });
    const s = ready(service);
    const after = await service.submitRound(s.id, { design: urlDesign, answers: [], requestId: rid() });
    expect(after.threads.find((t) => t.source === "llm")?.target).toEqual({ kind: "global", id: "" });
    expect(after.usage).toEqual({ calls: 1, inputTokens: 1, outputTokens: 1 });
  });

  it("does not save anything when the model call fails", async () => {
    const { service } = setup({ provider: createMockProvider("rate_limit") });
    const s = ready(service);
    await expect(service.submitRound(s.id, { design: urlDesign, answers: [], requestId: rid() })).rejects.toMatchObject({
      code: "llm_rate_limited",
    });
    expect(service.get(s.id).rounds).toHaveLength(0);
  });

  it("rejects reviews after time is up but still allows finishing", async () => {
    let clock = Date.parse("2026-01-01T10:00:00Z");
    const { service } = setup({ now: () => clock });
    const s = ready(service, 30);
    clock += 33 * 60_000;
    await expect(service.submitRound(s.id, { design: urlDesign, answers: [], requestId: rid() })).rejects.toMatchObject({
      code: "session_finished",
    });
    const done = await service.finish(s.id, urlDesign, rid());
    expect(done.assessment).not.toBeNull();
    expect(done.finishedAt).not.toBeNull();
  });
});

describe("unwrapAnswer", () => {
  it("unwraps a JSON reply nested in the answer text", () => {
    expect(unwrapAnswer('{"answer": "About 100M per month."}')).toBe("About 100M per month.");
  });

  it("keeps normal text, including text that only looks like JSON", () => {
    expect(unwrapAnswer("  100M per month ")).toBe("100M per month");
    expect(unwrapAnswer("{not json")).toBe("{not json");
  });
});
