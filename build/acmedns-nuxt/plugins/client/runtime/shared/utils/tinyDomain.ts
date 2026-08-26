/** Normalise ACMEDNS_TINY_DOMAIN (hostname only, no scheme or trailing dot). */
export function normalizeTinyDomain(raw: string): string {
  let value = raw.trim()
  if (!value) {
    return ''
  }

  if (value.includes('://')) {
    try {
      value = new URL(value).hostname
    }
    catch {
      return ''
    }
  }

  value = value.split('/')[0] ?? value
  return value.replace(/\.$/, '').toLowerCase()
}

export function tinyDomainFromEnv(): string {
  return normalizeTinyDomain(process.env.ACMEDNS_TINY_DOMAIN || '')
}

export function defaultAcmednsUrlForTinyDomain(domain: string): string {
  const host = normalizeTinyDomain(domain)
  if (!host) {
    return ''
  }
  return `https://${host}`
}
