// Typed application errors. Every failure the UI can see maps to one code,
// so the client can decide between "retry" and "fix your input".

export type ErrorCode =
  | "bad_request"
  | "not_found"
  | "session_finished"
  | "budget_exceeded"
  | "llm_rate_limited"
  | "llm_timeout"
  | "llm_refused"
  | "llm_bad_output"
  | "llm_unavailable";

const RETRYABLE: ReadonlySet<ErrorCode> = new Set([
  "llm_rate_limited",
  "llm_timeout",
  "llm_bad_output",
  "llm_unavailable",
]);

const HTTP_STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  not_found: 404,
  session_finished: 409,
  budget_exceeded: 402,
  llm_rate_limited: 429,
  llm_timeout: 504,
  llm_refused: 422,
  llm_bad_output: 502,
  llm_unavailable: 503,
};

export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AppError";
    this.code = code;
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.code);
  }

  get httpStatus(): number {
    return HTTP_STATUS[this.code];
  }
}
