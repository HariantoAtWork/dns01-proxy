/** Let's Encrypt names-per-certificate cap; matches acme-dns slot count. */
export const TXT_RECORD_SLOTS = 100

/** Pause after TXT online before LE validate (`ACME_TXT_SETTLE_MS`; 0 disables). */
export const DEFAULT_TXT_SETTLE_MS = 5_000

/**
 * Extra ms to keep a challenge TXT slot after the settle window
 * (`ACME_TXT_HOLD_MS`). Store lifetime = settleMs + holdMs.
 */
export const DEFAULT_TXT_HOLD_MS = 300_000

/** Pause after TXT is visible online, before telling Let's Encrypt to validate. */
export function resolveAcmeTxtSettleMs(): number {
  const value = Number(process.env.ACME_TXT_SETTLE_MS)
  if (Number.isFinite(value) && value >= 0) {
    return value
  }
  return DEFAULT_TXT_SETTLE_MS
}

/** Extra retention after settle (`ACME_TXT_HOLD_MS`). */
export function resolveAcmeTxtHoldMs(): number {
  const holdMs = Number(process.env.ACME_TXT_HOLD_MS)
  if (Number.isFinite(holdMs) && holdMs > 0) {
    return Math.floor(holdMs)
  }
  return DEFAULT_TXT_HOLD_MS
}

/**
 * How long a published challenge TXT stays in the store (seconds, for the store API).
 * = ceil((settleMs + holdMs) / 1000) (settle may be 0).
 */
export function resolveTxtTtlSeconds(): number {
  return Math.max(1, Math.ceil((resolveAcmeTxtSettleMs() + resolveAcmeTxtHoldMs()) / 1000))
}
