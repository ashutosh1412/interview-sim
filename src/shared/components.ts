// Every shape the canvas offers, with its label and category. Shared by the server
// (rules, prompts) and the browser (palette). Icons live in src/web/catalog.ts.

export const CATEGORIES = [
  "clients",
  "network",
  "compute",
  "data",
  "messaging",
  "analytics",
  "operations",
  "classes",
  "containers",
  "annotations",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  clients: "Clients",
  network: "Edge & network",
  compute: "Compute",
  data: "Data & storage",
  messaging: "Messaging",
  analytics: "Analytics & ML",
  operations: "Ops & other",
  classes: "Classes (LLD)",
  containers: "Containers",
  annotations: "Text",
};

// Declared as a tuple (not derived) so zod can build an enum from it.
export const COMPONENT_TYPES = [
  "client", "mobile_client", "user",
  "dns", "cdn", "waf", "load_balancer", "api_gateway", "rate_limiter",
  "service", "worker", "serverless", "auth", "notification", "scheduler",
  "cache", "sql_db", "nosql_db", "object_storage", "search", "data_warehouse", "vector_db",
  "queue", "stream", "pubsub",
  "stream_processor", "ml_model", "llm",
  "monitoring", "external", "component",
  "class", "interface", "enum",
  "group", "region", "availability_zone", "vpc",
  "text", "note",
] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

export const COMPONENT_META: Record<ComponentType, { label: string; category: Category }> = {
  client: { label: "Web client", category: "clients" },
  mobile_client: { label: "Mobile app", category: "clients" },
  user: { label: "User", category: "clients" },
  dns: { label: "DNS", category: "network" },
  cdn: { label: "CDN", category: "network" },
  waf: { label: "Firewall / WAF", category: "network" },
  load_balancer: { label: "Load balancer", category: "network" },
  api_gateway: { label: "API gateway", category: "network" },
  rate_limiter: { label: "Rate limiter", category: "network" },
  service: { label: "Service", category: "compute" },
  worker: { label: "Worker", category: "compute" },
  serverless: { label: "Function", category: "compute" },
  auth: { label: "Auth service", category: "compute" },
  notification: { label: "Notification service", category: "compute" },
  scheduler: { label: "Scheduler / cron", category: "compute" },
  cache: { label: "Cache", category: "data" },
  sql_db: { label: "SQL DB", category: "data" },
  nosql_db: { label: "NoSQL DB", category: "data" },
  object_storage: { label: "Object storage", category: "data" },
  search: { label: "Search index", category: "data" },
  data_warehouse: { label: "Data warehouse", category: "data" },
  vector_db: { label: "Vector DB", category: "data" },
  queue: { label: "Queue", category: "messaging" },
  stream: { label: "Event stream", category: "messaging" },
  pubsub: { label: "Pub/sub topic", category: "messaging" },
  stream_processor: { label: "Stream processor", category: "analytics" },
  ml_model: { label: "ML model", category: "analytics" },
  llm: { label: "LLM", category: "analytics" },
  monitoring: { label: "Monitoring", category: "operations" },
  external: { label: "External API", category: "operations" },
  component: { label: "Component", category: "operations" },
  class: { label: "Class", category: "classes" },
  interface: { label: "Interface", category: "classes" },
  enum: { label: "Enum", category: "classes" },
  group: { label: "Group / boundary", category: "containers" },
  region: { label: "Region", category: "containers" },
  availability_zone: { label: "Availability zone", category: "containers" },
  vpc: { label: "VPC / network", category: "containers" },
  text: { label: "Text", category: "annotations" },
  note: { label: "Sticky note", category: "annotations" },
};

export const categoryOf = (type: ComponentType): Category => COMPONENT_META[type].category;
export const isContainer = (type: ComponentType) => categoryOf(type) === "containers";
export const isAnnotation = (type: ComponentType) => categoryOf(type) === "annotations";
export const isClassShape = (type: ComponentType) => categoryOf(type) === "classes";
/** Real system components: not boxes around them and not free text. */
export const isComponent = (type: ComponentType) => !isContainer(type) && !isAnnotation(type);
