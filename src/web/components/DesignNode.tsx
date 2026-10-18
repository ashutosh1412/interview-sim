import { Handle, NodeResizer, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { memo, useState } from "react";
import { useCanvas } from "../canvasContext.ts";
import { COMPONENTS } from "../catalog.ts";
import type { DesignFlowNode } from "../graph.ts";
import { shapeCss } from "../styleOptions.ts";
import { Badges } from "./Badges.tsx";
import { EditableText } from "./EditableText.tsx";

// The canvas uses loose connection mode, so every side works as a start or end point
// and the arrow direction is set on the connection itself.
const SIDES = [
  { id: "top", position: Position.Top },
  { id: "right", position: Position.Right },
  { id: "bottom", position: Position.Bottom },
  { id: "left", position: Position.Left },
] as const;

export function ConnectionHandles() {
  return (
    <>
      {SIDES.map((s) => (
        <Handle key={s.id} id={s.id} type="source" position={s.position} />
      ))}
    </>
  );
}

function DesignNodeView({ id, data, selected }: NodeProps<DesignFlowNode>) {
  const { Icon, label, color } = COMPONENTS[data.type];
  const { readOnly } = useCanvas();
  const { updateNodeData } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const css = shapeCss(data.style);

  return (
    <div
      className={`dnode${selected ? " is-selected" : ""}`}
      style={{ "--accent": color, ...css.box } as React.CSSProperties}
      onDoubleClick={() => !readOnly && setEditing(true)}
      title={readOnly ? undefined : "Double-click to rename"}
    >
      <NodeResizer isVisible={selected && !readOnly} minWidth={140} minHeight={50} handleClassName="resize-handle" lineClassName="resize-line" />
      <ConnectionHandles />
      <div className="dnode__icon" aria-hidden="true">
        <Icon size={22} strokeWidth={1.8} />
      </div>
      <div className="dnode__body" style={css.text}>
        <div className="dnode__type">{label}</div>
        <EditableText
          className="dnode__label"
          value={data.label}
          editing={editing}
          maxLength={200}
          placeholder="unnamed"
          onChange={(v) => updateNodeData(id, { label: v })}
          onDone={() => setEditing(false)}
        />
        {data.notes && <div className="dnode__notes">{data.notes}</div>}
      </div>
      <Badges kind="node" id={id} />
    </div>
  );
}

export const DesignNode = memo(DesignNodeView);
