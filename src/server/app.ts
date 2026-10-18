import { Hono, type Context } from "hono";
import type { z } from "zod";
import {
  ClarifyRequestSchema,
  ContractSchema,
  FinishRequestSchema,
  RequirementsSchema,
  StartSessionRequestSchema,
  SubmitRoundRequestSchema,
  type ApiError,
  type Status,
} from "../shared/schemas.ts";
import { AppError } from "./errors.ts";
import type { LlmClient } from "./llm/client.ts";
import { PROBLEMS, toPublicProblem } from "./interview/problems.ts";
import type { InterviewService } from "./interview/service.ts";

async function parseBody<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new AppError("bad_request", "Request body must be JSON");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("bad_request", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  return parsed.data;
}

export function createApp(deps: { service: InterviewService; llm: LlmClient }): Hono {
  const { service, llm } = deps;
  const app = new Hono().basePath("/api");

  app.onError((err, c) => {
    const appError = err instanceof AppError ? err : undefined;
    if (!appError) console.error(err);
    else if (appError.code.startsWith("llm_")) console.warn(`[llm] ${appError.code}: ${appError.message}`);
    const body: ApiError = {
      error: {
        code: appError?.code ?? "internal",
        message: appError?.message ?? "Something went wrong on the server",
        retryable: appError?.retryable ?? true,
      },
    };
    return c.json(body, (appError?.httpStatus ?? 500) as 400);
  });

  app.get("/status", (c) => {
    const limits = llm.budget.limitsView;
    const status: Status = {
      provider: llm.providerName,
      dryRun: llm.dryRun,
      budget: { perSession: limits.perSession, perDay: limits.perDay, usedToday: llm.budget.usedToday() },
    };
    return c.json(status);
  });

  app.get("/problems", (c) => c.json(PROBLEMS.map(toPublicProblem)));

  app.post("/sessions", async (c) => {
    const req = await parseBody(c, StartSessionRequestSchema);
    return c.json(service.start(req.problemId, req.durationMin), 201);
  });

  app.get("/sessions/:id", (c) => c.json(service.get(c.req.param("id"))));

  app.post("/sessions/:id/clarify", async (c) => {
    const req = await parseBody(c, ClarifyRequestSchema);
    return c.json(await service.clarify(c.req.param("id"), req.question, req.requestId));
  });

  app.post("/sessions/:id/requirements", async (c) => {
    const req = await parseBody(c, RequirementsSchema);
    return c.json(service.lockRequirements(c.req.param("id"), req));
  });

  app.post("/sessions/:id/contract", async (c) => {
    const req = await parseBody(c, ContractSchema);
    return c.json(service.lockContract(c.req.param("id"), req));
  });

  app.post("/sessions/:id/rounds", async (c) => {
    const req = await parseBody(c, SubmitRoundRequestSchema);
    return c.json(await service.submitRound(c.req.param("id"), req));
  });

  app.post("/sessions/:id/finish", async (c) => {
    const req = await parseBody(c, FinishRequestSchema);
    return c.json(await service.finish(c.req.param("id"), req.design, req.requestId));
  });

  return app;
}
