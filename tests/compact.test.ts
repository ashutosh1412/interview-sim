import { describe, expect, it } from "vitest";
import { compactDesign, compactDiff, diffDesigns, isEmptyDiff } from "../src/server/interview/compact.ts";
import { clone, urlDesign } from "./helpers.ts";

describe("compactDesign", () => {
  it("renders nodes and edges as short lines", () => {
    const text = compactDesign(urlDesign);
    expect(text).toContain('n2 load_balancer "ALB"');
    expect(text).toContain("e3 n3->n4 sync");
  });

  it("marks two-way connections", () => {
    const d = clone(urlDesign);
    d.edges[0]!.direction = "two_way";
    expect(compactDesign(d)).toContain("e1 n1<->n2 sync");
  });

  it("shows nesting and lists canvas text separately", () => {
    const d = clone(urlDesign);
    d.nodes.push({ id: "g1", type: "group", label: "URL service", notes: "", parent: "" });
    d.nodes[2]!.parent = "g1";
    d.nodes.push({ id: "t1", type: "note", label: "Reads hit the cache first", notes: "", parent: "" });
    const text = compactDesign(d);
    expect(text).toContain('n3 service "URL svc" in g1');
    expect(text).toContain('CANDIDATE NOTES ON CANVAS\n- "Reads hit the cache first"');
    expect(text).not.toContain("t1 note");
  });

  it("handles an empty design", () => {
    expect(compactDesign({ nodes: [], edges: [] })).toBe("(empty design)");
  });

  it("is far smaller than the raw JSON", () => {
    expect(compactDesign(urlDesign).length).toBeLessThan(JSON.stringify(urlDesign).length * 0.6);
  });
});

describe("diffDesigns", () => {
  it("treats everything as added on the first round", () => {
    const d = diffDesigns(undefined, urlDesign);
    expect(d.addedNodes).toHaveLength(4);
    expect(d.addedEdges).toHaveLength(3);
  });

  it("detects added, removed and changed elements", () => {
    const next = clone(urlDesign);
    next.nodes = next.nodes.filter((n) => n.id !== "n4");
    next.edges = next.edges.filter((e) => e.id !== "e3");
    next.nodes.push({ id: "n5", type: "cache", label: "Redis", notes: "", parent: "" });
    next.nodes[1]!.notes = "round robin";
    next.edges[0]!.mode = "async";
    next.edges[1]!.direction = "two_way";

    const d = diffDesigns(urlDesign, next);
    expect(d.addedNodes.map((n) => n.id)).toEqual(["n5"]);
    expect(d.removedNodes.map((n) => n.id)).toEqual(["n4"]);
    expect(d.changedNodes.map((n) => n.id)).toEqual(["n2"]);
    expect(d.removedEdges.map((e) => e.id)).toEqual(["e3"]);
    expect(d.changedEdges.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(compactDiff(d)).toContain('+ n5 cache "Redis"');
  });

  it("reports no changes for an identical design", () => {
    const d = diffDesigns(urlDesign, clone(urlDesign));
    expect(isEmptyDiff(d)).toBe(true);
    expect(compactDiff(d)).toBe("(no design changes)");
  });
});
