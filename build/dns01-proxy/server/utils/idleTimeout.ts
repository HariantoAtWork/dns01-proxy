/**
 * Bun.serve `idleTimeout` is in **seconds** (omit → runtime default 10, max 255, `0` disables).
 * Edge reverse-proxy streaming and control SSE (`/api/certs/stream`) need a high
 * floor or clients see blank/cut pages / ERR_INCOMPLETE_CHUNKED_ENCODING.
 *
 * Env: `NITRO_BUN_IDLE_TIMEOUT`
 * - unset → edge + control 255s (Bun max; favours long streams / quiet SSE gaps)
 * - `0` → disable idle timeout (`idleTimeout: 0` — not Bun's 10s default)
 * - `1`–`255` → clamped value
 *
 * @see https://bun.com/docs/runtime/http/server#idletimeout
 */
export const DEFAULT_EDGE_IDLE_TIMEOUT_SECONDS = 255
export const DEFAULT_CONTROL_IDLE_TIMEOUT_SECONDS = 255

export function resolveIdleTimeoutSeconds(role: 'edge' | 'control'): number {
  const fallback = role === 'edge'
    ? DEFAULT_EDGE_IDLE_TIMEOUT_SECONDS
    : DEFAULT_CONTROL_IDLE_TIMEOUT_SECONDS
  const raw = process.env.NITRO_BUN_IDLE_TIMEOUT
  if (raw !== undefined && raw.trim() !== '') {
    const parsed = Number.parseInt(raw, 10)
    if (!Number.isFinite(parsed) || parsed < 0) {
      return fallback
    }
    if (parsed === 0) {
      return 0
    }
    return Math.min(255, parsed)
  }
  return fallback
}
