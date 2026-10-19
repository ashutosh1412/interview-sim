// Free, instant checks for structural problems. Anything caught here never costs a
// model call, and a rule thread resolves itself once the design no longer triggers it.
//
// Blocking findings mean "this is not yet a design an interviewer would engage with":
// while any exist, no model is called and the submit counts as a strike.
import { isClassShape, isComponent, type ComponentType } from "../../shared/components.ts";
import type { AnnotationTarget, Contract, Design, LlmAnnotation, Requirements } from "../../shared/schemas.ts";

export interface RuleFinding extends Omit<LlmAnnotation, "concept"> {
  /** Stable key: the same problem on the same element always maps to the same thread. */
  key: string;
  blocking: boolean;
}

const CLIENTS: ReadonlySet<ComponentType> = new Set(["client", "mobile_client", "user"]);
const COMPUTE: ReadonlySet<ComponentType> = new Set([
  "service", "worker", "serverless", "auth", "notification", "scheduler", "stream_processor", "ml_model", "llm",
]);
const STORES: ReadonlySet<ComponentType> = new Set(["sql_db", "nosql_db", "object_storage", "data_warehouse", "vector_db"]);
const DATABASES: ReadonlySet<ComponentType> = new Set(["sql_db", "nosql_db", "vector_db"]);
const ENTRY: ReadonlySet<ComponentType> = new Set(["load_balancer", "api_gateway"]);
const REDUNDANCY_HINT = /replica|replicat|shard|partition|cluster|multi-?az|standby|failover/i;
export const MIN_COMPONENTS = 4;
export const MIN_CLASSES = 3;

export interface RuleContext {
  /** hld: system design (the default). lld: classes and relationships. */
  kind?: "hld" | "lld";
  requirements?: Requirements | null;
  contract?: Contract | null;
}

const nodeTarget = (id: string): AnnotationTarget => ({ kind: "node", id });
const GLOBAL: AnnotationTarget = { kind: "global", id: "" };

/**
 * Directed adjacency; a two-way edge can be travelled in both directions. A container
 * and the nodes inside it are linked both ways, so a connection drawn to a service
 * boundary counts as reaching what is inside it.
 */
function adjacency(design: Design): Map<string, string[]> {
  const adj = new Map<string, string[]>(design.nodes.map((n) => [n.id, []]));
  for (const e of design.edges) {
    adj.get(e.from)?.push(e.to);
    if (e.direction === "two_way") adj.get(e.to)?.push(e.from);
  }
  for (const n of design.nodes) {
    if (n.parent && adj.has(n.parent)) {
      adj.get(n.parent)?.push(n.id);
      adj.get(n.id)?.push(n.parent);
    }
  }
  return adj;
}

function reachable(adj: Map<string, string[]>, starts: string[]): Set<string> {
  const seen = new Set(starts);
  const stack = [...starts];
  while (stack.length) {
    for (const next of adj.get(stack.pop() as string) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return seen;
}

/** For class design the bar is different: enough classes, and relationships between them. */
function lldBlockingFindings(design: Design): RuleFinding[] {
  const classes = design.nodes.filter((n) => isClassShape(n.type));
  const ids = new Set(classes.map((n) => n.id));
  const out: RuleFinding[] = [];
  const block = (key: string, text: string) =>
    out.push({ key, blocking: true, target: GLOBAL, type: "missing", severity: "high", text });
  if (classes.length < MIN_CLASSES) {
    block("too-few-classes", `Sketch the main classes (at least ${MIN_CLASSES}) with their key fields and methods before we go deeper.`);
  }
  if (classes.length >= 2 && !design.edges.some((e) => ids.has(e.from) && ids.has(e.to))) {
    block("no-relations", "How do these classes relate? Connect them and label each link (has-a, is-a, uses).");
  }
  return out;
}

function blockingFindings(design: Design): RuleFinding[] {
  const components = design.nodes.filter((n) => isComponent(n.type));
  const types = new Set(components.map((n) => n.type));
  const out: RuleFinding[] = [];
  const block = (key: string, text: string) =>
    out.push({ key, blocking: true, target: GLOBAL, type: "missing", severity: "high", text });

  if (components.length < MIN_COMPONENTS) {
    block("too-small", `This isn't a design yet. Sketch the full request path (at least ${MIN_COMPONENTS} components) before we go deeper.`);
  }
  const hasClient = [...types].some((t) => CLIENTS.has(t));
  if (!hasClient) block("no-client", "Who calls this system? Add the client so we can trace a request.");
  if (![...types].some((t) => COMPUTE.has(t))) block("no-compute", "Nothing in this design runs your application logic. Where does the request get processed?");
  if (![...types].some((t) => STORES.has(t))) block("no-store", "Where is the data stored? Nothing here persists anything.");
  if ([...types].some((t) => COMPUTE.has(t)) && hasClient && ![...types].some((t) => ENTRY.has(t))) {
    block("no-entry-point", "How does client traffic reach your services and get spread across instances?");
  }

  const clients = components.filter((n) => CLIENTS.has(n.type)).map((n) => n.id);
  if (clients.length && [...types].some((t) => STORES.has(t))) {
    const seen = reachable(adjacency(design), clients);
    const reachesStore = components.some((n) => STORES.has(n.type) && seen.has(n.id));
    if (!reachesStore) {
      block("no-path", "Walk me through a request: following your arrows, it never gets from the client to where data is stored. Check the connections and their direction.");
    }
  }
  return out;
}

/** Real interviews reward a short, prioritised feature list; long lists hurt. */
export const MAX_FUNCTIONAL = 5;
const NUMBER = /\d/;
const HTTP_ENDPOINT = /\b(GET|POST|PUT|PATCH|DELETE)\s+\/|\b(rpc|grpc|websocket|ws|sse)\b/i;
// A request body (a line with "body" or a "{" that is not a "/{param}" path segment)
// that carries the caller's own user id.
const USER_ID_IN_BODY = /(\bbody\b|(^|[^/])\{)[^\n]*\buser_?id\b/im;

/** Splits a free-text list into items on new lines, bullets and semicolons. */
function listItems(text: string): string[] {
  return text
    .split(/\n|;/)
    .map((t) => t.replace(/^\s*([-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
}

function requirementFindings(requirements: Requirements | null | undefined): RuleFinding[] {
  if (!requirements) return [];
  const out: RuleFinding[] = [];
  const note = (key: string, text: string) =>
    out.push({ key, blocking: false, target: GLOBAL, type: "missing", severity: "medium", text });
  if (!NUMBER.test(requirements.nonFunctional)) {
    note("vague-nfr", "Your non-functional requirements aren't quantified. \"Low latency\" says little; \"p99 redirect < 50 ms\" does. What are the actual targets?");
  }
  if (listItems(requirements.functional).length > MAX_FUNCTIONAL) {
    note("too-many-features", `That's more than ${MAX_FUNCTIONAL} functional requirements. Which 3 are core for this interview, and which are out of scope?`);
  }
  return out;
}

function contractFindings(contract: Contract | null | undefined): RuleFinding[] {
  if (!contract) return [];
  const out: RuleFinding[] = [];
  if (!HTTP_ENDPOINT.test(contract.api)) {
    out.push({
      key: "no-endpoints", blocking: false, target: GLOBAL, type: "missing", severity: "medium",
      text: "Your API doesn't list concrete endpoints. What exactly do clients call, e.g. POST /v1/urls with what body?",
    });
  }
  if (USER_ID_IN_BODY.test(contract.api)) {
    out.push({
      key: "user-id-in-body", blocking: false, target: GLOBAL, type: "question", severity: "medium",
      text: "Your API takes the user id in the request body. Couldn't a caller act as someone else? Where should the current user's identity come from?",
    });
  }
  return out;
}

export function runRules(design: Design, { kind = "hld", requirements, contract }: RuleContext = {}): RuleFinding[] {
  const lld = kind === "lld";
  const findings = [
    ...(lld ? lldBlockingFindings(design) : blockingFindings(design)),
    ...requirementFindings(requirements),
    // HTTP endpoint checks only make sense for system design.
    ...(lld ? [] : contractFindings(contract)),
  ];
  const nodeById = new Map(design.nodes.map((n) => [n.id, n]));
  const connected = new Set(design.edges.flatMap((e) => [e.from, e.to]));
  // A node inside a container that has connections is not stranded.
  for (const n of design.nodes) if (n.parent && connected.has(n.parent)) connected.add(n.id);

  for (const node of design.nodes) {
    if (!isComponent(node.type)) continue; // boxes and text don't need connections
    if (!connected.has(node.id) && design.nodes.length > 1) {
      findings.push({
        key: `orphan:${node.id}`, blocking: false, target: nodeTarget(node.id), type: "issue", severity: "low",
        text: `"${node.label || node.type}" isn't connected to anything. What talks to it, and what does it call?`,
      });
    }
  }

  for (const edge of design.edges) {
    const ends = [nodeById.get(edge.from), nodeById.get(edge.to)];
    const isClient = (n: (typeof ends)[number]) => n !== undefined && CLIENTS.has(n.type);
    const clientEnd = edge.direction === "two_way" ? ends.some(isClient) : isClient(ends[0]);
    const dbEnd = ends.some((n) => n && DATABASES.has(n.type));
    if (clientEnd && dbEnd) {
      findings.push({
        key: `client-to-db:${edge.id}`, blocking: false, target: { kind: "edge", id: edge.id }, type: "issue", severity: "high",
        text: "The client talks to the database directly. How do you enforce auth, validation and connection limits?",
      });
    }
  }

  for (const db of design.nodes.filter((n) => DATABASES.has(n.type))) {
    if (!REDUNDANCY_HINT.test(`${db.label} ${db.notes}`)) {
      findings.push({
        key: `single-db:${db.id}`, blocking: false, target: nodeTarget(db.id), type: "issue", severity: "medium",
        text: `"${db.label || db.type}" looks like a single instance. What happens when it fails? (Add replication or sharding details in its notes.)`,
      });
    }
  }

  return findings;
}
