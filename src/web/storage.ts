// Per-browser autosave of the canvas and answer drafts. Storage can be unavailable
// (private mode, quota), so every access is guarded and failure just means no autosave.
import type { Contract, Requirements } from "../shared/schemas.ts";
import type { DesignFlowEdge, DesignFlowNode } from "./graph.ts";

export interface LocalDraft {
  nodes: DesignFlowNode[];
  edges: DesignFlowEdge[];
  answers: Record<string, string>;
  requirements?: Requirements;
  contract?: Contract;
}

const key = (sessionId: string) => `interview-sim:draft:${sessionId}`;

export function loadDraft(sessionId: string): LocalDraft | undefined {
  try {
    const raw = localStorage.getItem(key(sessionId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<LocalDraft>;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return undefined;
    // Open with nothing selected: React Flow sets a shape's layer when it first loads it, so a
    // restored selection would start out lifted above its neighbours.
    return {
      nodes: parsed.nodes.map((n) => ({ ...n, selected: false })),
      edges: parsed.edges.map((e) => ({ ...e, selected: false })),
      answers: parsed.answers ?? {},
      requirements: parsed.requirements,
      contract: parsed.contract,
    };
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
