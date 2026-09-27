// Reconnect and rollover policy (brief §8.7), pure and unit-tested.
//
// - After an unexpected drop: fetch a fresh token each attempt (tokens are
//   single-use). Try session.resume while inside the 30 s grace window and no
//   resume has failed yet; otherwise start a fresh session with the reconnect
//   config. Probes showed resume always failing (NOTES C5), so the fresh
//   session is the path that has to work.
// - Backoff 1, 2, 4, 8 s, then every 8 s, up to MAX_RECONNECT_ATTEMPTS
//   (≈ 70 s, long enough to ride out a Wi-Fi blip), then a manual Retry.
// - Retryable session.error codes use the brief's 1/2/4/8 s, max 4 attempts.

export const RESUME_GRACE_MS = 30_000;
export const MAX_RECONNECT_ATTEMPTS = 10;
export const MAX_RETRYABLE_ATTEMPTS = 4;
export const ROLLOVER_LEAD_MS = 5 * 60_000;

/** Delay before reconnect attempt n (0-based). */
export function backoffMs(attempt: number): number {
  return Math.min(8_000, 1_000 * 2 ** Math.max(0, attempt));
}

export type ReconnectMode = "resume" | "fresh";

export function chooseMode(input: { sessionId: string | null; droppedAt: number; now: number; resumeFailed: boolean }): ReconnectMode {
  if (!input.sessionId || input.resumeFailed) return "fresh";
  return input.now - input.droppedAt < RESUME_GRACE_MS ? "resume" : "fresh";
}

export const RESUME_FAILURE_CODES = new Set(["session_not_found", "session_forbidden", "session_expired"]);

/**
 * When to roll over to a new session before the server's hard cap
 * (expires_at, epoch seconds). Normally 5 minutes before expiry; for short
 * sessions (testing) halfway through.
 */
export function rolloverAt(readyAtMs: number, expiresAtSec: number): number {
  const expiresMs = expiresAtSec * 1000;
  const lead = Math.min(ROLLOVER_LEAD_MS, (expiresMs - readyAtMs) / 2);
  return expiresMs - lead;
}
