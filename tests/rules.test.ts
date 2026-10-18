import { describe, expect, it } from "vitest";
import { runRules } from "../src/server/interview/rules.ts";
import { clone, urlDesign } from "./helpers.ts";

const keys = (d: Parameters<typeof runRules>[0], r?: Parameters<typeof runRules>[1], c?: Parameters<typeof runRules>[2]) =>
  runRules(d, r, c).map((f) => f.key);
const blocking = (d: Parameters<typeof runRules>[0]) => runRules(d).filter((f) => f.blocking).map((f) => f.key);

describe("runRules: blocking gate", () => {
  it("blocks an empty design with every fundamental gap", () => {
    expect(blocking({ nodes: [], edges: [] })).toEqual(["too-small", "no-client", "no-compute", "no-store"]);
  });

  it("blocks a trivial client -> load balancer sketch", () => {
    const d = {
      nodes: urlDesign.nodes.slice(0, 2),
      edges: urlDesign.edges.slice(0, 1),
    };
    expect(blocking(d)).toEqual(expect.arrayContaining(["too-small", "no-compute", "no-store"]));
  });

  it("lets a complete end-to-end design through", () => {
    expect(blocking(urlDesign)).toEqual([]);
  });

  it("blocks when arrows never reach the data store", () => {
    const d = clone(urlDesign);
    d.edges[2] = { ...d.edges[2]!, from: "n4", to: "n3" }; // db -> service, one-way
    expect(blocking(d)).toEqual(["no-path"]);
  });

  it("treats a two-way connection as travelable both ways", () => {
    const d = clone(urlDesign);
    d.edges[2] = { ...d.edges[2]!, from: "n4", to: "n3", direction: "two_way" };
    expect(blocking(d)).toEqual([]);
  });

  it("requires an entry point in front of services", () => {
    const d = clone(urlDesign);
    d.nodes = d.nodes.filter((n) => n.id !== "n2");
    d.nodes.push({ id: "n5", type: "worker", label: "w", notes: "", parent: "" });
    d.edges = [{ id: "e1", from: "n1", to: "n3", mode: "sync", direction: "one_way", label: "" }, d.edges[2]!];
    expect(blocking(d)).toContain("no-entry-point");
  });
});

describe("runRules: entities and API", () => {
  const api = (text: string) => keys(urlDesign, null, { entities: "User, Url", api: text });

  it("asks for concrete endpoints", () => {
    expect(api("users can shorten links")).toContain("no-endpoints");
    expect(api("POST /v1/urls\nGET /{code}")).not.toContain("no-endpoints");
  });

  it("questions a user id taken from the request body", () => {
    expect(api("POST /v1/urls body: { userId, longUrl }")).toContain("user-id-in-body");
    expect(api("POST /v1/urls body: { longUrl }\nGET /v1/users/{userId}/urls")).not.toContain("user-id-in-body");
  });
});

describe("runRules: containers and text", () => {
  it("does not count containers or text towards the minimum", () => {
    const d = {
      nodes: [
        { id: "n1", type: "client" as const, label: "c", notes: "", parent: "" },
        { id: "g1", type: "group" as const, label: "Order service", notes: "", parent: "" },
        { id: "t1", type: "note" as const, label: "hello", notes: "", parent: "" },
      ],
      edges: [],
    };
    expect(blocking(d)).toContain("too-small");
  });

  it("follows a request into a container and out of its contents", () => {
    // client -> lb -> [group: service, queue] ; service -> db
    const d = clone(urlDesign);
    d.nodes.push({ id: "g1", type: "group", label: "URL service", notes: "", parent: "" });
    d.nodes[2]!.parent = "g1";
    d.nodes.push({ id: "q1", type: "queue", label: "jobs", notes: "", parent: "g1" });
    d.edges[1] = { ...d.edges[1]!, to: "g1" }; // lb -> container
    expect(blocking(d)).toEqual([]);
    expect(keys(d)).not.toContain("orphan:q1"); // inside a connected container
  });

  it("never flags text or containers as unconnected", () => {
    const d = clone(urlDesign);
    d.nodes.push({ id: "t1", type: "text", label: "note", notes: "", parent: "" });
    d.nodes.push({ id: "g9", type: "region", label: "us-east", notes: "", parent: "" });
    expect(keys(d)).not.toContain("orphan:t1");
    expect(keys(d)).not.toContain("orphan:g9");
  });
});

describe("runRules: advisory checks", () => {
  it("flags a single database without redundancy details", () => {
    expect(keys(urlDesign)).toContain("single-db:n4");
  });

  it("accepts a database whose notes mention replication", () => {
    const d = clone(urlDesign);
    d.nodes[3]!.notes = "3 replicas, partitioned by short code";
    expect(keys(d)).not.toContain("single-db:n4");
  });

  it("flags orphan nodes", () => {
    const d = clone(urlDesign);
    d.nodes.push({ id: "n9", type: "cache", label: "Redis", notes: "", parent: "" });
    expect(keys(d)).toContain("orphan:n9");
  });

  it("flags a client talking straight to a database", () => {
    const d = clone(urlDesign);
    d.edges.push({ id: "e9", from: "n1", to: "n4", mode: "sync", direction: "one_way", label: "" });
    expect(keys(d)).toContain("client-to-db:e9");
  });

  it("does not penalise skipped estimates", () => {
    const reqs = { functional: "shorten; redirect", nonFunctional: "p99 < 50 ms", estimates: "" };
    expect(keys(urlDesign, reqs)).toEqual(keys(urlDesign));
  });

  it("flags non-functional requirements without any numbers", () => {
    const vague = { functional: "shorten", nonFunctional: "low latency, highly available", estimates: "" };
    expect(keys(urlDesign, vague)).toContain("vague-nfr");
    expect(keys(urlDesign, { ...vague, nonFunctional: "p99 redirect < 50 ms" })).not.toContain("vague-nfr");
  });

  it("flags a long, unprioritised feature list", () => {
    const many = { functional: "- shorten\n- redirect\n- analytics\n- custom alias\n- expiry\n- QR codes", nonFunctional: "99.9%", estimates: "" };
    expect(keys(urlDesign, many)).toContain("too-many-features");
    expect(keys(urlDesign, { ...many, functional: "shorten; redirect; custom alias" })).not.toContain("too-many-features");
  });
});
