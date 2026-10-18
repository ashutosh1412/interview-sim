import { useEffect, useRef } from "react";

export interface ShortcutActions {
  undo: () => void;
  redo: () => void;
  copy: () => void;
  paste: () => void;
  duplicate: () => void;
  selectAll: () => void;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** draw.io-style shortcuts (Cmd on Mac, Ctrl elsewhere). Ignored while typing in a field. */
export function useShortcuts(enabled: boolean, actions: ShortcutActions): void {
  const latest = useRef(actions);
  latest.current = actions;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      const a = latest.current;
      const handlers: Record<string, (() => void) | undefined> = {
        z: e.shiftKey ? a.redo : a.undo,
        y: a.redo,
        c: a.copy,
        v: a.paste,
        d: a.duplicate,
        a: a.selectAll,
      };
      const handler = handlers[key];
      if (!handler) return;
      e.preventDefault();
      handler();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
