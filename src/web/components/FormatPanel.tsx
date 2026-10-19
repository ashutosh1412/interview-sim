import {
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignCenterVertical,
  Bold,
  Copy,
  Italic,
  Lock,
  Unlock,
  type LucideIcon,
} from "lucide-react";
import type { AlignMode } from "../editing.ts";
import type { DesignFlowEdge, DesignFlowNode, LineDash, LineStyle, ShapeStyle } from "../graph.ts";
import { FONT_SIZES, LINE_WIDTHS, SWATCHES } from "../styleOptions.ts";

interface Props {
  nodes: DesignFlowNode[];
  edges: DesignFlowEdge[];
  onNodeStyle: (patch: Partial<ShapeStyle>) => void;
  onEdgeStyle: (patch: Partial<LineStyle>) => void;
  onAlign: (mode: AlignMode) => void;
  onDuplicate: () => void;
  onToggleLock: () => void;
}

/** The value all items share, or undefined when they differ (shown as nothing selected). */
function shared<T>(values: T[]): T | undefined {
  return values.every((v) => v === values[0]) ? values[0] : undefined;
}

function Swatches({ value, kind, onPick }: { value: string | undefined; kind: "fill" | "stroke"; onPick: (c: string | undefined) => void }) {
  return (
    <div className="swatches" role="radiogroup">
      <button
        type="button"
        role="radio"
        aria-checked={value === undefined}
        className={`swatch swatch--default${value === undefined ? " is-on" : ""}`}
        title="Default"
        onClick={() => onPick(undefined)}
      />
      {SWATCHES.map((s) => {
        const color = s[kind];
        return (
          <button
            key={s.name}
            type="button"
            role="radio"
            aria-checked={value === color}
            aria-label={s.name}
            title={s.name}
            className={`swatch${value === color ? " is-on" : ""}`}
            style={{ background: color }}
            onClick={() => onPick(color)}
          />
        );
      })}
    </div>
  );
}

function Segmented<T extends string | number>({ options, value, onPick }: { options: { label: string; value: T }[]; value: T | undefined; onPick: (v: T) => void }) {
  return (
    <div className="mini-toggle">
      {options.map((o) => (
        <button key={String(o.value)} type="button" className={value === o.value ? "is-on" : ""} onClick={() => onPick(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function IconButton({ Icon, label, onClick, active }: { Icon: LucideIcon; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button type="button" className={`tool-btn${active ? " is-on" : ""}`} title={label} aria-label={label} onClick={onClick}>
      <Icon size={15} />
    </button>
  );
}

const DASHES: { label: string; value: LineDash }[] = [
  { label: "Solid", value: "solid" },
  { label: "Dashed", value: "dashed" },
  { label: "Dotted", value: "dotted" },
];

const ALIGN: { mode: AlignMode; Icon: LucideIcon; label: string }[] = [
  { mode: "left", Icon: AlignStartVertical, label: "Align left" },
  { mode: "center", Icon: AlignCenterVertical, label: "Align centre" },
  { mode: "right", Icon: AlignEndVertical, label: "Align right" },
  { mode: "top", Icon: AlignStartHorizontal, label: "Align top" },
  { mode: "middle", Icon: AlignCenterHorizontal, label: "Align middle" },
  { mode: "bottom", Icon: AlignEndHorizontal, label: "Align bottom" },
];

/** Style and arrange controls. Shown inside the selection card's "Style" toggle. */
export function FormatPanel({ nodes, edges, onNodeStyle, onEdgeStyle, onAlign, onDuplicate, onToggleLock }: Props) {
  if (!nodes.length && !edges.length) return null;
  const ns = nodes.map((n) => n.data.style ?? {});
  const es = edges.map((e) => e.data?.style ?? {});
  const locked = nodes.length > 0 && nodes.every((n) => n.draggable === false);

  return (
    <div className="format">

      {nodes.length > 0 && (
        <>
          <div className="format__row">
            <span className="format__label">Fill</span>
            <Swatches kind="fill" value={shared(ns.map((s) => s.fill))} onPick={(fill) => onNodeStyle({ fill })} />
          </div>
          <div className="format__row">
            <span className="format__label">Line</span>
            <Swatches kind="stroke" value={shared(ns.map((s) => s.stroke))} onPick={(stroke) => onNodeStyle({ stroke })} />
          </div>
          <div className="format__row">
            <span className="format__label">Border</span>
            <Segmented options={DASHES} value={shared(ns.map((s) => s.dash ?? "solid"))} onPick={(dash) => onNodeStyle({ dash })} />
          </div>
          <div className="format__row">
            <span className="format__label">Text</span>
            <Segmented
              options={FONT_SIZES.map((f) => ({ label: f.label, value: f.value }))}
              value={shared(ns.map((s) => s.fontSize ?? 14))}
              onPick={(fontSize) => onNodeStyle({ fontSize })}
            />
            <IconButton Icon={Bold} label="Bold" active={ns.every((s) => s.bold)} onClick={() => onNodeStyle({ bold: !ns.every((s) => s.bold) })} />
            <IconButton Icon={Italic} label="Italic" active={ns.every((s) => s.italic)} onClick={() => onNodeStyle({ italic: !ns.every((s) => s.italic) })} />
          </div>
        </>
      )}

      {edges.length > 0 && (
        <>
          <div className="format__row">
            <span className="format__label">Path</span>
            <Segmented
              options={[
                { label: "Curved", value: "curved" },
                { label: "Straight", value: "straight" },
                { label: "Elbow", value: "elbow" },
              ]}
              value={shared(es.map((s) => s.path ?? "curved"))}
              onPick={(path) => onEdgeStyle({ path })}
            />
          </div>
          <div className="format__row">
            <span className="format__label">Line</span>
            <Segmented options={DASHES} value={shared(es.map((s) => s.dash ?? "solid"))} onPick={(dash) => onEdgeStyle({ dash })} />
          </div>
          <div className="format__row">
            <span className="format__label">Width</span>
            <Segmented
              options={LINE_WIDTHS.map((w) => ({ label: `${w}px`, value: w }))}
              value={shared(es.map((s) => s.width ?? 2))}
              onPick={(width) => onEdgeStyle({ width })}
            />
          </div>
          <div className="format__row">
            <span className="format__label">Colour</span>
            <Swatches kind="stroke" value={shared(es.map((s) => s.color))} onPick={(color) => onEdgeStyle({ color })} />
          </div>
        </>
      )}

      {nodes.length > 0 && (
        <div className="format__row">
          <span className="format__label">Arrange</span>
          <IconButton Icon={Copy} label="Duplicate (Cmd/Ctrl+D)" onClick={onDuplicate} />
          <IconButton Icon={locked ? Unlock : Lock} label={locked ? "Unlock" : "Lock position"} active={locked} onClick={onToggleLock} />
        </div>
      )}

      {nodes.length > 1 && (
        <div className="format__row">
          <span className="format__label">Align</span>
          {ALIGN.map((a) => (
            <IconButton key={a.mode} Icon={a.Icon} label={a.label} onClick={() => onAlign(a.mode)} />
          ))}
        </div>
      )}
    </div>
  );
}
