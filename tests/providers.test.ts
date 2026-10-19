import { describe, expect, it } from "vitest";
import { buildCliArgs, parseCliOutput } from "../src/server/llm/claudeCliProvider.ts";
import { createMockProvider } from "../src/server/llm/mockProvider.ts";
import type { LlmRequest } from "../src/server/llm/types.ts";
import { AssessmentSchema, ReviewResultSchema, type Thread } from "../src/shared/schemas.ts";
import { urlDesign } from "./helpers.ts";

function request(task: LlmRequest["task"], threads: Thread[] = [], signal = new AbortController().signal): LlmRequest {
  return {
    task, model: "m", effort: "low", maxTokens: 1000, system: "s", prompt: "p", jsonSchema: { type: "object" },
    context: { problemId: "url-shortener", design: urlDesign, threads }, signal,
  };
}

const answered: Thread = {
  id: "t1", source: "llm", round: 1, target: { kind: "node", id: "n2" }, type: "question", severity: "medium",
  text: "q", concept: "", status: "answered", answers: ["too short"], followups: [],
};

describe("mock provider (contract)", () => {
  const mock = createMockProvider("none");

  it("review output satisfies the review schema and targets real nodes", async () => {
    const res = ReviewResultSchema.parse(JSON.parse((await mock.complete(request("review_round"))).text));
    expect(res.annotations.length).toBeGreaterThan(0);
    const ids = new Set(urlDesign.nodes.map((n) => n.id));
    for (const a of res.annotations) if (a.target.kind === "node") expect(ids.has(a.target.id)).toBe(true);
  });

  it("asks a follow-up on a thin answer", async () => {
    const res = ReviewResultSchema.parse(JSON.parse((await mock.complete(request("grade_answers", [answered]))).text));
    expect(res.annotations).toEqual([]);
    expect(res.threadUpdates[0]).toMatchObject({ threadId: "t1", verdict: "followup" });
  });

  it("assessment output satisfies the assessment schema", async () => {
    AssessmentSchema.parse(JSON.parse((await mock.complete(request("final_assessment"))).text));
  });
});

describe("mock provider (failure simulation)", () => {
  it("returns broken JSON", async () => {
    const res = await createMockProvider("bad_json").complete(request("review_round"));
    expect(() => JSON.parse(res.text)).toThrow();
  });

  it.each([
    ["rate_limit", "llm_rate_limited"],
    ["refusal", "llm_refused"],
  ] as const)("%s throws %s", async (failure, code) => {
    await expect(createMockProvider(failure).complete(request("review_round"))).rejects.toMatchObject({ code });
  });

  it("times out when aborted", async () => {
    const controller = new AbortController();
    const pending = createMockProvider("timeout").complete(request("review_round", [], controller.signal));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "llm_timeout" });
  });
});

describe("claude CLI provider", () => {
  it("disables tools, project context and session persistence", () => {
    const args = buildCliArgs(request("review_round"));
    expect(args).toEqual(expect.arrayContaining(["-p", "--tools", "", "--safe-mode", "--no-session-persistence"]));
    expect(args[args.indexOf("--json-schema") + 1]).toBe('{"type":"object"}');
  });

  it("prefers structured_output and sums cached input tokens", () => {
    const out = parseCliOutput(JSON.stringify({
      is_error: false, result: "ignored", structured_output: { a: 1 },
      usage: { input_tokens: 10, cache_read_input_tokens: 90, output_tokens: 7 },
    }));
    expect(out).toEqual({ text: '{"a":1}', usage: { inputTokens: 100, outputTokens: 7 } });
  });

  it("falls back to the result text", () => {
    expect(parseCliOutput(JSON.stringify({ result: '{"b":2}' })).text).toBe('{"b":2}');
  });

  it("maps CLI errors to typed errors", () => {
    expect(() => parseCliOutput(JSON.stringify({ is_error: true, result: "Usage limit reached" }))).toThrow(
      expect.objectContaining({ code: "llm_rate_limited" }),
    );
    expect(() => parseCliOutput("garbage")).toThrow(expect.objectContaining({ code: "llm_bad_output" }));
  });
});
