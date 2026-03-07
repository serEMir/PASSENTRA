import { encodeAbiParameters, keccak256, parseAbiParameters, stringToHex } from "viem";
import type { Address, Hex } from "viem";
import type { ActivatePassportRequest, Config, Decision } from "./schema";
import type { Runtime } from "@chainlink/cre-sdk";

/**
 * Hashes decision metadata so onchain state stays compact and privacy-preserving.
 *
 * @param runtime CRE runtime instance.
 * @param request Parsed activation request payload.
 * @param decision Final decision (`approved` or `rejected`).
 * @param reasonCodes Normalized reason codes that explain the decision.
 * @param worldIdVerified Whether World ID verification succeeded.
 * @returns requestIdHash, policyVersionHash, and decisionHash commitments.
 */
export const buildDecisionHashes = (
  runtime: Runtime<Config>,
  request: ActivatePassportRequest,
  decision: Decision,
  reasonCodes: string[],
  worldIdVerified: boolean,
) => {
  const requestIdHash = keccak256(stringToHex(request.requestId));
  const policyVersionHash = keccak256(stringToHex(runtime.config.policyVersion));
  const decisionHash = keccak256(
    encodeAbiParameters(parseAbiParameters("string,string[],bool"), [
      decision,
      reasonCodes,
      worldIdVerified,
    ]),
  );

  return {
    requestIdHash,
    policyVersionHash,
    decisionHash,
  };
};

/**
 * Encodes the report payload expected by `PassportRegistry.onReport`.
 *
 * @param userAddress Subject wallet address for attestation write.
 * @param nullifierHash World ID nullifier hash for replay protection.
 * @param decision Final decision (`approved` or `rejected`).
 * @param expiresAt Expiration timestamp used for eligibility checks.
 * @param decisionHash Commitment hash of decision metadata.
 * @param requestIdHash Commitment hash of request identifier.
 * @param policyVersionHash Commitment hash of policy version string.
 * @returns ABI-encoded bytes payload for CRE report writing.
 */
export const encodeRegistryReportPayload = (
  userAddress: string,
  nullifierHash: string,
  decision: Decision,
  expiresAt: number,
  decisionHash: Hex,
  requestIdHash: Hex,
  policyVersionHash: Hex,
): Hex =>
  encodeAbiParameters(
    parseAbiParameters("address,bytes32,bool,uint64,bytes32,bytes32,bytes32"),
    [
      userAddress as Address,
      nullifierHash as Hex,
      decision === "approved",
      BigInt(expiresAt),
      decisionHash,
      requestIdHash,
      policyVersionHash,
    ],
  );
