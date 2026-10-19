import { useEffect, useRef } from "react";
import { isApplePlatform } from "../keys.ts";

export interface MenuItem {
  label: string;
  /** Shown on the right, e.g. "⇧⌘F". */
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/** Items grouped into sections separated by a line. */
export type MenuSections = MenuItem[][];

interface Props {
  x: number;
  y: number;
  sections: MenuSections;
  onClose: () => void;
}

/** Formats "mod+shift+f" as ⇧⌘F on Mac and Ctrl+Shift+F elsewhere. */
export function shortcut(keys: string, mac = isApplePlatform): string {
  const parts = keys.split("+");
  const named: Record<string, string> = { UP: "↑", DOWN: "↓" };
  const raw = (parts.pop() ?? "").toUpperCase();
  const key = named[raw] ?? raw;
  if (mac) {
    // macOS order: ⌥ ⇧ ⌘, then the key.
    const order = ["alt", "shift", "mod"] as const;
    const sym = { alt: "⌥", shift: "⇧", mod: "⌘" };
    return order.filter((m) => parts.includes(m)).map((m) => sym[m]).join("") + (key === "BACKSPACE" ? "⌫" : key);
  }
  const word: Record<string, string> = { mod: "Ctrl", shift: "Shift", alt: "Alt" };
  return [...parts.map((p) => word[p] ?? p), key === "BACKSPACE" ? "Del" : key].join("+");
}

/** A right-click menu at the pointer. Closes on a pick, Escape, or any click elsewhere. */
export function ContextMenu({ x, y, sections, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onClose);
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  // Keep the menu on screen near the right and bottom edges.
  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y, window.innerHeight - 40 * sections.flat().length - 20);

  return (
    <div ref={ref} className="context-menu" role="menu" style={{ left, top }} onContextMenu={(e) => e.preventDefault()}>
      {sections.map((items, i) => (
        <div key={i} className="context-menu__section">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`context-menu__item${item.danger ? " is-danger" : ""}`}
              disabled={item.disabled}
              onClick={() => {
                onClose();
                item.onSelect();
              }}
            >
              <span>{item.label}</span>
              {item.shortcut && <span className="context-menu__shortcut">{item.shortcut}</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
