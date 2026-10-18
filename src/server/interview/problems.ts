import type { ComponentType, PublicProblem } from "../../shared/schemas.ts";

export interface Problem extends PublicProblem {
  /** Hidden from the candidate; given to the interviewer model so grading stays consistent. */
  rubric: {
    scale: string;
    mustHave: ComponentType[];
    keyTopics: string[];
    pitfalls: string[];
  };
  /** Problem-specific global questions the mock provider can ask. */
  mockQuestions: string[];
}

// Hand-written rubrics: zero tokens spent generating them.
export const PROBLEMS: readonly Problem[] = [
  {
    id: "url-shortener",
    title: "Design a URL shortener",
    track: "Product system design",
    statement:
      "Design a service like bit.ly. Users submit a long URL and get a short link; visiting the short link redirects to the original. Clarify scale and features with the interviewer as you go.",
    rubric: {
      scale: "100M new URLs/month, 100:1 read:write, redirects p99 < 50ms, links kept 5 years",
      mustHave: ["load_balancer", "service", "cache", "nosql_db"],
      keyTopics: [
        "unique short-code generation without collisions (counter ranges, base62, hashing trade-offs)",
        "read-heavy caching of redirects and cache invalidation",
        "data model and partitioning key",
        "301 vs 302 and analytics impact",
        "abuse prevention and rate limiting",
      ],
      pitfalls: [
        "hashing the URL and truncating without a collision strategy",
        "single database with no replication",
        "no capacity estimate",
      ],
    },
    mockQuestions: [
      "How do you generate short codes that never collide when many app servers create links at once?",
      "Should redirects return 301 or 302? What does that choice do to your analytics?",
    ],
  },
  {
    id: "rate-limiter",
    title: "Design a distributed rate limiter",
    track: "Distributed systems",
    statement:
      "Design a rate limiter used by an API gateway in front of many services. Limits are per user and per API key, configurable per endpoint.",
    rubric: {
      scale: "1M requests/sec across 50 gateway nodes, decision overhead < 2ms",
      mustHave: ["api_gateway", "cache", "service"],
      keyTopics: [
        "algorithm choice: token bucket vs sliding window log vs sliding window counter",
        "shared counters in a fast store and atomic increments",
        "behaviour when the counter store is down (fail open vs closed)",
        "multi-region consistency vs latency",
        "rule configuration and hot reload",
      ],
      pitfalls: [
        "per-node in-memory counters presented as globally correct",
        "race conditions on read-then-write counters",
      ],
    },
    mockQuestions: [
      "Which rate-limiting algorithm are you using, and why not the alternatives?",
      "If the counter store goes down, do you fail open or fail closed?",
    ],
  },
  {
    id: "chat-app",
    title: "Design a chat application",
    track: "Product system design",
    statement:
      "Design a 1:1 and group messaging app like WhatsApp. Support online presence, delivery receipts and message history across devices.",
    rubric: {
      scale: "500M DAU, 40B messages/day, groups up to 500 members",
      mustHave: ["load_balancer", "service", "queue", "nosql_db", "cache"],
      keyTopics: [
        "persistent connections (WebSocket) and connection routing",
        "message ordering and delivery guarantees",
        "fan-out for group messages",
        "offline delivery and multi-device sync",
        "presence at scale",
      ],
      pitfalls: ["polling instead of push", "storing all messages in one relational table"],
    },
    mockQuestions: [
      "How does a message reach a recipient who is connected to a different server than the sender?",
      "How do you guarantee message ordering within a conversation?",
    ],
  },
  {
    id: "news-feed",
    title: "Design a news feed",
    track: "Product system design",
    statement:
      "Design the home feed for a social network: users follow others and see a ranked feed of their posts.",
    rubric: {
      scale: "300M DAU, average 200 follows, some celebrities with 50M followers",
      mustHave: ["load_balancer", "service", "cache", "queue", "nosql_db", "object_storage"],
      keyTopics: [
        "fan-out on write vs fan-out on read, and the hybrid for celebrities",
        "feed cache structure and pagination",
        "media storage and CDN",
        "ranking pipeline",
      ],
      pitfalls: ["pure fan-out on write for celebrity accounts", "querying followees' posts at read time with no cache"],
    },
    mockQuestions: [
      "A celebrity with 50M followers posts. Walk me through what your system does.",
      "How do you paginate the feed so items are not duplicated or skipped as new posts arrive?",
    ],
  },
];

export function findProblem(id: string): Problem | undefined {
  return PROBLEMS.find((p) => p.id === id);
}

export function toPublicProblem({ id, title, track, statement }: Problem): PublicProblem {
  return { id, title, track, statement };
}
