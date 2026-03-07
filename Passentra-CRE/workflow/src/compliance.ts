import type { Runtime } from "@chainlink/cre-sdk";
import type { ActivatePassportRequest, Config } from "./schema";
import { complianceAdapterResponseSchema } from "./schema";
import type { ComplianceResult, WorldProofContext } from "./types";
import { buildAuthHeaders, postJson } from "./http";

/**
 * Evaluates policy eligibility using the configured compliance source.
 *
 * @param runtime CRE runtime instance.
 * @param request Parsed activation request payload.
 * @param worldIdVerified World ID verification status for the request.
 * @param worldProofContext Canonical World ID proof context used in compliance decisions.
 * @returns Normalized compliance decision, reason codes, and TTL.
 */
export const evaluateCompliance = (
  runtime: Runtime<Config>,
  request: ActivatePassportRequest,
  worldIdVerified: boolean,
  worldProofContext: WorldProofContext,
): ComplianceResult => {
  if (runtime.config.compliance.mode === "mock") {
    runtime.log("Compliance mode=mock; using fallback decision.");
    return {
      decision: runtime.config.compliance.fallbackDecision,
      reasonCodes: runtime.config.compliance.fallbackReasonCodes,
      ttlSeconds: runtime.config.defaultTtlSeconds,
      source: "mock",
    };
  }

  const complianceAuth = buildAuthHeaders(runtime.config.compliance);
  const complianceResponse = postJson(runtime, {
    url: runtime.config.compliance.adapterUrl,
    headers: complianceAuth.headers,
    vaultDonSecrets: complianceAuth.vaultDonSecrets,
    body: {
      requestId: request.requestId,
      userAddress: request.userAddress,
      targetChain: request.targetChain,
      countryCode: request.countryCode,
      credentialType: request.credentialType,
      worldId: {
        verified: worldIdVerified,
        nullifierHash: worldProofContext.nullifierHash,
        verificationLevel: worldProofContext.verificationLevel,
      },
    },
  });

  if (complianceResponse.statusCode < 200 || complianceResponse.statusCode >= 300) {
    runtime.log(
      `Compliance adapter non-success status=${complianceResponse.statusCode}, body=${complianceResponse.bodyText}. Falling back to configured default decision.`,
    );
    return {
      decision: runtime.config.compliance.fallbackDecision,
      reasonCodes: [
        ...runtime.config.compliance.fallbackReasonCodes,
        `COMPLIANCE_HTTP_${complianceResponse.statusCode}`,
      ],
      ttlSeconds: runtime.config.defaultTtlSeconds,
      source: "fallback",
    };
  }

  try {
    const parsedCompliance = complianceAdapterResponseSchema.parse(
      JSON.parse(complianceResponse.bodyText || "{}"),
    );
    return {
      decision: parsedCompliance.decision,
      reasonCodes: parsedCompliance.reasonCodes,
      ttlSeconds: parsedCompliance.ttlSeconds ?? runtime.config.defaultTtlSeconds,
      source: "adapter",
    };
  } catch {
    runtime.log(
      `Compliance adapter response parse failed, body=${complianceResponse.bodyText}. Falling back to configured default decision.`,
    );
    return {
      decision: runtime.config.compliance.fallbackDecision,
      reasonCodes: [
        ...runtime.config.compliance.fallbackReasonCodes,
        "COMPLIANCE_RESPONSE_PARSE_FAILED",
      ],
      ttlSeconds: runtime.config.defaultTtlSeconds,
      source: "fallback",
    };
  }
};
