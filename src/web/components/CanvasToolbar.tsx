import { getNodesBounds, getViewportForBounds, useReactFlow } from "@xyflow/react";
import { toPng } from "html-to-image";
import { Grid3x3, ImageDown, Map as MapIcon, Redo2, Undo2, type LucideIcon } from "lucide-react";
import { useState } from "react";

interface Props {
  readOnly: boolean;
  canUndo: boolean;
  canRedo: boolean;
  snap: boolean;
  minimap: boolean;
  fileName: string;
  onUndo: () => void;
  onRedo: () => void;
  onToggleSnap: () => void;
  onToggleMinimap: () => void;
}

const EXPORT_WIDTH = 1920;
const EXPORT_HEIGHT = 1200;

function Tool({ Icon, label, onClick, disabled, active }: { Icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button type="button" className={`tool-btn${active ? " is-on" : ""}`} title={label} aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick}>
      <Icon size={16} />
    </button>
  );
}

export function CanvasToolbar(p: Props) {
  const { getNodes } = useReactFlow();
  const [exportError, setExportError] = useState(false);

  async function exportPng() {
    const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
    const nodes = getNodes();
    if (!viewport || !nodes.length) return;
    const bounds = getNodesBounds(nodes);
    const { x, y, zoom } = getViewportForBounds(bounds, EXPORT_WIDTH, EXPORT_HEIGHT, 0.2, 2, 0.1);
    try {
      const dataUrl = await toPng(viewport, {
        backgroundColor: getComputedStyle(document.body).backgroundColor,
        width: EXPORT_WIDTH,
        height: EXPORT_HEIGHT,
        style: { width: `${EXPORT_WIDTH}px`, height: `${EXPORT_HEIGHT}px`, transform: `translate(${x}px, ${y}px) scale(${zoom})` },
      });
      const link = document.createElement("a");
      link.download = `${p.fileName}.png`;
      link.href = dataUrl;
      link.click();
      setExportError(false);
    } catch {
      setExportError(true);
    }
  }

  return (
    <div className="canvas-toolbar" role="toolbar" aria-label="Canvas tools">
      {!p.readOnly && (
        <>
          <Tool Icon={Undo2} label="Undo (Cmd/Ctrl+Z)" onClick={p.onUndo} disabled={!p.canUndo} />
          <Tool Icon={Redo2} label="Redo (Cmd/Ctrl+Shift+Z)" onClick={p.onRedo} disabled={!p.canRedo} />
          <span className="canvas-toolbar__sep" />
          <Tool Icon={Grid3x3} label="Snap to grid" onClick={p.onToggleSnap} active={p.snap} />
        </>
      )}
      <Tool Icon={MapIcon} label="Minimap" onClick={p.onToggleMinimap} active={p.minimap} />
      <Tool Icon={ImageDown} label={exportError ? "Export failed, try again" : "Export as PNG"} onClick={() => void exportPng()} />
    </div>
  );
}
