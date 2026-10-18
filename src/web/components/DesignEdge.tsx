import { BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, getStraightPath, type EdgeProps } from "@xyflow/react";
import { Trash2 } from "lucide-react";
import { memo, useEffect, useRef } from "react";
import { useEdgeEdit, type EdgeEditApi } from "../edgeEditContext.ts";
import { DEFAULT_EDGE_DATA, type DesignFlowEdge, type EdgeData } from "../graph.ts";
import { Badges } from "./Badges.tsx";
import { DirectionPicker } from "./DirectionPicker.tsx";

interface EditorProps {
  id: string;
  source: string;
  target: string;
  data: EdgeData;
  api: EdgeEditApi;
}

/** Inline editor opened by double-clicking a connection (like Gliffy/draw.io). */
function EdgeEditor({ id, source, target, data, api }: EditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  return (
    <div
      className="edge-editor nodrag nopan nowheel"
      role="dialog"
      aria-label="Edit connection"
      onKeyDown={(e) => {
        if (e.key === "Escape" || (e.key === "Enter" && e.target === inputRef.current)) api.close();
        e.stopPropagation(); // keep Backspace in the input from deleting the connection
      }}
    >
      <input
        ref={inputRef}
        value={data.label}
        maxLength={200}
        placeholder="Label, e.g. HTTPS, write path"
        onChange={(e) => api.update(id, { label: e.target.value })}
      />
      <DirectionPicker edge={{ source, target, data }} nameOf={api.nameOf} onChange={(c) => api.setDirection(id, c)} />
      <div className="edge-editor__row">
        <div className="mini-toggle" role="radiogroup" aria-label="Call type">
          {(["sync", "async"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={data.mode === m}
              className={data.mode === m ? "is-on" : ""}
              onClick={() => api.update(id, { mode: m })}
            >
              {m}
            </button>
          ))}
        </div>
        <button type="button" className="icon-btn" title="Delete connection" aria-label="Delete connection" onClick={() => api.remove(id)}>
          <Trash2 size={15} />
        </button>
        <button type="button" className="btn btn--small btn--primary" onClick={api.close}>
          Done
        </button>
      </div>
    </div>
  );
}

function DesignEdgeView(props: EdgeProps<DesignFlowEdge>) {
  const { id, source, target, selected, markerStart, markerEnd } = props;
  const data = { ...DEFAULT_EDGE_DATA, ...props.data };
  const line = data.style ?? {};
  const [path, labelX, labelY] =
    line.path === "straight" ? getStraightPath(props) : line.path === "elbow" ? getSmoothStepPath({ ...props, borderRadius: 6 }) : getBezierPath(props);
  const api = useEdgeEdit();
  const editing = api?.editingEdgeId === id;
  const async = data.mode === "async";
  // Async calls are dashed unless the user picked a line style themselves.
  const dash = line.dash ?? (async ? "dashed" : "solid");
  const width = line.width ?? 2;
  const strokeStyle: React.CSSProperties = {
    ...(line.color ? { stroke: line.color } : {}),
    strokeWidth: width,
    strokeDasharray: dash === "dashed" ? `${width * 4} ${width * 3}` : dash === "dotted" ? `${width} ${width * 2}` : undefined,
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerStart={markerStart}
        markerEnd={markerEnd}
        interactionWidth={24}
        style={strokeStyle}
        className={`dedge${selected || editing ? " is-selected" : ""}`}
      />
      <EdgeLabelRenderer>
        <div
          className="dedge__label nodrag nopan"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          {(data.label || async) && (
            <span className="dedge__text" title="Double-click to edit">
              {data.label}
              {async && <span className="dedge__mode">async</span>}
            </span>
          )}
          <Badges kind="edge" id={id} />
        </div>
        {editing && api && (
          <div
            className="edge-editor__anchor"
            style={{ transform: `translate(-50%, 0) translate(${labelX}px, ${labelY + 18}px)` }}
          >
            <EdgeEditor id={id} source={source} target={target} data={data} api={api} />
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

export const DesignEdge = memo(DesignEdgeView);
