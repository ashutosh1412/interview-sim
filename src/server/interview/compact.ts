// Turns the design graph into short text for the model. Positions, sizes and styles
// never leave the browser, so a 20-node design costs a few hundred tokens.
import { isAnnotation } from "../../shared/components.ts";
import type { Design, DesignEdge, DesignNode } from "../../shared/schemas.ts";

const quote = (s: string) => JSON.stringify(s);

function nodeLine(n: DesignNode): string {
  const inside = n.parent ? ` in ${n.parent}` : "";
  return `${n.id} ${n.type} ${quote(n.label)}${inside}${n.notes ? ` notes=${quote(n.notes)}` : ""}`;
}

function edgeLine(e: DesignEdge): string {
  return `${e.id} ${e.from}${e.direction === "two_way" ? "<->" : "->"}${e.to} ${e.mode}${e.label ? ` ${quote(e.label)}` : ""}`;
}

export function compactDesign(design: Design): string {
  if (design.nodes.length === 0) return "(empty design)";
  const shapes = design.nodes.filter((n) => !isAnnotation(n.type));
  const notes = design.nodes.filter((n) => isAnnotation(n.type) && n.label.trim());
  return [
    "NODES",
    ...(shapes.length ? shapes.map(nodeLine) : ["(none)"]),
    "EDGES",
    ...(design.edges.length ? design.edges.map(edgeLine) : ["(none)"]),
    ...(notes.length ? ["CANDIDATE NOTES ON CANVAS", ...notes.map((n) => `- ${quote(n.label)}${n.parent ? ` (in ${n.parent})` : ""}`)] : []),
  ].join("\n");
}

export interface DesignDiff {
  addedNodes: DesignNode[];
  removedNodes: DesignNode[];
  changedNodes: DesignNode[];
  addedEdges: DesignEdge[];
  removedEdges: DesignEdge[];
  changedEdges: DesignEdge[];
}

function byId<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((i) => [i.id, i]));
}

function sameNode(a: DesignNode, b: DesignNode): boolean {
  return a.type === b.type && a.label === b.label && a.notes === b.notes && a.parent === b.parent;
}

function sameEdge(a: DesignEdge, b: DesignEdge): boolean {
  return a.from === b.from && a.to === b.to && a.mode === b.mode && a.direction === b.direction && a.label === b.label;
}

export function diffDesigns(prev: Design | undefined, next: Design): DesignDiff {
  const before = byId(prev?.nodes ?? []);
  const after = byId(next.nodes);
  const beforeEdges = byId(prev?.edges ?? []);
  const afterEdges = byId(next.edges);

  return {
    addedNodes: next.nodes.filter((n) => !before.has(n.id)),
    removedNodes: (prev?.nodes ?? []).filter((n) => !after.has(n.id)),
    changedNodes: next.nodes.filter((n) => {
      const old = before.get(n.id);
      return old !== undefined && !sameNode(old, n);
    }),
    addedEdges: next.edges.filter((e) => !beforeEdges.has(e.id)),
    removedEdges: (prev?.edges ?? []).filter((e) => !afterEdges.has(e.id)),
    changedEdges: next.edges.filter((e) => {
      const old = beforeEdges.get(e.id);
      return old !== undefined && !sameEdge(old, e);
    }),
  };
}

export function isEmptyDiff(d: DesignDiff): boolean {
  return Object.values(d).every((list: unknown[]) => list.length === 0);
}

export function compactDiff(d: DesignDiff): string {
  if (isEmptyDiff(d)) return "(no design changes)";
  return [
    ...d.addedNodes.map((n) => `+ ${nodeLine(n)}`),
    ...d.removedNodes.map((n) => `- ${nodeLine(n)}`),
    ...d.changedNodes.map((n) => `~ ${nodeLine(n)}`),
    ...d.addedEdges.map((e) => `+ ${edgeLine(e)}`),
    ...d.removedEdges.map((e) => `- ${edgeLine(e)}`),
    ...d.changedEdges.map((e) => `~ ${edgeLine(e)}`),
  ].join("\n");
}
