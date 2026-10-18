import {
  Activity,
  Archive,
  Bell,
  BrainCircuit,
  Box,
  Building2,
  Clock,
  Cloud,
  Cog,
  Database,
  DatabaseZap,
  Earth,
  ExternalLink,
  Gauge,
  Globe,
  KeyRound,
  ListOrdered,
  Monitor,
  Network,
  Radio,
  Search,
  Server,
  Shapes,
  ShieldAlert,
  ShieldCheck,
  Signpost,
  Smartphone,
  SquareDashed,
  SquareFunction,
  StickyNote,
  Type,
  User,
  Warehouse,
  Waves,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { COMPONENT_META, type Category, type ComponentType } from "../shared/components.ts";
import type { ThreadStatus } from "../shared/schemas.ts";

export interface ComponentMeta {
  label: string;
  category: Category;
  Icon: LucideIcon;
  /** CSS custom property holding the accent colour. */
  color: string;
}

const CATEGORY_COLOR: Record<Category, string> = {
  clients: "var(--c-client)",
  network: "var(--c-net)",
  compute: "var(--c-compute)",
  data: "var(--c-data)",
  messaging: "var(--c-async)",
  analytics: "var(--c-edge)",
  operations: "var(--c-client)",
  containers: "var(--c-client)",
  annotations: "var(--c-client)",
};

const ICONS: Record<ComponentType, LucideIcon> = {
  client: Monitor,
  mobile_client: Smartphone,
  user: User,
  dns: Signpost,
  cdn: Globe,
  waf: ShieldAlert,
  load_balancer: Network,
  api_gateway: ShieldCheck,
  rate_limiter: Gauge,
  service: Server,
  worker: Cog,
  serverless: SquareFunction,
  auth: KeyRound,
  notification: Bell,
  scheduler: Clock,
  cache: Zap,
  sql_db: Database,
  nosql_db: DatabaseZap,
  object_storage: Archive,
  search: Search,
  data_warehouse: Warehouse,
  vector_db: Shapes,
  queue: ListOrdered,
  stream: Waves,
  pubsub: Radio,
  stream_processor: Workflow,
  ml_model: BrainCircuit,
  monitoring: Activity,
  external: ExternalLink,
  component: Box,
  group: SquareDashed,
  region: Earth,
  availability_zone: Building2,
  vpc: Cloud,
  text: Type,
  note: StickyNote,
};

export const COMPONENTS = Object.fromEntries(
  (Object.keys(COMPONENT_META) as ComponentType[]).map((type) => {
    const { label, category } = COMPONENT_META[type];
    // Cache keeps its own colour so the hot read path stands out.
    const color = type === "cache" ? "var(--c-cache)" : CATEGORY_COLOR[category];
    return [type, { label, category, Icon: ICONS[type], color }];
  }),
) as Record<ComponentType, ComponentMeta>;

export const STATUS_LABEL: Record<ThreadStatus, string> = {
  open: "Open",
  answered: "Answered",
  followup: "Follow-up",
  resolved: "Resolved",
};
