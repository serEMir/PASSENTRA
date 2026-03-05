import {
  cre,
  prepareReportRequest,
  type HTTPPayload,
  type Runtime,
} from "@chainlink/cre-sdk";
import {
  activatePassportRequestSchema,
  type ActivatePassportRequest,
  type Config,
  type Decision,
} from "./schema";
import type { Hex } from "viem";
import type { ActivatePassportResult, ChainWriteResult } from "./types";
import { extractWorldProofContext, verifyWorldIdProof } from "./world-id";
import { evaluateCompliance } from "./compliance";
import { buildDecisionHashes, encodeRegistryReportPayload } from "./attestation";
import {
  checkReplayStatus,
  resolveChainConfig,
  resolveWriteTargets,
  writePassportStamp,
} from "./onchain";

/**
 * Parses and validates incoming HTTP payload bytes into a typed request object.
 *
 * @param payload Raw HTTP trigger payload from CRE.
 * @returns Parsed activation request.
 * @throws Error when JSON is invalid or schema validation fails.
 */
const parseHttpPayload = (payload: HTTPPayload): ActivatePassportRequest => {
  const rawInput = new TextDecoder().decode(payload.input);
  let parsedInput: unknown;

  try {
    parsedInput = JSON.parse(rawInput);
  } catch (error) {
    throw new Error(
      `HTTP payload must be valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return activatePassportRequestSchema.parse(parsedInput);
};

/**
 * Main workflow callback for passport activation.
 *
 * @param runtime CRE runtime instance.
 * @param payload Raw HTTP trigger payload.
 * @returns Structured activation result with attestation metadata.
 */
export const onActivatePassport = (
  runtime: Runtime<Config>,
  payload: HTTPPayload,
): ActivatePassportResult => {
  runtime.log("Received HTTP trigger for passport activation.");
  const request = parseHttpPayload(payload);
  const worldProofContext = extractWorldProofContext(request);
  resolveChainConfig(runtime.config, request.targetChain);

  runtime.log(
    `Activation requestId=${request.requestId}, user=${request.userAddress}, targetChain=${request.targetChain}`,
  );

  const worldIdVerification = verifyWorldIdProof(runtime, request);

  let decision: Decision;
  let reasonCodes: string[];
  let ttlSeconds = runtime.config.defaultTtlSeconds;

  if (!worldIdVerification.verified) {
    decision = "rejected";
    reasonCodes = worldIdVerification.reasonCodes;
  } else {
    const compliance = evaluateCompliance(
      runtime,
      request,
      worldIdVerification.verified,
      worldProofContext,
    );

    decision = compliance.decision;
    reasonCodes = compliance.reasonCodes;
    ttlSeconds = compliance.ttlSeconds;
    runtime.log(`Compliance source=${compliance.source}.`);
  }

  const nowSeconds = Math.floor(runtime.now().getTime() / 1000);
  const expiresAt = decision === "approved" ? nowSeconds + ttlSeconds : 0;
  const hashes = buildDecisionHashes(
    runtime,
    request,
    decision,
    reasonCodes,
    worldIdVerification.verified,
  );

  const writeTargets = resolveWriteTargets(runtime.config, request.targetChain, decision);
  let chainWrites: ChainWriteResult[] = [];
  let stampStatus: ActivatePassportResult["stampStatus"] = "onchain_skipped";

  if (!runtime.config.enableOnchainWrite) {
    chainWrites = writeTargets.map((target) => ({
      chainSelectorName: target.chainSelectorName,
      receiver: target.registryAddress,
      txStatus: "skipped",
      errorMessage: "ONCHAIN_WRITE_DISABLED",
    }));
  } else {
    const replayChecks = writeTargets.map((target) => ({
      target,
      replay: checkReplayStatus(
        runtime,
        target,
        hashes.requestIdHash as Hex,
        worldProofContext.nullifierHash as Hex,
      ),
    }));

    const shouldWrite = replayChecks.some(
      ({ replay }) => !replay.requestIdUsed && !replay.nullifierUsed,
    );

    const report = shouldWrite
      ? runtime
          .report(
            prepareReportRequest(
              encodeRegistryReportPayload(
                request.userAddress,
                worldProofContext.nullifierHash,
                decision,
                expiresAt,
                hashes.decisionHash,
                hashes.requestIdHash,
                hashes.policyVersionHash,
              ),
            ),
          )
          .result()
      : null;

    chainWrites = replayChecks.map(({ target, replay }) => {
      if (replay.requestIdUsed || replay.nullifierUsed) {
        const reasons: string[] = [];
        if (replay.requestIdUsed) reasons.push("REQUEST_ID_HASH_USED");
        if (replay.nullifierUsed) reasons.push("NULLIFIER_HASH_USED");

        return {
          chainSelectorName: target.chainSelectorName,
          receiver: target.registryAddress,
          txStatus: "reverted",
          errorMessage: `REPLAY_DETECTED:${reasons.join("|")}`,
        };
      }

      if (!report) {
        return {
          chainSelectorName: target.chainSelectorName,
          receiver: target.registryAddress,
          txStatus: "reverted",
          errorMessage: "REPORT_UNAVAILABLE",
        };
      }

      return writePassportStamp(runtime, target, report);
    });

    stampStatus = chainWrites.some((write) => write.txStatus === "reverted")
      ? "onchain_reverted"
      : "onchain_written";
  }

  const result: ActivatePassportResult = {
    requestId: request.requestId,
    userAddress: request.userAddress,
    writeTargets: writeTargets.map((target) => target.chainSelectorName),
    ...(writeTargets.length === 1 ? { requestedTargetChain: request.targetChain } : {}),
    worldIdVerified: worldIdVerification.verified,
    decision,
    reasonCodes,
    ...(decision === "approved" ? { expiresAt } : {}),
    stampStatus,
    chainWrites,
  };

  const chainWriteSummary = chainWrites
    .map((write) =>
      `${write.chainSelectorName}:${write.txStatus}${write.errorMessage ? `(${write.errorMessage})` : ""}`,
    )
    .join(", ");
  runtime.log(
    `Outcome requestId=${request.requestId}, decision=${decision}, stampStatus=${stampStatus}, writes=[${chainWriteSummary}]`,
  );
  return result;
};

/**
 * Registers workflow handlers for this workflow package.
 *
 * @returns Array of CRE handlers.
 */
export const initWorkflow = () => {
  const httpTrigger = new cre.capabilities.HTTPCapability();
  return [cre.handler(httpTrigger.trigger({}), onActivatePassport)];
};
