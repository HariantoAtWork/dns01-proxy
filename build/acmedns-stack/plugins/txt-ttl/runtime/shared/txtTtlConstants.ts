/** Let's Encrypt names-per-certificate cap; matches acme-dns slot count. */
export const TXT_RECORD_SLOTS = 100

export const DEFAULT_TXT_TTL_SECONDS = 300

export function resolveTxtTtlSeconds(): number {
  const value = Number(process.env.ACME_TXT_TTL_SECONDS)
  if (Number.isFinite(value) && value > 0) {
    return value
  }
  return DEFAULT_TXT_TTL_SECONDS
}
