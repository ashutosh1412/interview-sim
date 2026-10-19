import { describe, expect, it } from "vitest";
import {
  currentChoice,
  DEFAULT_EDGE_DATA,
  restack,
  reparent,
  toDesign,
  withDirection,
  withoutNodes,
  type DesignFlowEdge,
  type DesignFlowNode,
} from "../src/web/graph.ts";

const edge = (source: string, target: string): DesignFlowEdge => ({
  id: "e1", type: "design", source, target, sourceHandle: "right", targetHandle: "left", data: { ...DEFAULT_EDGE_DATA },
});

describe("connection direction", () => {
  it("reads the current choice relative to a stable order of the ends", () => {
    expect(currentChoice(edge("n1", "n2"))).toBe("forward");
    expect(currentChoice(edge("n2", "n1"))).toBe("backward");
  });

  it("flips the ends and handles for the opposite one-way choice", () => {
    const flipped = withDirection(edge("n1", "n2"), "backward");
    expect([flipped.source, flipped.target]).toEqual(["n2", "n1"]);
    expect([flipped.sourceHandle, flipped.targetHandle]).toEqual(["left", "right"]);
    expect(flipped.markerStart).toBeUndefined();
    expect(currentChoice(flipped)).toBe("backward");
  });

  it("keeps the ends and adds a start arrow for two-way", () => {
    const both = withDirection(edge("n1", "n2"), "both");
    expect([both.source, both.target]).toEqual(["n1", "n2"]);
    expect(both.markerStart).toBeDefined();
    expect(toDesign([], [both]).edges[0]?.direction).toBe("two_way");
  });

  it("is a no-op when the choice already holds", () => {
    const e = edge("n2", "n1");
    expect(withDirection(e, "backward")).toMatchObject({ source: "n2", target: "n1" });
  });
});

const box = (id: string, x: number, y: number, parentId?: string): DesignFlowNode => ({
  id, type: "container", position: { x, y }, width: 400, height: 300, parentId,
  data: { type: "group", label: id, notes: "" },
});
const shape = (id: string, x: number, y: number, parentId?: string): DesignFlowNode => ({
  id, type: "design", position: { x, y }, measured: { width: 100, height: 50 }, parentId,
  data: { type: "queue", label: id, notes: "" },
});

describe("containers", () => {
  it("puts a shape dropped inside a container into it, keeping its screen position", () => {
    const nodes = reparent([box("g1", 100, 100), shape("q1", 200, 200)], "q1");
    const q = nodes.find((n) => n.id === "q1");
    expect(q?.parentId).toBe("g1");
    expect(q?.position).toEqual({ x: 100, y: 100 });
    expect(toDesign(nodes, []).nodes.find((n) => n.id === "q1")?.parent).toBe("g1");
  });

  it("picks the innermost container and takes shapes out when dragged away", () => {
    let nodes = [box("region", 0, 0), { ...box("az", 20, 40, "region"), width: 200, height: 150 }, shape("q1", 50, 70)];
    nodes = reparent(nodes, "q1");
    expect(nodes.find((n) => n.id === "q1")?.parentId).toBe("az");

    nodes = nodes.map((n) => (n.id === "q1" ? { ...n, position: { x: 900, y: 900 } } : n));
    nodes = reparent(nodes, "q1");
    const q = nodes.find((n) => n.id === "q1");
    expect(q?.parentId).toBeUndefined();
    expect(q?.position).toEqual({ x: 920, y: 940 }); // relative 900,900 + az (20,40) + region (0,0)
  });

  it("orders containers before their children and stacks each container with its contents", () => {
    const stacked = restack([shape("q1", 0, 0, "g1"), box("g1", 0, 0), shape("s1", 0, 0), shape("q2", 0, 0, "g1")]);
    expect(stacked.map((n) => n.id)).toEqual(["g1", "q1", "q2", "s1"]);
    expect(stacked.map((n) => n.zIndex)).toEqual([0, 1, 2, 3]); // distinct, children above their container
  });

  it("puts nodes with a missing or cyclic container back on the canvas", () => {
    const stacked = restack([shape("a", 0, 0, "ghost"), { ...box("x", 0, 0), parentId: "y" }, { ...box("y", 0, 0), parentId: "x" }]);
    expect(stacked.find((n) => n.id === "a")?.parentId).toBeUndefined();
    expect(stacked).toHaveLength(3);
    expect(stacked.some((n) => n.parentId === undefined && (n.id === "x" || n.id === "y"))).toBe(true);
  });

  it("deletes everything inside a deleted container", () => {
    const nodes = [box("g1", 0, 0), shape("q1", 10, 10, "g1"), shape("s1", 600, 0)];
    expect(withoutNodes(nodes, ["g1"]).map((n) => n.id)).toEqual(["s1"]);
  });
});
