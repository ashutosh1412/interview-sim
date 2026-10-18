import { MarkerType, type Edge, type EdgeMarker, type Node } from "@xyflow/react";
import { isAnnotation, isContainer, type ComponentType } from "../shared/components.ts";
import type { Design } from "../shared/schemas.ts";

export type Direction = "one_way" | "two_way";
export type LineDash = "solid" | "dashed" | "dotted";

/** Visual-only formatting (draw.io's Format panel). Never sent to the interviewer. */
export type ShapeStyle = {
  fill?: string;
  stroke?: string;
  dash?: LineDash;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
};

export type LineStyle = {
  path?: "curved" | "straight" | "elbow";
  dash?: LineDash;
  width?: number;
  color?: string;
};

export type NodeData = { type: ComponentType; label: string; notes: string; style?: ShapeStyle };
export type EdgeData = { mode: "sync" | "async"; direction: Direction; label: string; style?: LineStyle };
/** How a shape renders: a component box, a resizable container, or free text. */
export type FlowKind = "design" | "container" | "annotation";
export type DesignFlowNode = Node<NodeData, FlowKind>;

export function flowKindFor(type: ComponentType): FlowKind {
  if (isContainer(type)) return "container";
  if (isAnnotation(type)) return "annotation";
  return "design";
}

/** Starting size for shapes that are resizable; components size to their content. */
export function defaultSize(type: ComponentType): { width: number; height: number } | undefined {
  if (type === "region") return { width: 640, height: 400 };
  if (type === "vpc" || type === "availability_zone") return { width: 480, height: 300 };
  if (type === "group") return { width: 380, height: 240 };
  if (type === "note") return { width: 200, height: 120 };
  return undefined;
}
export type DesignFlowEdge = Edge<EdgeData, "design">;

export const DEFAULT_EDGE_DATA: EdgeData = { mode: "sync", direction: "one_way", label: "" };

/** Arrowheads follow the direction (one at the target, or one at each end) and the line colour. */
export function edgeMarkers(direction: Direction, color?: string): Pick<DesignFlowEdge, "markerEnd" | "markerStart"> {
  const arrow: EdgeMarker = { type: MarkerType.ArrowClosed, ...(color ? { color } : {}) };
  return direction === "two_way"
    ? { markerEnd: arrow, markerStart: { ...arrow, orient: "auto-start-reverse" } }
    : { markerEnd: arrow, markerStart: undefined };
}

export type DirectionChoice = "forward" | "backward" | "both";
type EdgeEnds = Pick<DesignFlowEdge, "source" | "target">;

/**
 * The two ends in a fixed order (by node id), so direction buttons stay put when
 * the arrow flips. "forward" means a -> b.
 */
export function stableEnds(edge: EdgeEnds): [string, string] {
  return edge.source <= edge.target ? [edge.source, edge.target] : [edge.target, edge.source];
}

export function currentChoice(edge: EdgeEnds & Pick<DesignFlowEdge, "data">): DirectionChoice {
  if (edge.data?.direction === "two_way") return "both";
  return edge.source === stableEnds(edge)[0] ? "forward" : "backward";
}

/** Returns the edge pointing the chosen way, flipping its ends if needed. */
export function withDirection(edge: DesignFlowEdge, choice: DirectionChoice): DesignFlowEdge {
  const [a, b] = stableEnds(edge);
  const direction: Direction = choice === "both" ? "two_way" : "one_way";
  const data = { ...DEFAULT_EDGE_DATA, ...edge.data, direction };
  const flip = choice !== "both" && edge.source !== (choice === "forward" ? a : b);
  const ends = flip
    ? { source: edge.target, target: edge.source, sourceHandle: edge.targetHandle, targetHandle: edge.sourceHandle }
    : {};
  return { ...edge, ...ends, data, ...edgeMarkers(direction, data.style?.color) };
}

/** Strips everything visual: only what the interviewer needs is sent to the server. */
export function toDesign(nodes: DesignFlowNode[], edges: DesignFlowEdge[]): Design {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.data.type,
      label: n.data.label.trim(),
      notes: n.data.notes.trim(),
      parent: n.parentId ?? "",
    })),
    edges: edges.map((e) => ({
      id: e.id,
      from: e.source,
      to: e.target,
      mode: e.data?.mode ?? "sync",
      direction: e.data?.direction ?? "one_way",
      label: (e.data?.label ?? "").trim(),
    })),
  };
}

/** Short ids (n1, e4) keep prompts small; never reused within a design. */
export function nextId(prefix: "n" | "e", items: { id: string }[]): string {
  const max = items.reduce((m, { id }) => {
    const n = id.startsWith(prefix) ? Number(id.slice(prefix.length)) : NaN;
    return Number.isInteger(n) ? Math.max(m, n) : m;
  }, 0);
  return `${prefix}${max + 1}`;
}

export const targetKey = (kind: string, id: string) => `${kind}:${id}`;

// ---------- containers ----------

type Sized = Pick<DesignFlowNode, "id" | "position" | "parentId" | "width" | "height" | "measured" | "data">;

export function nodeSize(n: Sized): { width: number; height: number } {
  const fallback = defaultSize(n.data.type);
  return {
    width: n.measured?.width ?? n.width ?? fallback?.width ?? 0,
    height: n.measured?.height ?? n.height ?? fallback?.height ?? 0,
  };
}

/** Position on the canvas, adding up the positions of every enclosing container. */
export function absolutePosition<T extends Sized>(nodes: T[], id: string): { x: number; y: number } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let x = 0;
  let y = 0;
  let current = byId.get(id);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    x += current.position.x;
    y += current.position.y;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return { x, y };
}

export function descendantsOf<T extends Sized>(nodes: T[], id: string): Set<string> {
  const out = new Set<string>();
  let frontier = [id];
  while (frontier.length) {
    const next = nodes.filter((n) => n.parentId && frontier.includes(n.parentId) && !out.has(n.id)).map((n) => n.id);
    next.forEach((n) => out.add(n));
    frontier = next;
  }
  return out;
}

/** React Flow needs every container listed before the nodes inside it. */
export function orderParentsFirst<T extends Sized>(nodes: T[]): T[] {
  const placed = new Set<string>();
  const out: T[] = [];
  let remaining = nodes;
  while (remaining.length) {
    const ready = remaining.filter((n) => !n.parentId || placed.has(n.parentId) || !nodes.some((p) => p.id === n.parentId));
    if (!ready.length) return [...out, ...remaining.map((n) => ({ ...n, parentId: undefined }))]; // broken cycle: detach
    ready.forEach((n) => placed.add(n.id));
    out.push(...ready);
    remaining = remaining.filter((n) => !placed.has(n.id));
  }
  return out;
}

/**
 * After a node is moved or dropped, put it inside the smallest container under its
 * centre (or take it out of one), keeping it in the same place on screen.
 */
export function reparent<T extends Sized>(nodes: T[], id: string): T[] {
  const node = nodes.find((n) => n.id === id);
  if (!node) return nodes;
  const abs = absolutePosition(nodes, id);
  const size = nodeSize(node);
  const center = { x: abs.x + size.width / 2, y: abs.y + size.height / 2 };
  const excluded = descendantsOf(nodes, id).add(id);

  let best: { id: string; area: number } | undefined;
  for (const c of nodes) {
    if (excluded.has(c.id) || !isContainer(c.data.type)) continue;
    const p = absolutePosition(nodes, c.id);
    const s = nodeSize(c);
    const inside = center.x >= p.x && center.x <= p.x + s.width && center.y >= p.y && center.y <= p.y + s.height;
    const area = s.width * s.height;
    if (inside && (!best || area < best.area)) best = { id: c.id, area };
  }

  const newParent = best?.id;
  if (newParent === node.parentId) return nodes;
  const origin = newParent ? absolutePosition(nodes, newParent) : { x: 0, y: 0 };
  const moved = { ...node, parentId: newParent, position: { x: abs.x - origin.x, y: abs.y - origin.y } };
  return orderParentsFirst(nodes.map((n) => (n.id === id ? moved : n)));
}

/** Deleting a container deletes what is inside it, like draw.io. */
export function withoutNodes<T extends Sized>(nodes: T[], ids: Iterable<string>): T[] {
  const gone = new Set(ids);
  for (const id of [...gone]) descendantsOf(nodes, id).forEach((d) => gone.add(d));
  return nodes.filter((n) => !gone.has(n.id));
}
