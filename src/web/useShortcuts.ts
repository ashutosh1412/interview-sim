import { useEffect, useRef } from "react";
import { matchShortcut, type ShortcutAction } from "./keys.ts";

export type ShortcutActions = Record<ShortcutAction, () => void>;

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * draw.io-style shortcuts, ignored while typing in a field. Cmd or Ctrl +
 * Z undo, Shift+Z / Y redo, C copy, V paste, D duplicate, A select all,
 * Shift+F or Shift+↑ bring to front, Shift+B or Shift+↓ send to back. See keys.ts.
 */
export function useShortcuts(enabled: boolean, actions: ShortcutActions): void {
  const latest = useRef(actions);
  latest.current = actions;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const action = matchShortcut(e);
      if (!action) return;
      e.preventDefault();
      latest.current[action]();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
