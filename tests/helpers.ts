import type { Design } from "../src/shared/schemas.ts";

export const urlDesign: Design = {
  nodes: [
    { id: "n1", type: "client", label: "Browser", notes: "", parent: "" },
    { id: "n2", type: "load_balancer", label: "ALB", notes: "", parent: "" },
    { id: "n3", type: "service", label: "URL svc", notes: "", parent: "" },
    { id: "n4", type: "nosql_db", label: "Dynamo", notes: "", parent: "" },
  ],
  edges: [
    { id: "e1", from: "n1", to: "n2", mode: "sync", direction: "one_way", label: "" },
    { id: "e2", from: "n2", to: "n3", mode: "sync", direction: "one_way", label: "" },
    { id: "e3", from: "n3", to: "n4", mode: "sync", direction: "one_way", label: "" },
  ],
};

export const clone = <T>(v: T): T => structuredClone(v);

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Budget } from "../src/server/llm/budget.ts";

export const unlimitedBudget = () =>
  new Budget({ perSession: 0, perDay: 0 }, join(mkdtempSync(join(tmpdir(), "usage-")), "usage.json"));
