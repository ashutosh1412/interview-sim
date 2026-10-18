import { createContext, useContext } from "react";

/** Canvas-wide flags that node components need without prop drilling. */
export interface CanvasState {
  readOnly: boolean;
}

export const CanvasContext = createContext<CanvasState>({ readOnly: false });

export const useCanvas = () => useContext(CanvasContext);
