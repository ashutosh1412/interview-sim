import { useCallback, useEffect, useRef, useState } from "react";
import { historyKey } from "./editing.ts";
import type { DesignFlowEdge, DesignFlowNode } from "./graph.ts";

interface Snapshot {
  nodes: DesignFlowNode[];
  edges: DesignFlowEdge[];
}

const LIMIT = 100;
/** Changes closer together than this (a drag, typing a label) become one undo step. */
const SETTLE_MS = 300;

/** Undo/redo over the canvas. Steps are recorded once the canvas settles after a change. */
export function useHistory(
  nodes: DesignFlowNode[],
  edges: DesignFlowEdge[],
  setNodes: (n: DesignFlowNode[]) => void,
  setEdges: (e: DesignFlowEdge[]) => void,
) {
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const current = useRef<Snapshot>({ nodes, edges });
  const currentKey = useRef(historyKey(nodes, edges));
  const restoring = useRef(false);
  const [counts, setCounts] = useState({ undo: 0, redo: 0 });

  const syncCounts = () => setCounts({ undo: past.current.length, redo: future.current.length });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const key = historyKey(nodes, edges);
      if (key === currentKey.current) return;
      if (restoring.current) {
        restoring.current = false;
      } else {
        past.current.push(current.current);
        if (past.current.length > LIMIT) past.current.shift();
        future.current = [];
      }
      current.current = { nodes, edges };
      currentKey.current = key;
      syncCounts();
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [nodes, edges]);

  const restore = useCallback(
    (from: Snapshot[], to: Snapshot[]) => {
      const snapshot = from.pop();
      if (!snapshot) return;
      to.push(current.current);
      restoring.current = true;
      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
      syncCounts();
    },
    [setNodes, setEdges],
  );

  const undo = useCallback(() => restore(past.current, future.current), [restore]);
  const redo = useCallback(() => restore(future.current, past.current), [restore]);

  return { undo, redo, canUndo: counts.undo > 0, canRedo: counts.redo > 0 };
}
