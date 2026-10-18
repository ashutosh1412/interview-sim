import { isAnnotation } from "../../shared/components.ts";
import { COMPONENTS } from "../catalog.ts";
import type { DesignFlowEdge, DesignFlowNode, DirectionChoice, EdgeData, NodeData } from "../graph.ts";
import { DirectionPicker } from "./DirectionPicker.tsx";

interface Props {
  node: DesignFlowNode | undefined;
  edge: DesignFlowEdge | undefined;
  nameOf: (nodeId: string) => string;
  readOnly: boolean;
  onNodeChange: (id: string, patch: Partial<NodeData>) => void;
  onEdgeChange: (id: string, patch: Partial<EdgeData>) => void;
  onEdgeDirection: (id: string, choice: DirectionChoice) => void;
  onDelete: () => void;
}

export function Inspector({ node, edge, nameOf, readOnly, onNodeChange, onEdgeChange, onEdgeDirection, onDelete }: Props) {
  if (node && isAnnotation(node.data.type)) {
    return (
      <section className="inspector" aria-label="Selected text">
        <h2 className="panel-title">
          {COMPONENTS[node.data.type].label} <span className="muted">{node.id}</span>
        </h2>
        <label className="field">
          Text <span className="muted">(the interviewer reads this)</span>
          <textarea
            rows={4}
            value={node.data.label}
            maxLength={500}
            disabled={readOnly}
            placeholder="e.g. Writes go through the queue so spikes don't hit the DB"
            onChange={(e) => onNodeChange(node.id, { label: e.target.value })}
          />
        </label>
        {!readOnly && (
          <button type="button" className="btn btn--ghost" onClick={onDelete}>
            Delete
          </button>
        )}
      </section>
    );
  }

  if (node) {
    return (
      <section className="inspector" aria-label="Selected component">
        <h2 className="panel-title">
          {COMPONENTS[node.data.type].label} <span className="muted">{node.id}</span>
        </h2>
        <label className="field">
          Name
          <input
            value={node.data.label}
            maxLength={200}
            disabled={readOnly}
            placeholder="e.g. URL service"
            onChange={(e) => onNodeChange(node.id, { label: e.target.value })}
          />
        </label>
        <label className="field">
          Notes <span className="muted">(tech, scaling, replication…)</span>
          <textarea
            rows={3}
            value={node.data.notes}
            maxLength={500}
            disabled={readOnly}
            placeholder="e.g. Postgres, 3 read replicas, sharded by user_id"
            onChange={(e) => onNodeChange(node.id, { notes: e.target.value })}
          />
        </label>
        {!readOnly && (
          <button type="button" className="btn btn--ghost" onClick={onDelete}>
            Delete component
          </button>
        )}
      </section>
    );
  }

  if (edge) {
    const mode = edge.data?.mode ?? "sync";
    return (
      <section className="inspector" aria-label="Selected connection">
        <h2 className="panel-title">
          Connection <span className="muted">{edge.id}</span>
        </h2>
        <div className="field">
          Direction
          <DirectionPicker edge={edge} nameOf={nameOf} disabled={readOnly} onChange={(c) => onEdgeDirection(edge.id, c)} />
        </div>
        <label className="field">
          Label
          <input
            value={edge.data?.label ?? ""}
            maxLength={200}
            disabled={readOnly}
            placeholder="e.g. gRPC, write path"
            onChange={(e) => onEdgeChange(edge.id, { label: e.target.value })}
          />
        </label>
        <fieldset className="segmented" disabled={readOnly}>
          <legend>Mode</legend>
          {(["sync", "async"] as const).map((m) => (
            <label key={m} className={mode === m ? "is-on" : ""}>
              <input type="radio" name="mode" checked={mode === m} onChange={() => onEdgeChange(edge.id, { mode: m })} />
              {m}
            </label>
          ))}
        </fieldset>
        {!readOnly && (
          <button type="button" className="btn btn--ghost" onClick={onDelete}>
            Delete connection
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="inspector inspector--empty">
      <p className="hint">Select a component or connection to edit it. Connect components by dragging from any dot on one component to a dot on another. Double-click a connection to label it or change its direction.</p>
    </section>
  );
}
