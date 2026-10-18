import type { CSSProperties } from "react";
import type { ShapeStyle } from "./graph.ts";

// draw.io's default colour palette: light fills with a matching darker line colour.
export const SWATCHES = [
  { name: "Blue", fill: "#dae8fc", stroke: "#6c8ebf" },
  { name: "Green", fill: "#d5e8d4", stroke: "#82b366" },
  { name: "Orange", fill: "#ffe6cc", stroke: "#d79b00" },
  { name: "Yellow", fill: "#fff2cc", stroke: "#d6b656" },
  { name: "Red", fill: "#f8cecc", stroke: "#b85450" },
  { name: "Purple", fill: "#e1d5e7", stroke: "#9673a6" },
  { name: "Grey", fill: "#f5f5f5", stroke: "#666666" },
] as const;

export const FONT_SIZES = [
  { label: "S", value: 12 },
  { label: "M", value: 14 },
  { label: "L", value: 18 },
  { label: "XL", value: 24 },
] as const;

export const LINE_WIDTHS = [1, 2, 3, 4] as const;

/** Text on a light custom fill must stay dark, even in dark mode. */
export const TEXT_ON_FILL = "#1c2330";

/** CSS for a shape's box and its text, from its Format panel settings. */
export function shapeCss(style: ShapeStyle | undefined): { box: CSSProperties; text: CSSProperties } {
  const s = style ?? {};
  return {
    box: {
      ...(s.fill ? { background: s.fill, color: TEXT_ON_FILL } : {}),
      ...(s.stroke ? { borderColor: s.stroke } : {}),
      ...(s.dash && s.dash !== "solid" ? { borderStyle: s.dash } : {}),
    },
    text: {
      ...(s.fontSize ? { fontSize: s.fontSize } : {}),
      ...(s.bold ? { fontWeight: 700 } : {}),
      ...(s.italic ? { fontStyle: "italic" } : {}),
    },
  };
}
