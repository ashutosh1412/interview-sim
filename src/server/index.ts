import { serve } from "@hono/node-server";
import { join } from "node:path";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { Budget } from "./llm/budget.ts";
import { createLlmClient, createProvider } from "./llm/client.ts";
import { createInterviewService } from "./interview/service.ts";
import { createFileSessionStore } from "./interview/sessionStore.ts";

const config = loadConfig();
const llm = createLlmClient({
  provider: createProvider(config),
  providerName: config.provider,
  dryRun: config.dryRun,
  models: config.models,
  budget: new Budget(config.budget, join(config.dataDir, "usage.json")),
});
const service = createInterviewService({
  store: createFileSessionStore(join(config.dataDir, "sessions")),
  llm,
});

serve({ fetch: createApp({ service, llm }).fetch, port: config.port }, ({ port }) => {
  const mode = config.dryRun ? `${config.provider} (dry run -> mock answers)` : config.provider;
  console.info(`interview-sim API on http://localhost:${port}  provider=${mode}`);
});
