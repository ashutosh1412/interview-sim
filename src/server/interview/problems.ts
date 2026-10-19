import type { ConceptId } from "../../shared/concepts.ts";
import type { ComponentType, PublicProblem } from "../../shared/schemas.ts";

export interface Problem extends PublicProblem {
  /** Hidden from the candidate; given to the interviewer model so grading stays consistent. */
  rubric: {
    scale: string;
    mustHave: ComponentType[];
    /** Knowledge the candidate must demonstrate at "solid" or better to pass. */
    concepts: ConceptId[];
    keyTopics: string[];
    pitfalls: string[];
  };
  /** Problem-specific global questions the mock provider can ask. */
  mockQuestions: string[];
}

// Hand-written rubrics: zero tokens spent generating them. The set covers the problems most
// commonly reported in tier-1 interview loops. Ids of the original four never change, so
// saved sessions keep working.
export const PROBLEMS: readonly Problem[] = [
  // ---------------------------------------------------------------- Web & backend
  {
    id: "url-shortener",
    title: "Design a URL shortener",
    track: "Web & backend",
    kind: "hld",
    difficulty: "Medium",
    statement:
      "Design a service like bit.ly. Users submit a long URL and get a short link; visiting the short link redirects to the original. Clarify scale and features with the interviewer as you go.",
    rubric: {
      scale: "100M new URLs/month, 100:1 read:write, redirects p99 < 50ms, links kept 5 years",
      mustHave: ["load_balancer", "service", "cache", "nosql_db"],
      concepts: ["ddia-reliability", "ddia-partitioning", "ddia-replication", "ddia-derived-data"],
      keyTopics: [
        "unique short-code generation without collisions (counter ranges, base62, hashing trade-offs)",
        "read-heavy caching of redirects and cache invalidation",
        "data model and partitioning key",
        "301 vs 302 and analytics impact",
        "abuse prevention and rate limiting",
      ],
      pitfalls: ["hashing the URL and truncating without a collision strategy", "single database with no replication"],
    },
    mockQuestions: [
      "How do you generate short codes that never collide when many app servers create links at once?",
      "Should redirects return 301 or 302? What does that choice do to your analytics?",
    ],
  },
  {
    id: "rate-limiter",
    title: "Design a distributed rate limiter",
    track: "Web & backend",
    kind: "hld",
    difficulty: "Medium",
    statement:
      "Design a rate limiter used by an API gateway in front of many services. Limits are per user and per API key, configurable per endpoint.",
    rubric: {
      scale: "1M requests/sec across 50 gateway nodes, decision overhead < 2ms",
      mustHave: ["api_gateway", "cache", "service"],
      concepts: ["ddia-transactions", "ddia-distributed-faults", "ddia-replication", "ddia-reliability"],
      keyTopics: [
        "algorithm choice: token bucket vs sliding window log vs sliding window counter",
        "shared counters in a fast store and atomic increments (Lua/INCR with TTL)",
        "fail open vs fail closed when the counter store is down",
        "multi-region consistency vs latency",
        "rule configuration and hot reload",
      ],
      pitfalls: ["per-node in-memory counters presented as globally correct", "read-then-write race on counters"],
    },
    mockQuestions: [
      "Which rate-limiting algorithm are you using, and why not the alternatives?",
      "If the counter store goes down, do you fail open or fail closed?",
    ],
  },
  {
    id: "chat-app",
    title: "Design a chat application (WhatsApp)",
    track: "Web & backend",
    kind: "hld",
    difficulty: "Hard",
    statement:
      "Design a 1:1 and group messaging app like WhatsApp. Support online presence, delivery receipts and message history across devices.",
    rubric: {
      scale: "500M DAU, 40B messages/day, groups up to 500 members",
      mustHave: ["load_balancer", "service", "queue", "nosql_db", "cache"],
      concepts: ["ddia-streams", "ddia-partitioning", "ddia-replication", "ddia-consensus"],
      keyTopics: [
        "persistent connections (WebSocket) and routing a message to the recipient's connection server",
        "message ordering per conversation and delivery guarantees (at-least-once + dedupe)",
        "group fan-out",
        "offline delivery and multi-device sync",
        "presence at scale",
      ],
      pitfalls: ["polling instead of push", "all messages in one relational table"],
    },
    mockQuestions: [
      "How does a message reach a recipient who is connected to a different server than the sender?",
      "How do you guarantee message ordering within a conversation?",
    ],
  },
  {
    id: "news-feed",
    title: "Design a news feed (Facebook/Instagram)",
    track: "Web & backend",
    kind: "hld",
    difficulty: "Hard",
    statement: "Design the home feed for a social network: users follow others and see a ranked feed of their posts.",
    rubric: {
      scale: "300M DAU, average 200 follows, some celebrities with 50M followers, feed load p99 < 200ms",
      mustHave: ["load_balancer", "service", "cache", "queue", "nosql_db", "object_storage"],
      concepts: ["ddia-derived-data", "ddia-partitioning", "ddia-reliability", "ddia-data-models"],
      keyTopics: [
        "fan-out on write vs fan-out on read, and the hybrid for celebrities",
        "precomputed feed cache structure and cursor pagination",
        "media storage and CDN",
        "ranking pipeline",
      ],
      pitfalls: ["pure fan-out on write for celebrity accounts", "querying all followees' posts at read time with no cache"],
    },
    mockQuestions: [
      "A celebrity with 50M followers posts. Walk me through what your system does.",
      "How do you paginate the feed so items are not duplicated or skipped as new posts arrive?",
    ],
  },
  {
    id: "notification-system",
    title: "Design a notification system",
    track: "Web & backend",
    kind: "hld",
    difficulty: "Medium",
    statement:
      "Design a service other teams call to send push, email and SMS notifications, with user preferences and scheduled sends.",
    rubric: {
      scale: "1B notifications/day, bursts of 10x during campaigns, critical alerts delivered in < 5s",
      mustHave: ["api_gateway", "service", "queue", "worker", "nosql_db", "external"],
      concepts: ["ddia-streams", "ddia-distributed-faults", "ddia-derived-data", "ddia-encoding"],
      keyTopics: [
        "queue per channel and priority so marketing bursts don't delay critical alerts",
        "idempotency and dedupe on retries",
        "user preferences, quiet hours and unsubscribe",
        "third-party provider failures, retries with backoff and fallback providers",
        "delivery tracking and analytics",
      ],
      pitfalls: ["sending synchronously inside the caller's request", "no dedupe, so retries spam users"],
    },
    mockQuestions: [
      "A marketing campaign enqueues 200M emails. How do you keep a password-reset email fast?",
      "How do you avoid sending the same notification twice when a worker retries?",
    ],
  },
  {
    id: "ticket-booking",
    title: "Design a ticket booking system (Ticketmaster)",
    track: "Web & backend",
    kind: "hld",
    difficulty: "Hard",
    statement:
      "Design a system to browse events and book specific seats. Popular events sell out in minutes and two users must never get the same seat.",
    rubric: {
      scale: "10M users browsing a hot event, 100k seats, peak 50k booking attempts/sec",
      mustHave: ["load_balancer", "service", "sql_db", "cache", "queue"],
      concepts: ["ddia-transactions", "ddia-consensus", "ddia-distributed-faults", "ddia-replication"],
      keyTopics: [
        "seat reservation with a temporary hold and TTL (distributed lock or DB row state)",
        "strong consistency for bookings vs cached reads for browsing",
        "virtual waiting room / queue for hot events",
        "payment flow and releasing holds on failure",
        "search for events",
      ],
      pitfalls: ["no hold state, so two users pay for the same seat", "eventually consistent store for seat inventory"],
    },
    mockQuestions: [
      "Two users click the same seat at the same moment. What exactly prevents a double booking?",
      "A user holds a seat and then closes the tab. When and how is the seat released?",
    ],
  },
  {
    id: "file-sync",
    title: "Design a file storage and sync service (Dropbox)",
    track: "Web & backend",
    kind: "hld",
    difficulty: "Hard",
    statement: "Design a service where users upload files, sync them across devices and share them with others.",
    rubric: {
      scale: "100M users, files up to 50GB, 1PB+ total storage",
      mustHave: ["load_balancer", "service", "object_storage", "sql_db", "queue"],
      concepts: ["ddia-conflicts", "ddia-storage", "ddia-partitioning", "ddia-derived-data"],
      keyTopics: [
        "chunked, resumable uploads directly to object storage with pre-signed URLs",
        "metadata service vs blob storage separation",
        "sync: change notifications, detecting changed chunks, conflict handling",
        "deduplication by content hash",
        "sharing permissions",
      ],
      pitfalls: ["streaming large files through app servers", "re-uploading the whole file on every change"],
    },
    mockQuestions: [
      "A user edits 1 byte of a 2GB file. What gets uploaded?",
      "How does a second device find out a file changed?",
    ],
  },
  {
    id: "video-streaming",
    title: "Design a video streaming platform (YouTube)",
    track: "Web & backend",
    kind: "hld",
    difficulty: "Hard",
    statement: "Design a platform where creators upload videos and viewers stream them on any device and network.",
    rubric: {
      scale: "500 hours uploaded/minute, 1B views/day, global audience",
      mustHave: ["cdn", "service", "object_storage", "queue", "worker", "nosql_db"],
      concepts: ["ddia-batch", "ddia-reliability", "ddia-partitioning", "ddia-derived-data"],
      keyTopics: [
        "upload pipeline: chunked upload, transcoding into multiple resolutions as async jobs",
        "adaptive bitrate streaming (HLS/DASH segments)",
        "CDN for segments and cache hit ratio",
        "metadata, view counts at scale",
      ],
      pitfalls: ["serving video from app servers", "synchronous transcoding during upload"],
    },
    mockQuestions: [
      "Walk me through what happens between a creator finishing an upload and the video being watchable.",
      "A viewer's bandwidth drops mid-video. What does the player do, and what did you prepare for that?",
    ],
  },
  {
    id: "ride-hailing",
    title: "Design a ride-hailing service (Uber)",
    track: "Web & backend",
    kind: "hld",
    difficulty: "Hard",
    statement: "Design a service that matches riders with nearby drivers in real time and tracks the trip.",
    rubric: {
      scale: "5M active drivers sending location every 4 seconds, 1M ride requests/hour at peak",
      mustHave: ["load_balancer", "service", "cache", "nosql_db", "queue"],
      concepts: ["ddia-partitioning", "ddia-storage", "ddia-transactions", "ddia-streams"],
      keyTopics: [
        "high write rate of driver locations and a geospatial index (geohash, quadtree, H3)",
        "matching: finding nearby available drivers and avoiding double assignment",
        "real-time updates to rider and driver (WebSocket/push)",
        "trip state machine and payments",
      ],
      pitfalls: ["writing every location update to a relational DB", "assigning one driver to two riders"],
    },
    mockQuestions: [
      "How do you find the 10 nearest available drivers quickly?",
      "Two riders request at the same time and the same driver is closest to both. What happens?",
    ],
  },
  {
    id: "typeahead",
    title: "Design search autocomplete (typeahead)",
    track: "Web & backend",
    kind: "hld",
    difficulty: "Medium",
    statement: "Design the suggestions that appear as users type in a search box, ranked by popularity.",
    rubric: {
      scale: "10B queries/day, suggestions in < 100ms, top 10 per prefix",
      mustHave: ["load_balancer", "service", "cache", "stream", "stream_processor"],
      concepts: ["ddia-batch", "ddia-streams", "ddia-partitioning", "ddia-storage"],
      keyTopics: [
        "trie or precomputed top-K per prefix",
        "offline aggregation of query logs and periodic rebuilds vs near-real-time trends",
        "caching hot prefixes at edge/client, debouncing requests",
        "sharding the index by prefix",
      ],
      pitfalls: ["scanning all queries at request time", "updating the trie on every keystroke synchronously"],
    },
    mockQuestions: [
      "How are suggestions for the prefix 'ap' computed and served in under 100ms?",
      "A new term starts trending. How long until it shows up in suggestions, and why?",
    ],
  },
  {
    id: "web-crawler",
    title: "Design a web crawler",
    track: "Web & backend",
    kind: "hld",
    difficulty: "Medium",
    statement: "Design a crawler that downloads billions of web pages for a search engine and keeps them fresh.",
    rubric: {
      scale: "10B pages, refresh popular pages daily, ~5k pages/sec",
      mustHave: ["queue", "worker", "object_storage", "nosql_db", "cache"],
      concepts: ["ddia-batch", "ddia-distributed-faults", "ddia-partitioning"],
      keyTopics: [
        "URL frontier with priority and per-domain politeness",
        "deduplication of URLs and page content",
        "robots.txt, rate limits per host, traps",
        "fault tolerance and resuming crawls",
      ],
      pitfalls: ["hammering one domain", "no URL dedupe, so the crawl loops forever"],
    },
    mockQuestions: [
      "How do you stop the crawler from overloading a single website?",
      "How do you avoid crawling the same page twice?",
    ],
  },
  {
    id: "ad-click-aggregator",
    title: "Design an ad click aggregator (top-K)",
    track: "Web & backend",
    kind: "hld",
    difficulty: "Hard",
    statement:
      "Design a system that ingests ad click events and lets advertisers query click counts per ad in near real time, including the top ads per minute.",
    rubric: {
      scale: "10k clicks/sec average, 100k peak, queries over the last minute up to 90 days",
      mustHave: ["stream", "stream_processor", "nosql_db", "data_warehouse", "service"],
      concepts: ["ddia-streams", "ddia-batch", "ddia-partitioning", "ddia-derived-data"],
      keyTopics: [
        "stream processing with windowed aggregation and late events",
        "exactly-once or idempotent counting, dedupe of fraudulent double clicks",
        "hot keys (one viral ad) and partitioning",
        "lambda/kappa: reconciling streaming counts with batch",
      ],
      pitfalls: ["incrementing a DB row per click", "no plan for late or duplicate events"],
    },
    mockQuestions: [
      "One ad goes viral and gets 50% of all clicks. What happens to your partitions?",
      "A click event arrives 3 minutes late. Does it count, and in which window?",
    ],
  },
  {
    id: "payment-system",
    title: "Design a payment system",
    track: "Web & backend",
    kind: "hld",
    difficulty: "Hard",
    statement:
      "Design the backend that charges customers for orders through external payment providers and pays out merchants.",
    rubric: {
      scale: "1M transactions/day, money must never be lost or double-charged",
      mustHave: ["api_gateway", "service", "sql_db", "queue", "external"],
      concepts: ["ddia-transactions", "ddia-distributed-faults", "ddia-derived-data", "ddia-consensus"],
      keyTopics: [
        "idempotency keys for every charge request",
        "ledger with double-entry bookkeeping",
        "handling provider timeouts: unknown state, retries, reconciliation",
        "async webhooks and exactly-once effects",
      ],
      pitfalls: ["retrying a charge without an idempotency key", "storing only a balance instead of a ledger"],
    },
    mockQuestions: [
      "The payment provider times out. Did the customer get charged? What does your system do next?",
      "How do you guarantee a retried request never charges twice?",
    ],
  },

  // ---------------------------------------------------------------- AI engineering
  {
    id: "rag-chatbot",
    title: "Design a RAG chatbot over company documents",
    track: "AI engineering",
    kind: "hld",
    difficulty: "Medium",
    statement:
      "Design an assistant that answers employees' questions using internal docs (wikis, PDFs, tickets), with sources, while respecting who can see what.",
    rubric: {
      scale: "50k employees, 10M documents, answers in < 5s, docs change daily",
      mustHave: ["service", "vector_db", "llm", "object_storage", "queue", "worker"],
      concepts: ["aie-rag", "aie-evaluation", "aie-prompting", "aie-foundation-models", "ddia-derived-data"],
      keyTopics: [
        "ingestion: chunking strategy, embeddings, incremental re-indexing",
        "retrieval: hybrid search (vector + keyword), re-ranking",
        "access control applied at retrieval time",
        "grounded answers with citations, handling 'I don't know'",
        "evaluation of answer quality and hallucination rate",
      ],
      pitfalls: ["filtering permissions after generation", "no plan to re-embed changed documents"],
    },
    mockQuestions: [
      "A user asks about a document they don't have access to. Where exactly is that blocked?",
      "How would you know whether answers got better or worse after changing the chunk size?",
    ],
  },
  {
    id: "llm-inference-platform",
    title: "Design an LLM inference platform",
    track: "AI engineering",
    kind: "hld",
    difficulty: "Hard",
    statement:
      "Design an internal platform that serves several LLMs to many product teams through one API, with streaming responses and fair usage.",
    rubric: {
      scale: "20k requests/sec peak, mixed short and long prompts, GPU capacity is the main cost",
      mustHave: ["api_gateway", "load_balancer", "llm", "queue", "cache", "monitoring"],
      concepts: ["aie-inference", "aie-architecture", "aie-foundation-models", "ddia-reliability"],
      keyTopics: [
        "batching (continuous batching) and GPU utilisation",
        "routing by model, prompt length and priority; per-team quotas",
        "streaming tokens to clients",
        "autoscaling GPU pools, cold starts, fallbacks to other models or providers",
        "prompt/response caching and cost tracking",
      ],
      pitfalls: ["one request per GPU with no batching", "no quotas, so one team starves the rest"],
    },
    mockQuestions: [
      "One team sends a burst of 50k-token prompts. How do you protect everyone else's latency?",
      "How do you decide when to add or remove GPU capacity?",
    ],
  },
  {
    id: "recommendation-system",
    title: "Design a recommendation system",
    track: "AI engineering",
    kind: "hld",
    difficulty: "Hard",
    statement: "Design personalised recommendations for a video or e-commerce home page.",
    rubric: {
      scale: "100M users, 10M items, recommendations served in < 100ms",
      mustHave: ["service", "ml_model", "cache", "stream", "data_warehouse", "nosql_db"],
      concepts: ["ml-features-serving", "ml-metrics", "ddia-streams", "ddia-batch"],
      keyTopics: [
        "two-stage design: candidate generation (retrieval/ANN) then ranking",
        "feature store: online vs offline features and skew",
        "training pipeline and freshness of user signals",
        "cold start for new users and items",
        "offline metrics vs online A/B tests",
      ],
      pitfalls: ["scoring every item per request", "training on features that aren't available at serving time"],
    },
    mockQuestions: [
      "How do you pick a few hundred candidates out of 10M items in milliseconds?",
      "A brand-new user signs up. What do they see, and why?",
    ],
  },
  {
    id: "semantic-search",
    title: "Design semantic search for an online store",
    track: "AI engineering",
    kind: "hld",
    difficulty: "Medium",
    statement:
      "Design product search that understands meaning (\"warm jacket for hiking\") as well as exact keywords, filters and sorting.",
    rubric: {
      scale: "50M products, 5k queries/sec, results in < 200ms, catalog updates every minute",
      mustHave: ["service", "vector_db", "search", "ml_model", "stream", "cache"],
      concepts: ["aie-rag", "ml-metrics", "ddia-derived-data", "ddia-partitioning"],
      keyTopics: [
        "hybrid retrieval: BM25 + vector ANN, score fusion",
        "embedding model choice and re-embedding on catalog changes",
        "filters (price, size, stock) with ANN",
        "re-ranking and business rules",
        "measuring relevance (offline judgments, click-through)",
      ],
      pitfalls: ["vector-only search that misses exact SKUs or brand names", "filtering after ANN so results come back empty"],
    },
    mockQuestions: [
      "A user searches an exact model number. How does your system make sure that product comes first?",
      "How do you apply an 'in stock, under $100' filter without losing good results?",
    ],
  },
  {
    id: "fraud-detection",
    title: "Design real-time fraud detection",
    track: "AI engineering",
    kind: "hld",
    difficulty: "Hard",
    statement: "Design a system that scores every card transaction for fraud before it is approved.",
    rubric: {
      scale: "50k transactions/sec, decision in < 100ms, fraud rate ~0.1%",
      mustHave: ["service", "ml_model", "stream", "stream_processor", "cache", "data_warehouse"],
      concepts: ["ml-features-serving", "ml-metrics", "ddia-streams", "ddia-reliability"],
      keyTopics: [
        "real-time features (velocity counts over windows) from a stream",
        "model serving within the latency budget, rules plus model",
        "imbalanced labels and delayed ground truth (chargebacks)",
        "fallback when the model is slow or down",
        "human review queue and feedback loop",
      ],
      pitfalls: ["computing aggregates from the warehouse at request time", "no fallback, so a model outage blocks all payments"],
    },
    mockQuestions: [
      "How do you know a card made 8 purchases in the last 10 minutes, within 100ms?",
      "Fraud labels arrive weeks later. How does that affect training and monitoring?",
    ],
  },
  {
    id: "content-moderation",
    title: "Design a content moderation system",
    track: "AI engineering",
    kind: "hld",
    difficulty: "Medium",
    statement:
      "Design a system that checks user posts (text and images) for harmful content, blocking the worst and sending unclear cases to human reviewers.",
    rubric: {
      scale: "500M posts/day, most must be checked within seconds of posting",
      mustHave: ["service", "queue", "worker", "ml_model", "nosql_db"],
      concepts: ["ml-metrics", "aie-evaluation", "aie-architecture", "ddia-streams"],
      keyTopics: [
        "sync vs async checks: block before publish vs take down after",
        "multiple classifiers and thresholds, precision vs recall per policy",
        "human review queue, prioritisation and reviewer tooling",
        "appeals and feedback into training",
        "adversarial users and evasion",
      ],
      pitfalls: ["one global threshold for every category", "no human review path"],
    },
    mockQuestions: [
      "Which content is checked before it is visible, and which after? Why?",
      "How do you choose the threshold that sends a post to human review?",
    ],
  },

  // ---------------------------------------------------------------- AI workflows & agents
  {
    id: "support-agent",
    title: "Design an AI customer-support agent",
    track: "AI workflows & agents",
    kind: "hld",
    difficulty: "Medium",
    statement:
      "Design an agent that answers customer chats, looks up orders, issues small refunds through internal tools, and hands off to a human when needed.",
    rubric: {
      scale: "1M conversations/day, first reply < 3s, refunds above a limit need approval",
      mustHave: ["service", "llm", "vector_db", "nosql_db", "queue", "external"],
      concepts: ["aie-agents", "aie-prompting", "aie-evaluation", "aie-finetuning"],
      keyTopics: [
        "agent loop with tool calls and limits on steps",
        "permissions and guardrails for actions (refund limits, confirmation)",
        "conversation state and memory",
        "escalation to humans with context",
        "evaluation and monitoring of resolution rate and bad actions",
      ],
      pitfalls: ["letting the model call refund APIs with no limits", "no audit log of agent actions"],
    },
    mockQuestions: [
      "A customer convinces the agent to refund $5,000. Where is that stopped?",
      "How do you measure whether the agent is actually resolving tickets?",
    ],
  },
  {
    id: "document-pipeline",
    title: "Design an AI document-processing pipeline",
    track: "AI workflows & agents",
    kind: "hld",
    difficulty: "Medium",
    statement:
      "Design a pipeline that takes uploaded invoices and contracts (PDFs, scans), extracts structured fields with OCR and LLMs, validates them and routes low-confidence results to people.",
    rubric: {
      scale: "2M documents/day, results within 10 minutes, 99% field accuracy after review",
      mustHave: ["object_storage", "queue", "worker", "llm", "sql_db"],
      concepts: ["aie-foundation-models", "aie-evaluation", "ddia-batch", "ddia-distributed-faults"],
      keyTopics: [
        "multi-step workflow (OCR, classify, extract, validate) with retries per step",
        "structured output with schemas and confidence scores",
        "human-in-the-loop review and feedback",
        "idempotent steps and reprocessing after model upgrades",
        "cost control: cheaper models first, escalate on low confidence",
      ],
      pitfalls: ["one giant synchronous request per document", "no way to reprocess when the model improves"],
    },
    mockQuestions: [
      "The LLM step fails halfway through a batch. What gets retried, and what doesn't?",
      "How do you decide which documents a person must review?",
    ],
  },
  {
    id: "research-agent",
    title: "Design a multi-step research agent",
    track: "AI workflows & agents",
    kind: "hld",
    difficulty: "Hard",
    statement:
      "Design a product where a user asks a research question and an agent searches the web, reads sources, runs sub-tasks in parallel and returns a cited report, possibly after many minutes.",
    rubric: {
      scale: "100k research jobs/day, each up to 30 minutes and hundreds of tool calls",
      mustHave: ["service", "queue", "worker", "llm", "nosql_db", "object_storage"],
      concepts: ["aie-agents", "aie-foundation-models", "aie-architecture", "ddia-distributed-faults"],
      keyTopics: [
        "long-running jobs: durable workflow state, checkpoints, resume after crash",
        "planner/sub-agent fan-out and merging results",
        "context window management (summaries, retrieval) and cost budgets",
        "progress streaming to the user, cancellation",
        "source tracking and citation accuracy",
      ],
      pitfalls: ["keeping a 30-minute job in one HTTP request", "no budget, so a looping agent burns unlimited tokens"],
    },
    mockQuestions: [
      "The worker running a job crashes at minute 20. What happens to the user's report?",
      "How do you stop an agent that keeps searching in circles?",
    ],
  },
  {
    id: "llm-evals",
    title: "Design LLM evaluation and monitoring",
    track: "AI workflows & agents",
    kind: "hld",
    difficulty: "Medium",
    statement:
      "Design the system a company uses to test prompt and model changes before release and to monitor quality, cost and safety of LLM features in production.",
    rubric: {
      scale: "30 LLM features, 50M production calls/day, every prompt change must be evaluated",
      mustHave: ["service", "stream", "data_warehouse", "llm", "worker", "monitoring"],
      concepts: ["aie-evaluation", "aie-dataset", "aie-architecture", "ddia-streams"],
      keyTopics: [
        "offline eval sets, graders (exact match, LLM-as-judge, human) and regression gates in CI",
        "logging prompts/responses with sampling and PII redaction",
        "online metrics: latency, cost, refusal and hallucination signals, user feedback",
        "A/B tests and safe rollout of prompt/model versions",
      ],
      pitfalls: ["judging quality only by eyeballing a few examples", "logging raw PII from prompts"],
    },
    mockQuestions: [
      "A prompt change improves one feature's scores but costs 3x more. How does your system surface that?",
      "How do you trust an LLM judge's scores?",
    ],
  },

  // ---------------------------------------------------------------- Cloud architecture
  {
    id: "multi-region-saas",
    title: "Design a multi-region SaaS application",
    track: "Cloud architecture",
    kind: "hld",
    difficulty: "Hard",
    statement:
      "Take a single-region SaaS app (web tier, APIs, a database) and design it to survive a full region outage with minimal downtime and data loss.",
    rubric: {
      scale: "Global customers, RTO < 15 min, RPO < 1 min, 99.99% availability target",
      mustHave: ["dns", "load_balancer", "service", "sql_db", "region"],
      concepts: ["ddia-replication", "ddia-conflicts", "ddia-consensus", "ddia-distributed-faults"],
      keyTopics: [
        "active-active vs active-passive and their costs",
        "database replication across regions, write conflicts, failover",
        "global traffic routing (DNS/anycast) and health checks",
        "data residency requirements",
        "testing failover (game days)",
      ],
      pitfalls: ["claiming active-active without handling write conflicts", "never testing the failover"],
    },
    mockQuestions: [
      "us-east goes down completely. Walk me through the next 15 minutes.",
      "Two regions accept a write to the same record at the same time. Which one wins?",
    ],
  },
  {
    id: "metrics-monitoring",
    title: "Design a metrics monitoring and alerting system",
    track: "Cloud architecture",
    kind: "hld",
    difficulty: "Hard",
    statement:
      "Design a system like Datadog/Prometheus that collects metrics from thousands of services, shows dashboards and fires alerts.",
    rubric: {
      scale: "100k hosts, 10M metrics/sec, dashboards over 1 year, alerts within 1 minute",
      mustHave: ["stream", "stream_processor", "nosql_db", "service", "notification"],
      concepts: ["ddia-storage", "ddia-streams", "ddia-partitioning", "ddia-reliability"],
      keyTopics: [
        "push vs pull collection",
        "time-series storage, compression and downsampling/retention",
        "high-cardinality labels",
        "alert evaluation, dedupe and routing",
        "monitoring the monitoring system",
      ],
      pitfalls: ["storing raw points forever", "unbounded label cardinality"],
    },
    mockQuestions: [
      "How do you store a year of data cheaply while keeping recent data detailed?",
      "Someone adds user_id as a metric label. What happens to your system?",
    ],
  },
  {
    id: "job-scheduler",
    title: "Design a distributed job scheduler",
    track: "Cloud architecture",
    kind: "hld",
    difficulty: "Medium",
    statement:
      "Design a service teams use to run one-off and recurring (cron) jobs reliably across a fleet of workers.",
    rubric: {
      scale: "10M jobs/day, schedules accurate to the second, jobs run from seconds to hours",
      mustHave: ["service", "scheduler", "queue", "worker", "sql_db"],
      concepts: ["ddia-distributed-faults", "ddia-consensus", "ddia-transactions"],
      keyTopics: [
        "storing schedules and efficiently finding due jobs",
        "at-least-once execution, leases/heartbeats, idempotent jobs",
        "avoiding duplicate runs when scheduler nodes fail over",
        "retries, backoff, dead-letter handling",
        "priority and fairness between tenants",
      ],
      pitfalls: ["one scheduler node as a single point of failure", "polling the whole jobs table every second"],
    },
    mockQuestions: [
      "A worker dies halfway through a job. How does anyone find out, and what happens?",
      "How do you make sure a cron job runs once, not zero or two times, when a scheduler node fails?",
    ],
  },

  // ---------------------------------------------------------------- Low-level design
  {
    id: "parking-lot",
    title: "Design a parking lot (LLD)",
    track: "Low-level design",
    kind: "lld",
    difficulty: "Medium",
    statement:
      "Design the classes for a multi-floor parking lot: different spot sizes, vehicle types, tickets, payment and a display of free spots.",
    rubric: {
      scale: "Single process; focus on classes, responsibilities and extensibility",
      mustHave: ["class", "interface", "enum"],
      concepts: ["ood-solid", "ood-patterns", "ood-concurrency"],
      keyTopics: [
        "clear entities: ParkingLot, Floor, Spot, Vehicle, Ticket, Payment",
        "spot allocation strategy behind an interface (Strategy pattern)",
        "vehicle/spot types via enums or polymorphism",
        "fee calculation open for new pricing rules",
        "concurrency when two cars take the last spot",
      ],
      pitfalls: ["one god class doing everything", "type checks with if/else chains instead of polymorphism"],
    },
    mockQuestions: [
      "How would you add electric-vehicle charging spots without changing existing classes?",
      "Two cars enter at the same moment for the last spot. What happens in your code?",
    ],
  },
  {
    id: "elevator-system",
    title: "Design an elevator system (LLD)",
    track: "Low-level design",
    kind: "lld",
    difficulty: "Hard",
    statement: "Design the classes for a building with several elevators: requests from floors and inside cars, scheduling and states.",
    rubric: {
      scale: "Single process; focus on state, scheduling and extensibility",
      mustHave: ["class", "interface", "enum"],
      concepts: ["ood-state", "ood-patterns", "ood-concurrency"],
      keyTopics: [
        "Elevator state machine (idle, moving up/down, doors open, maintenance)",
        "dispatcher choosing an elevator, with the algorithm behind an interface",
        "request handling for hall calls vs car calls",
        "thread safety of request queues",
      ],
      pitfalls: ["scheduling logic spread across classes", "no explicit states"],
    },
    mockQuestions: [
      "Where does the logic that picks which elevator answers a call live, and how would you swap it?",
      "What states can an elevator be in, and what moves it between them?",
    ],
  },
  {
    id: "splitwise",
    title: "Design an expense-sharing app (Splitwise, LLD)",
    track: "Low-level design",
    kind: "lld",
    difficulty: "Medium",
    statement: "Design the classes for an app where groups add shared expenses split equally, by exact amounts or by percentage, and see who owes whom.",
    rubric: {
      scale: "Single process; focus on modelling and correctness",
      mustHave: ["class", "interface", "enum"],
      concepts: ["ood-solid", "ood-patterns", "ood-state"],
      keyTopics: [
        "User, Group, Expense, Split types (Strategy or subclassing)",
        "balance sheet and simplifying debts",
        "validation (percentages sum to 100, exact amounts match total)",
        "money as integers/decimals, not floats",
      ],
      pitfalls: ["floating-point money", "split logic duplicated per split type"],
    },
    mockQuestions: [
      "How would you add a new split type, say by shares, without editing existing ones?",
      "How do you represent money so balances always add up?",
    ],
  },
  {
    id: "lru-cache",
    title: "Design an LRU cache with TTL (LLD)",
    track: "Low-level design",
    kind: "lld",
    difficulty: "Medium",
    statement: "Design a thread-safe in-memory cache with a size limit, least-recently-used eviction and optional per-key expiry.",
    rubric: {
      scale: "Single process; O(1) get/put, safe under concurrent access",
      mustHave: ["class", "interface"],
      concepts: ["ood-dsa", "ood-concurrency", "ood-patterns"],
      keyTopics: [
        "hash map + doubly linked list for O(1) operations",
        "eviction policy behind an interface (LRU, LFU)",
        "TTL expiry: lazy vs background cleanup",
        "locking strategy and contention",
      ],
      pitfalls: ["O(n) eviction scans", "a global lock held during slow work"],
    },
    mockQuestions: [
      "Which data structures give you O(1) get and put, and why both?",
      "How would you switch the policy to LFU without rewriting the cache?",
    ],
  },
];

export function findProblem(id: string): Problem | undefined {
  return PROBLEMS.find((p) => p.id === id);
}

export function toPublicProblem({ id, title, track, kind, difficulty, statement }: Problem): PublicProblem {
  return { id, title, track, kind, difficulty, statement };
}
