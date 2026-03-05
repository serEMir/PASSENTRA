import type { AdapterConfig } from "../config.js";
import { approvedDecision, rejectedDecision } from "../mappers/decision.js";
import type { ComplianceEvaluateRequest, ProviderDecision } from "../types.js";

const RETAIL_ALLOWED_COUNTRIES = new Set(["US", "GB", "AE", "SG"]);

// Deterministic local policy engine used for demos and offline simulation.
/**
 * Evaluates a request with deterministic local policy rules.
 *
 * @param config Adapter runtime config.
 * @param request Parsed compliance evaluation request.
 * @returns Provider decision with normalized reasons.
 */
export const evaluateWithMock = (
  config: AdapterConfig,
  request: ComplianceEvaluateRequest,
): ProviderDecision => {
  if (!request.worldId.verified) {
    return rejectedDecision(
      ["WORLD_ID_UNVERIFIED"],
      config.defaultTtlSeconds,
      "mock",
    );
  }

  if (config.blockedCountries.has(request.countryCode)) {
    return rejectedDecision(
      ["COUNTRY_BLOCKED"],
      config.defaultTtlSeconds,
      "mock",
    );
  }

  if (
    request.credentialType === "retail" &&
    !RETAIL_ALLOWED_COUNTRIES.has(request.countryCode)
  ) {
    return rejectedDecision(
      ["RETAIL_COUNTRY_RESTRICTED"],
      config.defaultTtlSeconds,
      "mock",
    );
  }

  if (
    request.credentialType === "institution" &&
    request.worldId.verificationLevel !== "orb"
  ) {
    return rejectedDecision(
      ["INSTITUTION_REQUIRES_ORB"],
      config.defaultTtlSeconds,
      "mock",
    );
  }

  return approvedDecision([], config.defaultTtlSeconds, "mock");
};
