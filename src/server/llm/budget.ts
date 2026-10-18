// Token guards. A call is refused *before* it is sent if its worst case
// (estimated input + max output) would cross the session or daily limit.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { AppError } from "../errors.ts";
import type { LlmUsage } from "./types.ts";

const DailySchema = z.object({ date: z.string(), tokens: z.number().int().min(0) });

const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export interface BudgetLimits {
  /** 0 disables the guard. */
  perSession: number;
  perDay: number;
}

export class Budget {
  private readonly limits: BudgetLimits;
  private readonly file: string;
  private readonly today: () => string;

  constructor(limits: BudgetLimits, file: string, today = () => new Date().toISOString().slice(0, 10)) {
    this.limits = limits;
    this.file = file;
    this.today = today;
  }

  usedToday(): number {
    try {
      const daily = DailySchema.parse(JSON.parse(readFileSync(this.file, "utf8")));
      return daily.date === this.today() ? daily.tokens : 0;
    } catch {
      return 0; // missing or unreadable file means nothing recorded today
    }
  }

  assertAllowed(sessionTokensUsed: number, worstCaseTokens: number): void {
    const { perSession, perDay } = this.limits;
    if (perSession > 0 && sessionTokensUsed + worstCaseTokens > perSession) {
      throw new AppError("budget_exceeded", `Session token budget (${perSession}) would be exceeded`);
    }
    if (perDay > 0 && this.usedToday() + worstCaseTokens > perDay) {
      throw new AppError("budget_exceeded", `Daily token budget (${perDay}) would be exceeded`);
    }
  }

  record(usage: LlmUsage): void {
    const tokens = usage.inputTokens + usage.outputTokens;
    if (tokens === 0) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify({ date: this.today(), tokens: this.usedToday() + tokens }));
    } catch (error) {
      // Never throw away a response that was already paid for because bookkeeping failed.
      console.warn(`[budget] could not record usage: ${String(error)}`);
    }
  }

  get limitsView(): BudgetLimits {
    return { ...this.limits };
  }
}
