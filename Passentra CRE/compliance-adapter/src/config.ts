import { z } from "zod";

// Environment contract for the adapter runtime.
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  COMPLIANCE_ADAPTER_API_KEY: z.string().min(1),
  COMPLIANCE_DEFAULT_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
  COMPLIANCE_BLOCKED_COUNTRIES: z.string().optional().default(""),
});

export type AdapterConfig = {
  port: number;
  adapterApiKey: string;
  defaultTtlSeconds: number;
  blockedCountries: Set<string>;
};

/**
 * Loads and validates adapter configuration from environment variables.
 *
 * @returns Fully validated adapter config object.
 * @throws ZodError when required env vars are missing or malformed.
 */
export const loadConfig = (): AdapterConfig => {
  // Fail fast on startup if required env vars are missing or malformed.
  const env = envSchema.parse(process.env);

  // Country list is provided as a comma-separated env value.
  const blockedCountries = new Set(
    env.COMPLIANCE_BLOCKED_COUNTRIES.split(",")
      .map((value) => value.trim().toUpperCase())
      .filter((value) => value.length === 2),
  );

  return {
    port: env.PORT,
    adapterApiKey: env.COMPLIANCE_ADAPTER_API_KEY,
    defaultTtlSeconds: env.COMPLIANCE_DEFAULT_TTL_SECONDS,
    blockedCountries,
  };
};
