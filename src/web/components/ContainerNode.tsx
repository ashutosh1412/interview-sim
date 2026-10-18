import { NodeResizer, useReactFlow, type NodeProps } from "@xyflow/react";
import { memo, useState } from "react";
import { useCanvas } from "../canvasContext.ts";
import { COMPONENTS } from "../catalog.ts";
import type { DesignFlowNode } from "../graph.ts";
import { shapeCss } from "../styleOptions.ts";
import { Badges } from "./Badges.tsx";
import { ConnectionHandles } from "./DesignNode.tsx";
import { EditableText } from "./EditableText.tsx";

/** A resizable boundary (service, region, AZ, VPC). Drop shapes inside to group them. */
function ContainerNodeView({ id, data, selected }: NodeProps<DesignFlowNode>) {
  const { Icon, label } = COMPONENTS[data.type];
  const { readOnly } = useCanvas();
  const { updateNodeData } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const css = shapeCss(data.style);

  return (
    <div className={`container container--${data.type}${selected ? " is-selected" : ""}`} style={css.box}>
      <NodeResizer isVisible={selected && !readOnly} minWidth={180} minHeight={110} lineClassName="resize-line" handleClassName="resize-handle" />
      <ConnectionHandles />
      <div className="container__header" onDoubleClick={() => !readOnly && setEditing(true)} title={readOnly ? undefined : "Double-click to rename"}>
        <Icon size={14} aria-hidden="true" />
        <span className="container__type">{label}</span>
        <EditableText
          className="container__label"
          style={css.text}
          value={data.label}
          editing={editing}
          maxLength={200}
          placeholder="name"
          onChange={(v) => updateNodeData(id, { label: v })}
          onDone={() => setEditing(false)}
        />
      </div>
      <Badges kind="node" id={id} />
    </div>
  );
}

export const ContainerNode = memo(ContainerNodeView);
