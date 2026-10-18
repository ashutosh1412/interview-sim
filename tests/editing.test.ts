import { describe, expect, it } from "vitest";
import { alignNodes, copySelection, historyKey, pasteClip, reorder } from "../src/web/editing.ts";
import { DEFAULT_EDGE_DATA, toDesign, type DesignFlowEdge, type DesignFlowNode } from "../src/web/graph.ts";

const shape = (id: string, x: number, y: number, parentId?: string): DesignFlowNode => ({
  id, type: "design", position: { x, y }, measured: { width: 100, height: 40 }, parentId,
  data: { type: "service", label: id, notes: "" },
});
const box = (id: string, x: number, y: number): DesignFlowNode => ({
  id, type: "container", position: { x, y }, width: 300, height: 200, data: { type: "group", label: id, notes: "" },
});
const link = (id: string, source: string, target: string): DesignFlowEdge => ({
  id, type: "design", source, target, data: { ...DEFAULT_EDGE_DATA },
});

describe("copy and paste", () => {
  const nodes = [box("n1", 100, 100), shape("n2", 10, 40, "n1"), shape("n3", 500, 100)];
  const edges = [link("e1", "n2", "n3"), link("e2", "n3", "n2")];

  it("copies a container with its contents and internal connections only", () => {
    const clip = copySelection(nodes, edges, ["n1"]);
    expect(clip.nodes.map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(clip.edges).toEqual([]); // n3 was not copied
  });

  it("pastes with fresh ids, offset, mapped parents and selection", () => {
    const result = pasteClip(copySelection(nodes, edges, ["n1", "n3"]), nodes, edges);
    const pasted = result.nodes.filter((n) => n.selected);
    expect(pasted.map((n) => n.id).sort()).toEqual(["n4", "n5", "n6"]);
    expect(pasted.findIndex((n) => n.id === "n4")).toBeLessThan(pasted.findIndex((n) => n.id === "n5")); // container first
    expect(pasted.find((n) => n.id === "n5")?.parentId).toBe("n4");
    expect(pasted.find((n) => n.id === "n4")?.position).toEqual({ x: 130, y: 130 });
    expect(pasted.find((n) => n.id === "n5")?.position).toEqual({ x: 10, y: 40 }); // relative to its new container
    const newEdges = result.edges.slice(edges.length);
    expect(newEdges.map((e) => [e.id, e.source, e.target])).toEqual([["e3", "n5", "n6"], ["e4", "n6", "n5"]]);
  });

  it("keeps a duplicated child in its container", () => {
    const result = pasteClip(copySelection(nodes, edges, ["n2"]), nodes, edges);
    expect(result.nodes.find((n) => n.id === "n4")).toMatchObject({ parentId: "n1", position: { x: 40, y: 70 } });
  });

  it("pastes onto the canvas at the old screen spot if the container is gone", () => {
    const clip = copySelection(nodes, edges, ["n2"]);
    const withoutBox = nodes.filter((n) => n.id === "n3");
    const result = pasteClip(clip, withoutBox, []);
    expect(result.nodes.find((n) => n.id === "n4")).toMatchObject({ parentId: undefined, position: { x: 140, y: 170 } });
  });
});

describe("arrange", () => {
  it("aligns left and middle on screen, across containers", () => {
    const nodes = [box("g", 100, 100), shape("a", 10, 10, "g"), shape("b", 300, 400)];
    const left = alignNodes(nodes, ["a", "b"], "left");
    expect(left.find((n) => n.id === "a")?.position.x).toBe(10); // already leftmost at 110
    expect(left.find((n) => n.id === "b")?.position.x).toBe(110);
    const middle = alignNodes(nodes, ["a", "b"], "middle");
    expect(middle.find((n) => n.id === "a")?.position.y).toBe(10 + (400 - 110) / 2);
  });

  it("brings to front and sends to back", () => {
    const nodes = [{ ...shape("a", 0, 0), zIndex: 1 }, { ...shape("b", 0, 0), zIndex: 3 }];
    expect(reorder(nodes, ["a"], "front").find((n) => n.id === "a")?.zIndex).toBe(4);
    expect(reorder(nodes, ["b"], "back").find((n) => n.id === "b")?.zIndex).toBe(0);
  });
});

describe("undo snapshots and formatting", () => {
  it("ignores selection changes", () => {
    const nodes = [shape("a", 0, 0)];
    expect(historyKey(nodes, [])).toBe(historyKey([{ ...nodes[0]!, selected: true }], []));
    expect(historyKey(nodes, [])).not.toBe(historyKey([shape("a", 5, 0)], []));
  });

  it("never sends formatting to the interviewer", () => {
    const styled = { ...shape("a", 0, 0), data: { type: "service" as const, label: "a", notes: "", style: { fill: "#dae8fc", bold: true } } };
    const edge = { ...link("e1", "a", "a"), data: { ...DEFAULT_EDGE_DATA, style: { color: "#b85450", width: 3 } } };
    const design = toDesign([styled], [edge]);
    expect(JSON.stringify(design)).not.toMatch(/dae8fc|b85450|bold|style/);
  });
});
