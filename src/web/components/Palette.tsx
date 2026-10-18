import { useState } from "react";
import { CATEGORIES, CATEGORY_LABEL, COMPONENT_TYPES, type ComponentType } from "../../shared/components.ts";
import { COMPONENTS } from "../catalog.ts";

export const DRAG_MIME = "application/x-interview-component";

/** What most designs need. Everything else is one click away under "More shapes". */
const COMMON: Record<"hld" | "lld", ComponentType[]> = {
  hld: [
    "client", "load_balancer", "api_gateway", "service", "worker", "cache",
    "sql_db", "nosql_db", "queue", "object_storage", "cdn", "group", "note",
  ],
  lld: ["class", "interface", "enum", "group", "note", "text"],
};

function ShapeButton({ type, disabled, onAdd }: { type: ComponentType; disabled: boolean; onAdd: (t: ComponentType) => void }) {
  const { Icon, label, color } = COMPONENTS[type];
  return (
    <button
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
}

export function Palette({ kind, onAdd, disabled }: { kind: "hld" | "lld"; onAdd: (type: ComponentType) => void; disabled: boolean }) {
  const common = COMMON[kind];
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const results = COMPONENT_TYPES.filter((t) => COMPONENTS[t].label.toLowerCase().includes(q) || t.includes(q));

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

      {q ? (
        results.length ? (
          results.map((t) => <ShapeButton key={t} type={t} disabled={disabled} onAdd={onAdd} />)
        ) : (
          <p className="hint">No match. Try <strong>Component</strong> and name it yourself.</p>
        )
      ) : (
        <>
          {common.map((t) => (
            <ShapeButton key={t} type={t} disabled={disabled} onAdd={onAdd} />
          ))}
          <details className="palette__more">
            <summary>More shapes</summary>
            {CATEGORIES.map((category) => {
              const types = COMPONENT_TYPES.filter((t) => COMPONENTS[t].category === category && !common.includes(t));
              if (!types.length) return null;
              return (
                <div key={category} className="palette__group">
                  <div className="palette__group-title">{CATEGORY_LABEL[category]}</div>
                  {types.map((t) => (
                    <ShapeButton key={t} type={t} disabled={disabled} onAdd={onAdd} />
                  ))}
                </div>
              );
            })}
          </details>
        </>
      )}
    </aside>
  );
}
