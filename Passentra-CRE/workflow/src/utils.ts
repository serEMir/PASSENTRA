/**
 * Normalizes provider messages into stable machine-readable reason codes.
 *
 * @param value Raw provider message or code.
 * @returns Uppercase alphanumeric reason code with underscore separators.
 */
export const toReasonCode = (value: string): string => {
  const sanitized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return sanitized.length > 0 ? sanitized : "UNSPECIFIED_REASON";
};
