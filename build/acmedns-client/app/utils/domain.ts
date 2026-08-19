const DOMAIN_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-_.]+\.[a-zA-Z]{2,}$/
const URL_PATTERN = /^https?:\/\/.+/

export function isValidDomain(value: string) {
  return DOMAIN_PATTERN.test(value.trim())
}

export function isValidHttpUrl(value: string) {
  if (!URL_PATTERN.test(value.trim())) {
    return false
  }

  try {
    const parsed = new URL(value.trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  }
  catch {
    return false
  }
}

export function challengeName(domain: string) {
  return `_acme-challenge.${domain.trim()}`
}

export function zoneCnameLine(domain: string, fulldomain: string) {
  const host = challengeName(domain)
  const target = fulldomain.replace(/\.$/, '')
  return `${host}. IN CNAME ${target}.`
}
