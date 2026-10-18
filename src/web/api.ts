import {
  ApiErrorSchema,
  type Contract,
  type Design,
  type Requirements,
  type PublicProblem,
  type Session,
  type Status,
  type SubmitRoundRequest,
} from "../shared/schemas.ts";

export class ApiRequestError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
    this.retryable = retryable;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiRequestError("network", "Can't reach the server. Is `npm run dev` running?", true);
  }
  const body: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const parsed = ApiErrorSchema.safeParse(body);
    if (parsed.success) {
      const { code, message, retryable } = parsed.data.error;
      throw new ApiRequestError(code, message, retryable);
    }
    throw new ApiRequestError("http", `Server returned ${res.status}`, res.status >= 500);
  }
  // Responses come from our own server, which builds them from the same schemas.
  return body as T;
}

const post = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  status: () => request<Status>("/status"),
  problems: () => request<PublicProblem[]>("/problems"),
  startSession: (problemId: string, durationMin: 30 | 45 | 60) =>
    post<Session>("/sessions", { problemId, durationMin }),
  getSession: (id: string) => request<Session>(`/sessions/${encodeURIComponent(id)}`),
  clarify: (id: string, question: string, requestId: string) =>
    post<Session>(`/sessions/${encodeURIComponent(id)}/clarify`, { question, requestId }),
  lockRequirements: (id: string, requirements: Requirements) =>
    post<Session>(`/sessions/${encodeURIComponent(id)}/requirements`, requirements),
  lockContract: (id: string, contract: Contract) =>
    post<Session>(`/sessions/${encodeURIComponent(id)}/contract`, contract),
  submitRound: (id: string, body: SubmitRoundRequest) =>
    post<Session>(`/sessions/${encodeURIComponent(id)}/rounds`, body),
  finish: (id: string, design: Design, requestId: string) =>
    post<Session>(`/sessions/${encodeURIComponent(id)}/finish`, { design, requestId }),
};

export const newRequestId = () => crypto.randomUUID();
