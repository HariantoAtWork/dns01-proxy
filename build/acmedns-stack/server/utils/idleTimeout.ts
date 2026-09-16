/**
 * Bun.serve `idleTimeout` is in **seconds** (runtime default 10, max 255).
 * Edge reverse-proxy streaming and control SSE (`/api/certs/stream`) need a higher
 * floor or clients see blank/cut pages / ERR_INCOMPLETE_CHUNKED_ENCODING.
 *
 * Env: `NITRO_BUN_IDLE_TIMEOUT`
 * - unset → edge + control 120s
 * - `0` → Bun default for that server
 * - `1`–`255` → clamped value
 */
export const DEFAULT_EDGE_IDLE_TIMEOUT_SECONDS = 120
export const DEFAULT_CONTROL_IDLE_TIMEOUT_SECONDS = 120

export function resolveIdleTimeoutSeconds(role: 'edge' | 'control'): number | undefined {
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
      return undefined
    }
    return Math.min(255, parsed)
  }
  return fallback
}
