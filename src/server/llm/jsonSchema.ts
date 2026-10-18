import { z } from "zod";

// Length/size keywords are enforced by Zod after the response arrives. Stripping them
// from the schema sent to the model keeps it within what every backend's structured
// output mode accepts, so the same schema works for the CLI and the API.
const STRIPPED_KEYWORDS = new Set([
  "$schema",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "pattern",
  "format",
]);

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (!STRIPPED_KEYWORDS.has(key)) out[key] = strip(child);
  }
  return out;
}

export function toLlmJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return strip(z.toJSONSchema(schema, { io: "output" })) as Record<string, unknown>;
}

/** Accepts bare JSON or JSON wrapped in a markdown fence. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return JSON.parse(fenced?.[1] ?? trimmed);
}
