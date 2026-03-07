import { z } from "zod";

// Shared schemas keep API contracts explicit at runtime and compile-time.
const evmAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Expected a valid EVM address");
const bytes32HexSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "Expected a bytes32 hex value");

export const decisionSchema = z.enum(["approved", "rejected"]);
export const credentialTypeSchema = z.enum(["retail", "accredited", "institution"]);
export const verificationLevelSchema = z.enum(["orb", "device"]);

/**
 * Request contract accepted by `POST /v1/compliance/evaluate`.
 */
export const complianceEvaluateRequestSchema = z.object({
  requestId: z.string().min(1),
  userAddress: evmAddressSchema.transform((value) => value.toLowerCase()),
  targetChain: z.string().min(1),
  countryCode: z
    .string()
    .length(2, "countryCode must be ISO-3166 alpha-2")
    .transform((value) => value.toUpperCase()),
  credentialType: credentialTypeSchema,
  worldId: z.object({
    verified: z.boolean(),
    nullifierHash: bytes32HexSchema,
    verificationLevel: verificationLevelSchema,
  }),
});

/**
 * Response contract returned by `POST /v1/compliance/evaluate`.
 */
export const complianceEvaluateResponseSchema = z.object({
  decision: decisionSchema,
  reasonCodes: z.array(z.string()),
  ttlSeconds: z.number().int().positive().optional(),
});

export type ComplianceEvaluateRequest = z.infer<typeof complianceEvaluateRequestSchema>;
export type ComplianceEvaluateResponse = z.infer<typeof complianceEvaluateResponseSchema>;

/** Provider-level normalized decision shape used by route orchestration. */
export type ProviderDecision = {
  decision: z.infer<typeof decisionSchema>;
  reasonCodes: string[];
  ttlSeconds?: number;
  // Source is included for observability and debugging.
  source: "mock" | "fallback";
};
