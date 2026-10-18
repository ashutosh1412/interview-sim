import { NodeResizer, useReactFlow, type NodeProps } from "@xyflow/react";
import { memo, useState } from "react";
import { useCanvas } from "../canvasContext.ts";
import type { DesignFlowNode } from "../graph.ts";
import { shapeCss } from "../styleOptions.ts";
import { EditableText } from "./EditableText.tsx";

/** Free text or a sticky note. The interviewer reads these as your written explanations. */
function AnnotationNodeView({ id, data, selected }: NodeProps<DesignFlowNode>) {
  const { readOnly } = useCanvas();
  const { updateNodeData } = useReactFlow();
  // A brand-new, empty note opens straight into editing.
  const [editing, setEditing] = useState(!readOnly && data.label === "");
  const sticky = data.type === "note";
  const css = shapeCss(data.style);

  return (
    <div
      className={`annotation annotation--${data.type}${selected ? " is-selected" : ""}`}
      style={css.box}
      onDoubleClick={() => !readOnly && setEditing(true)}
      title={readOnly ? undefined : "Double-click to edit"}
    >
      {sticky && <NodeResizer isVisible={selected && !readOnly} minWidth={120} minHeight={60} handleClassName="resize-handle" />}
      <EditableText
        className="annotation__text"
        style={css.text}
        value={data.label}
        editing={editing}
        multiline
        maxLength={500}
        placeholder={sticky ? "Write a note…" : "Text"}
        onChange={(v) => updateNodeData(id, { label: v })}
        onDone={() => setEditing(false)}
      />
    </div>
  );
}

export const AnnotationNode = memo(AnnotationNodeView);
