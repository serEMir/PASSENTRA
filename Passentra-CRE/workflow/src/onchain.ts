import {
  bytesToHex,
  cre,
  getNetwork,
  LATEST_BLOCK_NUMBER,
  TxStatus,
  encodeCallMsg,
  type Runtime,
} from "@chainlink/cre-sdk";
import {
  decodeFunctionResult,
  encodeFunctionData,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import type { ChainConfig, ChainSelectorName, Config, Decision } from "./schema";
import type { ChainWriteResult } from "./types";

const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";
const REGISTRY_ABI = parseAbi([
  "function usedRequestIdHashes(bytes32) view returns (bool)",
  "function usedNullifierHashes(bytes32) view returns (bool)",
]);

type ReplayStatus = {
  requestIdUsed: boolean;
  nullifierUsed: boolean;
};

/**
 * Resolves a single configured chain by selector name.
 *
 * @param config Workflow runtime config.
 * @param targetChain Target chain selector name.
 * @returns Chain configuration block.
 * @throws Error when the target chain is not configured.
 */
export const resolveChainConfig = (
  config: Config,
  targetChain: ChainSelectorName,
): ChainConfig => {
  const chainConfig = config.chains.find(
    (chain) => chain.chainSelectorName === targetChain,
  );

  if (!chainConfig) {
    throw new Error(`Unsupported targetChain: ${targetChain}`);
  }

  return chainConfig;
};

/**
 * Determines which chains receive the attestation write based on writeMode and decision.
 *
 * @param config Workflow runtime config.
 * @param targetChain Primary target chain from request payload.
 * @param decision Final decision (`approved` or `rejected`).
 * @returns List of chain targets to write to.
 */
export const resolveWriteTargets = (
  config: Config,
  targetChain: ChainSelectorName,
  decision: Decision,
): ChainConfig[] => {
  const primaryTarget = resolveChainConfig(config, targetChain);

  if (config.writeMode === "single") {
    return [primaryTarget];
  }

  if (config.writeMode === "dual_on_approve" && decision === "rejected") {
    return [primaryTarget];
  }

  return config.chains;
};

const callRegistryBool = (
  runtime: Runtime<Config>,
  chainConfig: ChainConfig,
  functionName: "usedRequestIdHashes" | "usedNullifierHashes",
  value: Hex,
): boolean => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: chainConfig.chainSelectorName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(
      `Network metadata not found for chainSelectorName=${chainConfig.chainSelectorName}`,
    );
  }

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);
  const data = encodeFunctionData({
    abi: REGISTRY_ABI,
    functionName,
    args: [value],
  });

  const response = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: ZERO_ADDRESS,
        to: chainConfig.registryAddress as Address,
        data,
      }),
      // Use latest block so replays are detected immediately after a broadcast.
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result();

  const decoded = decodeFunctionResult({
    abi: REGISTRY_ABI,
    functionName,
    data: bytesToHex(response.data),
  });

  return Boolean(decoded);
};

/**
 * Checks whether a requestIdHash or nullifierHash has already been used onchain.
 *
 * @param runtime CRE runtime instance.
 * @param chainConfig Chain write configuration.
 * @param requestIdHash Hashed request identifier.
 * @param nullifierHash World ID nullifier hash.
 * @returns Replay status for the target chain.
 */
export const checkReplayStatus = (
  runtime: Runtime<Config>,
  chainConfig: ChainConfig,
  requestIdHash: Hex,
  nullifierHash: Hex,
): ReplayStatus => ({
  requestIdUsed: callRegistryBool(
    runtime,
    chainConfig,
    "usedRequestIdHashes",
    requestIdHash,
  ),
  nullifierUsed: callRegistryBool(
    runtime,
    chainConfig,
    "usedNullifierHashes",
    nullifierHash,
  ),
});

/**
 * Writes a signed CRE report to a configured passport registry contract.
 *
 * @param runtime CRE runtime instance.
 * @param chainConfig Chain write configuration.
 * @param report Signed CRE report object.
 * @returns Normalized chain write result.
 * @throws Error on fatal write failures.
 */
export const writePassportStamp = (
  runtime: Runtime<Config>,
  chainConfig: ChainConfig,
  report: ReturnType<Runtime<Config>["report"]> extends { result: () => infer T }
    ? T
    : never,
): ChainWriteResult => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: chainConfig.chainSelectorName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(
      `Network metadata not found for chainSelectorName=${chainConfig.chainSelectorName}`,
    );
  }

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);
  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: chainConfig.registryAddress,
      report,
      gasConfig: {
        gasLimit: chainConfig.gasLimit,
      },
    })
    .result();

  const txHash = writeResult.txHash ? bytesToHex(writeResult.txHash) : undefined;

  if (writeResult.txStatus === TxStatus.SUCCESS) {
    return {
      chainSelectorName: chainConfig.chainSelectorName,
      receiver: chainConfig.registryAddress,
      txStatus: "success",
      ...(txHash ? { txHash } : {}),
    };
  }

  if (writeResult.txStatus === TxStatus.REVERTED) {
    return {
      chainSelectorName: chainConfig.chainSelectorName,
      receiver: chainConfig.registryAddress,
      txStatus: "reverted",
      errorMessage: writeResult.errorMessage || "EVM_WRITE_REVERTED",
      ...(txHash ? { txHash } : {}),
    };
  }

  throw new Error(
    `Fatal writeReport failure on ${chainConfig.chainSelectorName}: ${writeResult.errorMessage || "unknown fatal error"}`,
  );
};
