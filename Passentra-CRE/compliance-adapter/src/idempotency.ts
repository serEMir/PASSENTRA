import type { ComplianceEvaluateResponse } from "./types.js";

// In-memory idempotency cache keyed by requestId for deterministic retries.
export class RequestIdCache {
  private readonly decisions = new Map<string, ComplianceEvaluateResponse>();

  /**
   * Reads a cached compliance decision by requestId.
   *
   * @param requestId Idempotency key from incoming request.
   * @returns Cached response if present.
   */
  get(requestId: string): ComplianceEvaluateResponse | undefined {
    return this.decisions.get(requestId);
  }

  /**
   * Stores a deterministic response for a requestId.
   *
   * @param requestId Idempotency key from incoming request.
   * @param value Normalized compliance response to cache.
   */
  set(requestId: string, value: ComplianceEvaluateResponse): void {
    this.decisions.set(requestId, value);
  }
}
