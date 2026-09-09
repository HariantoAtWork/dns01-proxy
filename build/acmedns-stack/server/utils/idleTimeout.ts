/**
 * Bun.serve `idleTimeout` is in **seconds** (runtime default 10, max 255).
 * Edge reverse-proxy streaming needs a higher floor or clients see blank/cut pages.
 *
 * Env: `NITRO_BUN_IDLE_TIMEOUT`
 * - unset → edge 120s, control Bun default
 * - `0` → Bun default for that server
 * - `1`–`255` → clamped value
 */
export const DEFAULT_EDGE_IDLE_TIMEOUT_SECONDS = 120

export function resolveIdleTimeoutSeconds(role: 'edge' | 'control'): number | undefined {
  const raw = process.env.NITRO_BUN_IDLE_TIMEOUT
  if (raw !== undefined && raw.trim() !== '') {
    const parsed = Number.parseInt(raw, 10)
    if (!Number.isFinite(parsed) || parsed < 0) {
      return role === 'edge' ? DEFAULT_EDGE_IDLE_TIMEOUT_SECONDS : undefined
    }
    if (parsed === 0) {
      return undefined
    }
    return Math.min(255, parsed)
  }
  return role === 'edge' ? DEFAULT_EDGE_IDLE_TIMEOUT_SECONDS : undefined
}
