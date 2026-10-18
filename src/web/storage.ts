// Per-browser autosave of the canvas and answer drafts. Storage can be unavailable
// (private mode, quota), so every access is guarded and failure just means no autosave.
import type { Requirements } from "../shared/schemas.ts";
import type { DesignFlowEdge, DesignFlowNode } from "./graph.ts";

export interface LocalDraft {
  nodes: DesignFlowNode[];
  edges: DesignFlowEdge[];
  answers: Record<string, string>;
  requirements?: Requirements;
}

const key = (sessionId: string) => `interview-sim:draft:${sessionId}`;

export function loadDraft(sessionId: string): LocalDraft | undefined {
  try {
    const raw = localStorage.getItem(key(sessionId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<LocalDraft>;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return undefined;
    return { nodes: parsed.nodes, edges: parsed.edges, answers: parsed.answers ?? {}, requirements: parsed.requirements };
  } catch {
    return undefined;
  }
}

export function saveDraft(sessionId: string, draft: LocalDraft): void {
  try {
    localStorage.setItem(key(sessionId), JSON.stringify(draft));
  } catch {
    // ignore: autosave is best effort
  }
}
