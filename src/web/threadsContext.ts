import { createContext, useContext } from "react";
import type { Thread } from "../shared/schemas.ts";

export interface NumberedThread {
  num: number;
  thread: Thread;
}

export interface ThreadsContextValue {
  /** Unresolved threads keyed by "node:n1" / "edge:e2". */
  byTarget: Map<string, NumberedThread[]>;
  selectedThreadId: string | null;
  selectThread: (id: string) => void;
}

export const ThreadsContext = createContext<ThreadsContextValue>({
  byTarget: new Map(),
  selectedThreadId: null,
  selectThread: () => undefined,
});

export const useThreads = () => useContext(ThreadsContext);
