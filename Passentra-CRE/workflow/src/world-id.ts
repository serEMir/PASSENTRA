import type { Runtime } from "@chainlink/cre-sdk";
import type {
  ActivatePassportRequest,
  Config,
  VerificationLevel,
} from "./schema";
import { worldIdV4AdapterResponseSchema } from "./schema";
import type { WorldIdVerificationResult, WorldProofContext } from "./types";
import { buildAuthHeaders, postJson } from "./http";
import { toReasonCode } from "./utils";

const BYTES32_REGEX = /^0x[a-fA-F0-9]{64}$/;
const EMPTY_SIGNAL_HASH =
  "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470";

const normalizeBytes32Hex = (value: string, fieldName: string): string => {
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!BYTES32_REGEX.test(normalized)) {
    throw new Error(`${fieldName} must be a bytes32 hex string`);
  }
  return normalized.toLowerCase();
};

const identifierToVerificationLevel = (identifier: string): VerificationLevel => {
  // World ID 4.0 response identifiers can vary; default to device unless orb is explicit.
  return identifier.toLowerCase().includes("orb") ? "orb" : "device";
};

const resolveVerifierUrl = (config: Config["worldId"]): string => {
  if (!config.rpId) {
    throw new Error("worldId.rpId is required");
  }
  return config.verifyUrlTemplate.replace("{rp_id}", config.rpId);
};

const buildVerificationPayload = (
  request: ActivatePassportRequest,
): Record<string, unknown> => {
  if (!request.worldProofV4) {
    throw new Error("worldProofV4 is required in request payload");
  }

  // In World ID 4 preview, legacy (protocol 3.0) responses may omit signal_hash.
  // World's verifier can reject such payloads, so we explicitly provide the
  // default hash of an empty signal when it's missing.
  if (request.worldProofV4.protocol_version === "3.0") {
    return {
      ...request.worldProofV4,
      responses: request.worldProofV4.responses.map((response) => ({
        ...response,
        signal_hash: response.signal_hash ?? EMPTY_SIGNAL_HASH,
      })),
    };
  }

  return request.worldProofV4;
};

const parseWorldIdHttpErrorReason = (
  bodyText: string,
  statusCode: number,
): string => {
  try {
    const parsedBody = JSON.parse(bodyText || "{}");
    const parsed = worldIdV4AdapterResponseSchema.parse(parsedBody);
    const failedResult = parsed.results?.find((result) => result.success === false);
    return toReasonCode(
      failedResult?.code ??
        failedResult?.detail ??
        parsed.code ??
        parsed.detail ??
        parsed.message ??
        `WORLD_ID_HTTP_${statusCode}`,
    );
  } catch {
    return `WORLD_ID_HTTP_${statusCode}`;
  }
};

/**
 * Extracts canonical World ID policy attributes from World ID 4.0 payload shape.
 *
 * @param request Parsed activation request payload.
 * @returns Canonical nullifier hash and verification level.
 */
export const extractWorldProofContext = (
  request: ActivatePassportRequest,
): WorldProofContext => {
  const firstResponse = request.worldProofV4?.responses[0];
  if (!firstResponse) {
    throw new Error("worldProofV4.responses[0] is required");
  }

  return {
    nullifierHash: normalizeBytes32Hex(
      firstResponse.nullifier,
      "worldProofV4.responses[0].nullifier",
    ),
    verificationLevel: identifierToVerificationLevel(firstResponse.identifier),
  };
};

/**
 * Verifies a World ID proof using the configured verifier API.
 *
 * @param runtime CRE runtime instance.
 * @param request Parsed activation request payload.
 * @returns Verification outcome with normalized reason codes.
 */
export const verifyWorldIdProof = (
  runtime: Runtime<Config>,
  request: ActivatePassportRequest,
): WorldIdVerificationResult => {
  const worldIdAuth = buildAuthHeaders(runtime.config.worldId);
  const verifyUrl = resolveVerifierUrl(runtime.config.worldId);
  const verificationPayload = buildVerificationPayload(request);

  const worldResponse = postJson(runtime, {
    url: verifyUrl,
    headers: worldIdAuth.headers,
    vaultDonSecrets: worldIdAuth.vaultDonSecrets,
    body: verificationPayload,
  });

  if (worldResponse.statusCode < 200 || worldResponse.statusCode >= 300) {
    runtime.log(
      `World ID verifier returned non-success status=${worldResponse.statusCode}, body=${worldResponse.bodyText}`,
    );
    return {
      verified: false,
      reasonCodes: [
        parseWorldIdHttpErrorReason(
          worldResponse.bodyText,
          worldResponse.statusCode,
        ),
      ],
    };
  }

  try {
    const parsedResponseBody = JSON.parse(worldResponse.bodyText || "{}");
    const parsedWorldResponse = worldIdV4AdapterResponseSchema.parse(parsedResponseBody);
    const failedResult = parsedWorldResponse.results?.find(
      (result) => result.success === false,
    );
    const allResultsSuccessful =
      parsedWorldResponse.results?.length
        ? parsedWorldResponse.results.every((result) => result.success !== false)
        : false;
    const verified = (parsedWorldResponse.success ?? allResultsSuccessful) && !failedResult;

    if (!verified) {
      const providerReason =
        failedResult?.code ??
        failedResult?.detail ??
        parsedWorldResponse.code ??
        parsedWorldResponse.detail ??
        parsedWorldResponse.message ??
        "WORLD_ID_NOT_VERIFIED";
      return { verified: false, reasonCodes: [toReasonCode(providerReason)] };
    }

    return { verified: true, reasonCodes: [] };
  } catch {
    runtime.log(
      `World ID verifier response parse failed, body=${worldResponse.bodyText}`,
    );
    return { verified: false, reasonCodes: ["WORLD_ID_RESPONSE_PARSE_FAILED"] };
  }
};
