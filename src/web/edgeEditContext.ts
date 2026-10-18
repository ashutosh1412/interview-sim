import { createContext, useContext } from "react";
import type { DirectionChoice, EdgeData } from "./graph.ts";

/** Lets an edge on the canvas edit itself in place (double-click), without prop drilling. */
export interface EdgeEditApi {
  editingEdgeId: string | null;
  close: () => void;
  nameOf: (nodeId: string) => string;
  update: (id: string, patch: Partial<EdgeData>) => void;
  setDirection: (id: string, choice: DirectionChoice) => void;
  remove: (id: string) => void;
}

export const EdgeEditContext = createContext<EdgeEditApi | null>(null);

export const useEdgeEdit = () => useContext(EdgeEditContext);
