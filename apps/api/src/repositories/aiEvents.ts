import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { AiError } from "../services/ai.js";

export type AiKind = "tag" | "outfit";

/**
 * Runs an AI call and records outcome + latency in ai_events for the admin dashboard.
 * Logging never affects the user request: a failed insert is only reported to the console.
 */
export async function trackAi<T>(userId: string, kind: AiKind, fn: () => Promise<T>): Promise<T> {
  const started = performance.now();
  let ok = false;
  let statusCode: number | null = null;
  let error: string | null = null;
  try {
    const result = await fn();
    ok = true;
    return result;
  } catch (err) {
    statusCode = err instanceof AiError ? err.statusCode : 500;
    error = err instanceof Error ? err.message.slice(0, 500) : "unknown";
    throw err;
  } finally {
    pool
      .query(
        `INSERT INTO ai_events (user_id, kind, model, ok, status_code, error, latency_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, kind, config.GEMINI_MODEL, ok, statusCode, error, Math.round(performance.now() - started)],
      )
      .catch((err) => console.error("ai_events insert failed", err));
  }
}
