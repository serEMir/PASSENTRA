import { z } from "zod";

// Shared primitive validators for external-facing payloads.
export const evmAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Expected a valid EVM address");

export const chainSelectorSchema = z.enum([
  "ethereum-testnet-sepolia",
  "ethereum-testnet-sepolia-arbitrum-1",
]);

export const decisionSchema = z.enum(["approved", "rejected"]);
export const credentialTypeSchema = z.enum(["retail", "accredited", "institution"]);
export const writeModeSchema = z.enum(["single", "dual_on_approve", "dual_always"]);
export const verificationLevelSchema = z.enum(["orb", "device"]);

export const chainConfigSchema = z.object({
  chainSelectorName: chainSelectorSchema,
  registryAddress: evmAddressSchema,
  gasLimit: z
    .string()
    .regex(/^[1-9][0-9]*$/, "gasLimit must be a positive integer string"),
});

// Workflow runtime configuration loaded by CRE Runner.
export const configSchema = z
  .object({
    policyVersion: z.string().min(1),
    defaultTtlSeconds: z.number().int().positive(),
    enableOnchainWrite: z.boolean(),
    writeMode: writeModeSchema,
    chains: z.array(chainConfigSchema).min(1),
    worldId: z.object({
      verifyUrlTemplate: z.string().min(1),
      rpId: z.string().min(1),
      apiKeySecretId: z.string().min(1),
      vaultNamespace: z.string().min(1),
      vaultOwner: z.string().optional(),
    }),
    compliance: z.object({
      mode: z.enum(["adapter", "mock"]),
      adapterUrl: z.string().min(1),
      apiKeySecretId: z.string().min(1),
      vaultNamespace: z.string().min(1),
      vaultOwner: z.string().optional(),
      fallbackDecision: decisionSchema,
      fallbackReasonCodes: z.array(z.string()),
    }),
  });

export const worldProofV4ResponseSchema = z
  .object({
    // e.g. "orb", "device", or credential identifiers in World ID 4.0 responses.
    identifier: z.string().min(1),
    nullifier: z.string().min(1),
    proof: z.union([z.string().min(1), z.array(z.string().min(1))]),
    merkle_root: z.string().min(1).optional(),
    signal_hash: z.string().min(1).optional(),
    max_age: z.number().int().positive().optional(),
    issuer_schema_id: z.number().int().positive().optional(),
    expires_at_min: z.number().int().positive().optional(),
  })
  .passthrough();

export const worldProofV4Schema = z
  .object({
    protocol_version: z.string().min(1),
    nonce: z.string().min(1),
    action: z.string().min(1),
    action_description: z.string().optional(),
    environment: z.string().optional(),
    responses: z.array(worldProofV4ResponseSchema).min(1),
  })
  .passthrough();

export const activatePassportRequestSchema = z
  .object({
    requestId: z.string().min(1),
    userAddress: evmAddressSchema.transform((value) => value.toLowerCase()),
    targetChain: chainSelectorSchema,
    countryCode: z
      .string()
      .length(2, "countryCode must be an ISO-3166 alpha-2 code")
      .transform((value) => value.toUpperCase()),
    credentialType: credentialTypeSchema,
    worldProofV4: worldProofV4Schema,
  });

/**
 * Compliance adapter response contract consumed by workflow logic.
 */
export const complianceAdapterResponseSchema = z
  .object({
    decision: decisionSchema,
    reasonCodes: z.array(z.string()).default([]),
    ttlSeconds: z.number().int().positive().optional(),
  })
  .passthrough();

/**
 * World ID 4.0 verification API response consumed by workflow logic.
 */
export const worldIdV4AdapterResponseSchema = z
  .object({
    success: z.boolean().optional(),
    code: z.string().optional(),
    detail: z.string().optional(),
    message: z.string().optional(),
    results: z
      .array(
        z
          .object({
            identifier: z.string().optional(),
            success: z.boolean().optional(),
            code: z.string().optional(),
            detail: z.string().optional(),
            nullifier: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

/** Fully validated workflow config shape. */
export type Config = z.infer<typeof configSchema>;
/** Supported chain selector names for this workflow. */
export type ChainSelectorName = z.infer<typeof chainSelectorSchema>;
/** Single chain write configuration block. */
export type ChainConfig = z.infer<typeof chainConfigSchema>;
/** Decision enum used throughout the pipeline. */
export type Decision = z.infer<typeof decisionSchema>;
/** World ID verification level normalized for policy checks. */
export type VerificationLevel = z.infer<typeof verificationLevelSchema>;
/** Parsed activation request payload type. */
export type ActivatePassportRequest = z.infer<typeof activatePassportRequestSchema>;
