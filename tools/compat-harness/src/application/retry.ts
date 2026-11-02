import type { Sleep } from "./ports.ts";

/**
 * Bounded retry with exponential backoff (CODING_PRINCIPLES §8.7: every retry has a limit and a
 * backoff).
 */
export interface RetryPolicy {
  /** Total attempts including the first one; at least 1. */
  readonly attempts: number;
  /** Delay before the second attempt; doubles after each failure. */
  readonly initialDelayMs: number;
}

/**
 * Run `operation` until it resolves or the attempts are used up; the last error is rethrown. Every
 * rejection is retried, so callers return non-retryable failures as values instead of throwing
 * them.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  policy: RetryPolicy,
  sleep: Sleep,
): Promise<T> {
  let delayMs = policy.initialDelayMs;
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= policy.attempts) {
        throw error;
      }
      await sleep(delayMs);
      delayMs *= 2;
    }
  }
}
