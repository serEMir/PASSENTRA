import type { AdapterConfig } from "../config.js";
import { RequestIdCache } from "../idempotency.js";
import {
  normalizeReasonCodes,
  rejectedDecision,
  toReasonCode,
} from "../mappers/decision.js";
import { evaluateWithMock } from "../providers/mock.js";
import {
  complianceEvaluateRequestSchema,
  complianceEvaluateResponseSchema,
  type ComplianceEvaluateResponse,
  type ProviderDecision,
} from "../types.js";

type EvaluateHandlerDeps = {
  config: AdapterConfig;
  cache: RequestIdCache;
};

const json = (body: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

const getBearerToken = (authHeader: string | null): string | undefined => {
  if (!authHeader) {
    return undefined;
  }

  const [scheme, token] = authHeader.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return undefined;
  }

  return token.trim();
};

const unauthorized = (reasonCode: string): Response =>
  json(
    {
      error: "UNAUTHORIZED",
      reasonCode,
    },
    { status: 401 },
  );

const badRequest = (reasonCode: string, details?: unknown): Response =>
  json(
    {
      error: "BAD_REQUEST",
      reasonCode,
      details,
    },
    { status: 400 },
  );

const toResponsePayload = (
  decision: ProviderDecision,
  defaultTtlSeconds: number,
): ComplianceEvaluateResponse =>
  complianceEvaluateResponseSchema.parse({
    decision: decision.decision,
    reasonCodes: normalizeReasonCodes(decision.reasonCodes),
    ttlSeconds: decision.ttlSeconds ?? defaultTtlSeconds,
  });

/**
 * Creates the compliance evaluation route handler with injected dependencies.
 *
 * @param deps Adapter configuration and idempotency cache.
 * @returns Bun-compatible request handler for `/v1/compliance/evaluate`.
 */
export const createEvaluateHandler =
  ({ config, cache }: EvaluateHandlerDeps) =>
  async (request: Request): Promise<Response> => {
    // Enforce a strict endpoint contract: POST + Bearer auth + schema-validated JSON.
    if (request.method !== "POST") {
      return json(
        { error: "METHOD_NOT_ALLOWED", allowedMethods: ["POST"] },
        { status: 405 },
      );
    }

    const bearerToken = getBearerToken(request.headers.get("authorization"));
    if (!bearerToken) {
      return unauthorized("MISSING_BEARER_TOKEN");
    }

    if (bearerToken !== config.adapterApiKey) {
      return unauthorized("INVALID_BEARER_TOKEN");
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return badRequest("INVALID_JSON_BODY");
    }

    const parsed = complianceEvaluateRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return badRequest("SCHEMA_VALIDATION_FAILED", parsed.error.flatten());
    }

    const normalizedRequest = parsed.data;
    const cachedResponse = cache.get(normalizedRequest.requestId);
    if (cachedResponse) {
      // Return the original response for replayed requestIds.
      return json(cachedResponse, { status: 200 });
    }

    let decision: ProviderDecision;
    try {
      decision = evaluateWithMock(config, normalizedRequest);
    } catch (error) {
      decision = rejectedDecision(
        [toReasonCode(`PROVIDER_FAILURE_${String(error)}`)],
        config.defaultTtlSeconds,
        "fallback",
      );
    }

    const responsePayload = toResponsePayload(decision, config.defaultTtlSeconds);
    cache.set(normalizedRequest.requestId, responsePayload);
    return json(responsePayload, { status: 200 });
  };
