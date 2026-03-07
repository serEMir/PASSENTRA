import { loadConfig } from "./config.js";
import { RequestIdCache } from "./idempotency.js";
import { createEvaluateHandler } from "./routes/evaluate.js";

// Process-wide adapter state initialized once at startup.
const config = loadConfig();
const requestIdCache = new RequestIdCache();

const evaluateHandler = createEvaluateHandler({
  config,
  cache: requestIdCache,
});

const json = (body: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

const server = Bun.serve({
  port: config.port,
  fetch: async (request) => {
    const { pathname } = new URL(request.url);

    // Liveness probe endpoint for local/dev orchestration.
    if (pathname === "/healthz") {
      return json({
        ok: true,
        provider: "mock",
      });
    }

    // Primary policy decision endpoint consumed by the CRE workflow.
    if (pathname === "/v1/compliance/evaluate") {
      return evaluateHandler(request);
    }

    return json({ error: "NOT_FOUND" }, { status: 404 });
  },
});

console.log(
  `Compliance adapter running on http://${server.hostname}:${server.port} provider=mock`,
);
