// Pure editing operations behind the toolbar and keyboard shortcuts: copy/paste,
// align, z-order and undo snapshots. Kept free of React so they are easy to test.
import {
  absolutePosition,
  descendantsOf,
  nodeSize,
  orderParentsFirst,
  type DesignFlowEdge,
  type DesignFlowNode,
} from "./graph.ts";

export interface Clip {
  nodes: DesignFlowNode[];
  edges: DesignFlowEdge[];
  /** Screen positions at copy time, used if a node's container is gone when pasting. */
  absolute: Record<string, { x: number; y: number }>;
}

/** Copies the given nodes, everything inside them, and the connections between them. */
export function copySelection(nodes: DesignFlowNode[], edges: DesignFlowEdge[], ids: string[]): Clip {
  const picked = new Set(ids);
  for (const id of ids) descendantsOf(nodes, id).forEach((d) => picked.add(d));
  const clipNodes = nodes.filter((n) => picked.has(n.id)).map((n) => ({ ...n }));
  const absolute = Object.fromEntries(clipNodes.map((n) => [n.id, absolutePosition(nodes, n.id)]));
  const clipEdges = edges.filter((e) => picked.has(e.source) && picked.has(e.target));
  return { nodes: clipNodes, edges: clipEdges, absolute };
}

function maxIndex(prefix: string, items: { id: string }[]): number {
  return items.reduce((m, { id }) => {
    const n = id.startsWith(prefix) ? Number(id.slice(prefix.length)) : NaN;
    return Number.isInteger(n) ? Math.max(m, n) : m;
  }, 0);
}

/** Inserts a copy with fresh ids, offset so it doesn't sit exactly on the original. The copy is selected. */
export function pasteClip(
  clip: Clip,
  nodes: DesignFlowNode[],
  edges: DesignFlowEdge[],
  offset = 30,
): { nodes: DesignFlowNode[]; edges: DesignFlowEdge[] } {
  let nodeN = maxIndex("n", nodes);
  let edgeN = maxIndex("e", edges);
  const idMap = new Map(clip.nodes.map((n) => [n.id, `n${++nodeN}`]));

  const existing = new Set(nodes.map((n) => n.id));
  const pasted = clip.nodes.map((n) => {
    const shifted = (p: { x: number; y: number }) => ({ x: p.x + offset, y: p.y + offset });
    let parentId: string | undefined;
    let position: { x: number; y: number };
    if (n.parentId && idMap.has(n.parentId)) {
      parentId = idMap.get(n.parentId); // container copied too: same spot inside the new one
      position = n.position;
    } else if (n.parentId && existing.has(n.parentId)) {
      parentId = n.parentId; // like draw.io, a copy stays in the same container
      position = shifted(n.position);
    } else {
      position = shifted(clip.absolute[n.id] ?? n.position);
    }
    return { ...n, id: idMap.get(n.id) as string, parentId, position, selected: true, draggable: true, deletable: true };
  });
  const pastedEdges = clip.edges.map((e) => ({
    ...e,
    id: `e${++edgeN}`,
    source: idMap.get(e.source) as string,
    target: idMap.get(e.target) as string,
    selected: false,
  }));

  return {
    nodes: orderParentsFirst([...nodes.map((n) => ({ ...n, selected: false })), ...pasted]),
    edges: [...edges.map((e) => ({ ...e, selected: false })), ...pastedEdges],
  };
}

export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";

/** Lines up the given nodes on screen (draw.io's Arrange > Align). */
export function alignNodes(nodes: DesignFlowNode[], ids: string[], mode: AlignMode): DesignFlowNode[] {
  if (ids.length < 2) return nodes;
  const boxes = ids.map((id) => {
    const node = nodes.find((n) => n.id === id) as DesignFlowNode;
    return { id, ...absolutePosition(nodes, id), ...nodeSize(node) };
  });
  const left = Math.min(...boxes.map((b) => b.x));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const top = Math.min(...boxes.map((b) => b.y));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));

  const target = new Map(
    boxes.map((b) => {
      const x =
        mode === "left" ? left : mode === "right" ? right - b.width : mode === "center" ? (left + right) / 2 - b.width / 2 : b.x;
      const y =
        mode === "top" ? top : mode === "bottom" ? bottom - b.height : mode === "middle" ? (top + bottom) / 2 - b.height / 2 : b.y;
      return [b.id, { dx: x - b.x, dy: y - b.y }];
    }),
  );
  return nodes.map((n) => {
    const move = target.get(n.id);
    return move ? { ...n, position: { x: n.position.x + move.dx, y: n.position.y + move.dy } } : n;
  });
}

/** Brings nodes in front of, or sends them behind, everything else. */
export function reorder(nodes: DesignFlowNode[], ids: string[], where: "front" | "back"): DesignFlowNode[] {
  const chosen = new Set(ids);
  const others = nodes.filter((n) => !chosen.has(n.id)).map((n) => n.zIndex ?? 0);
  // Never below 0: a negative z-index can slip behind the canvas and become unclickable.
  const z = where === "front" ? Math.max(0, ...others) + 1 : Math.max(0, Math.min(...others, 1) - 1);
  return nodes.map((n) => (chosen.has(n.id) ? { ...n, zIndex: z } : n));
}

/**
 * What undo/redo cares about. Selection, measuring and dragging-in-progress are left
 * out, so clicking around never creates an undo step.
 */
export function historyKey(nodes: DesignFlowNode[], edges: DesignFlowEdge[]): string {
  return JSON.stringify([
    nodes.map((n) => [n.id, n.position, n.parentId, n.width, n.height, n.zIndex, n.draggable, n.data]),
    edges.map((e) => [e.id, e.source, e.target, e.sourceHandle, e.targetHandle, e.data]),
  ]);
}
