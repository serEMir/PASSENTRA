import type {
  ChainSelectorName,
  Decision,
  VerificationLevel,
} from "./schema";

// Per-chain write outcome returned by the workflow callback.
export type ChainWriteResult = {
  chainSelectorName: ChainSelectorName;
  receiver: string;
  txStatus: "success" | "reverted" | "skipped";
  txHash?: string;
  errorMessage?: string;
};

/** Final response object emitted by the workflow callback. */
export type ActivatePassportResult = {
  requestId: string;
  userAddress: string;
  requestedTargetChain?: string;
  writeTargets: string[];
  worldIdVerified: boolean;
  decision: Decision;
  reasonCodes: string[];
  expiresAt?: number;
  stampStatus: "onchain_written" | "onchain_reverted" | "onchain_skipped";
  chainWrites: ChainWriteResult[];
};

// Transport input for POST JSON requests via ConfidentialHTTPClient.
export type PostJsonInput = {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  vaultDonSecrets?: Array<{
    key: string;
    namespace: string;
    owner?: string;
  }>;
};

export type PostJsonOutput = {
  statusCode: number;
  bodyText: string;
};

/** Normalized World ID verification status consumed by orchestration logic. */
export type WorldIdVerificationResult = {
  verified: boolean;
  reasonCodes: string[];
};

/** Canonical World ID attributes used by policy and attestation logic. */
export type WorldProofContext = {
  nullifierHash: string;
  verificationLevel: VerificationLevel;
};

/** Normalized compliance result consumed by orchestration logic. */
export type ComplianceResult = {
  decision: Decision;
  reasonCodes: string[];
  ttlSeconds: number;
  source: "adapter" | "fallback" | "mock";
};

/** Secret-backed HTTP service config used to build auth headers. */
export type SecretBackedServiceConfig = {
  apiKeySecretId: string;
  vaultNamespace: string;
  vaultOwner?: string;
};
