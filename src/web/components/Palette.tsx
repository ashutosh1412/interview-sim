import { useState } from "react";
import { CATEGORIES, CATEGORY_LABEL, COMPONENT_TYPES, type ComponentType } from "../../shared/components.ts";
import { COMPONENTS } from "../catalog.ts";

export const DRAG_MIME = "application/x-interview-component";

export function Palette({ onAdd, disabled }: { onAdd: (type: ComponentType) => void; disabled: boolean }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = (type: ComponentType) => !q || COMPONENTS[type].label.toLowerCase().includes(q) || type.includes(q);

  return (
    <aside className="palette" aria-label="Shapes">
      <input
        className="palette__search"
        type="search"
        value={query}
        placeholder="Search shapes"
        aria-label="Search shapes"
        onChange={(e) => setQuery(e.target.value)}
      />
      <p className="hint">Drag onto the canvas, or click to add. Drop shapes into a container to group them.</p>
      {CATEGORIES.map((category) => {
        const types = COMPONENT_TYPES.filter((t) => COMPONENTS[t].category === category && matches(t));
        if (!types.length) return null;
        return (
          <details key={category} className="palette__group" open>
            <summary>{CATEGORY_LABEL[category]}</summary>
            {types.map((type) => {
              const { Icon, label, color } = COMPONENTS[type];
              return (
                <button
                  key={type}
                  type="button"
                  className="palette__item"
                  style={{ "--accent": color } as React.CSSProperties}
                  draggable={!disabled}
                  disabled={disabled}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_MIME, type);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => onAdd(type)}
                >
                  <Icon size={16} strokeWidth={1.8} aria-hidden="true" /> {label}
                </button>
              );
            })}
          </details>
        );
      })}
      {q && !COMPONENT_TYPES.some(matches) && (
        <p className="hint">No match. Use <strong>Component</strong> (Ops & other) for anything custom and name it yourself.</p>
      )}
    </aside>
  );
}
