import type { ProviderDecision } from "../types.js";

const MAX_REASON_CODE_LENGTH = 64;

/**
 * Converts arbitrary provider messages into stable uppercase reason codes.
 *
 * @param value Raw provider message.
 * @returns Sanitized reason code.
 */
export const toReasonCode = (value: string): string => {
  const sanitized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!sanitized) {
    return "UNSPECIFIED_REASON";
  }

  return sanitized.slice(0, MAX_REASON_CODE_LENGTH);
};

/**
 * Deduplicates and normalizes reason codes.
 *
 * @param codes Raw reason codes.
 * @returns Normalized unique reason code list.
 */
export const normalizeReasonCodes = (codes: string[]): string[] => {
  const deduped = new Set<string>();

  for (const code of codes) {
    deduped.add(toReasonCode(code));
  }

  return [...deduped];
};

/**
 * Builds a normalized approved decision object.
 *
 * @param reasonCodes Decision reason codes.
 * @param ttlSeconds Optional TTL override.
 * @param source Decision source label.
 * @returns Provider decision object.
 */
export const approvedDecision = (
  reasonCodes: string[] = [],
  ttlSeconds?: number,
  source: ProviderDecision["source"] = "mock",
): ProviderDecision => ({
  decision: "approved",
  reasonCodes: normalizeReasonCodes(reasonCodes),
  ttlSeconds,
  source,
});

/**
 * Builds a normalized rejected decision object.
 *
 * @param reasonCodes Decision reason codes.
 * @param ttlSeconds Optional TTL override.
 * @param source Decision source label.
 * @returns Provider decision object.
 */
export const rejectedDecision = (
  reasonCodes: string[],
  ttlSeconds?: number,
  source: ProviderDecision["source"] = "mock",
): ProviderDecision => ({
  decision: "rejected",
  reasonCodes: normalizeReasonCodes(reasonCodes),
  ttlSeconds,
  source,
});
