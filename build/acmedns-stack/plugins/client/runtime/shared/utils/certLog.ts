import type { CertActivitySource, LetsEncryptDirectoryMode } from '#shared/types/certs'

/** PEM tree label for console / activity log prefixes. */
export type CertLogTree = 'live' | 'staging'

export function certLogTree(mode: LetsEncryptDirectoryMode): CertLogTree {
  return mode === 'staging' ? 'staging' : 'live'
}

/** e.g. `[live/acme]` or `[cert-system]` when mode is omitted. */
export function formatCertActivityPrefix(
  source: CertActivitySource,
  mode?: LetsEncryptDirectoryMode,
): string {
  if (mode) {
    return `[${certLogTree(mode)}/${source}]`
  }
  return source === 'acme' ? '[acme]' : `[cert-${source}]`
}

/** UI label matching the console prefix (without brackets). */
export function certActivitySourceLabel(
  source: CertActivitySource,
  mode?: LetsEncryptDirectoryMode,
): string {
  if (mode) {
    return `${certLogTree(mode)}/${source}`
  }
  return source
}
