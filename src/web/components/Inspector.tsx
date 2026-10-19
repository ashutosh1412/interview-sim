import { ArrowDownToLine, ArrowUpToLine } from "lucide-react";
import type { ReactNode } from "react";
import { isAnnotation, isClassShape } from "../../shared/components.ts";
import { COMPONENTS } from "../catalog.ts";
import type { DesignFlowEdge, DesignFlowNode, DirectionChoice, EdgeData, NodeData } from "../graph.ts";
import { shortcut } from "./ContextMenu.tsx";
import { DirectionPicker } from "./DirectionPicker.tsx";

interface Props {
  node: DesignFlowNode | undefined;
  edge: DesignFlowEdge | undefined;
  /** How many items are selected; above 1 the card only offers style and delete. */
  selectedCount: number;
  nameOf: (nodeId: string) => string;
  readOnly: boolean;
  /** Colours, line styles and arranging: hidden behind a "Style" toggle to keep the card short. */
  styleControls: ReactNode;
  onNodeChange: (id: string, patch: Partial<NodeData>) => void;
  onEdgeChange: (id: string, patch: Partial<EdgeData>) => void;
  onEdgeDirection: (id: string, choice: DirectionChoice) => void;
  /** Layering for shapes; omitted for connections. */
  onOrder: (where: "front" | "back") => void;
  onDelete: () => void;
}

function Card({ title, readOnly, styleControls, onOrder, onDelete, children }: {
  title: string;
  readOnly: boolean;
  styleControls: ReactNode;
  onOrder?: (where: "front" | "back") => void;
  onDelete: () => void;
  children?: ReactNode;
}) {
  return (
    <section className="inspector" aria-label={title}>
      <h2 className="panel-title">{title}</h2>
      {children}
      {!readOnly && (
        <>
          <details className="style-toggle">
            <summary>Style</summary>
            {styleControls}
          </details>
          <div className="inspector__actions">
            {onOrder && (
              <>
                <button type="button" className="btn btn--small" title={`Bring to front (${shortcut("mod+shift+f")} or ${shortcut("mod+shift+up")})`} onClick={() => onOrder("front")}>
                  <ArrowUpToLine size={14} aria-hidden="true" /> To front
                </button>
                <button type="button" className="btn btn--small" title={`Send to back (${shortcut("mod+shift+b")} or ${shortcut("mod+shift+down")})`} onClick={() => onOrder("back")}>
                  <ArrowDownToLine size={14} aria-hidden="true" /> To back
                </button>
              </>
            )}
            <button type="button" className="btn btn--ghost btn--small inspector__delete" onClick={onDelete}>
              Delete
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** Edits whatever is selected on the canvas. Nothing selected: nothing shown. */
export function Inspector(p: Props) {
  const { node, edge, readOnly } = p;
  const card = { readOnly, styleControls: p.styleControls, onDelete: p.onDelete };
  const shapeCard = { ...card, onOrder: p.onOrder };

  if (p.selectedCount > 1) return <Card title={`${p.selectedCount} items selected`} {...shapeCard} />;

  if (node && isAnnotation(node.data.type)) {
    return (
      <Card title={COMPONENTS[node.data.type].label} {...shapeCard}>
        <label className="field">
          Text
          <textarea
            rows={4}
            value={node.data.label}
            maxLength={500}
            disabled={readOnly}
            placeholder="The interviewer reads this"
            onChange={(e) => p.onNodeChange(node.id, { label: e.target.value })}
          />
        </label>
      </Card>
    );
  }

  if (node) {
    const isClass = isClassShape(node.data.type);
    return (
      <Card title={COMPONENTS[node.data.type].label} {...shapeCard}>
        <label className="field">
          Name
          <input
            value={node.data.label}
            maxLength={200}
            disabled={readOnly}
            placeholder={isClass ? "e.g. ParkingLot" : "e.g. URL service"}
            onChange={(e) => p.onNodeChange(node.id, { label: e.target.value })}
          />
        </label>
        <label className="field">
          {isClass ? "Fields & methods" : "Notes"}
          <textarea
            rows={isClass ? 5 : 2}
            value={node.data.notes}
            maxLength={500}
            disabled={readOnly}
            className={isClass ? "api-input" : undefined}
            placeholder={isClass ? "- floors: Floor[]\n+ park(vehicle): Ticket" : "e.g. Postgres, 3 read replicas"}
            onChange={(e) => p.onNodeChange(node.id, { notes: e.target.value })}
          />
        </label>
      </Card>
    );
  }

  if (edge) {
    const mode = edge.data?.mode ?? "sync";
    return (
      <Card title="Connection" {...card}>
        <DirectionPicker edge={edge} nameOf={p.nameOf} disabled={readOnly} onChange={(c) => p.onEdgeDirection(edge.id, c)} />
        <label className="field">
          Label
          <input
            value={edge.data?.label ?? ""}
            maxLength={200}
            disabled={readOnly}
            placeholder="e.g. HTTPS, write path"
            onChange={(e) => p.onEdgeChange(edge.id, { label: e.target.value })}
          />
        </label>
        <div className="mini-toggle" role="radiogroup" aria-label="Call type">
          {(["sync", "async"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              className={mode === m ? "is-on" : ""}
              disabled={readOnly}
              onClick={() => p.onEdgeChange(edge.id, { mode: m })}
            >
              {m}
            </button>
          ))}
        </div>
      </Card>
    );
  }

  return null;
}
