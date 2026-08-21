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

export const CHALLENGE_LABEL = '_acme-challenge'

export function challengeName(domain: string) {
  return `${CHALLENGE_LABEL}.${domain.trim()}`
}

export function stripTrailingDot(value: string) {
  return value.replace(/\.$/, '')
}

export function zoneCnameLine(domain: string, fulldomain: string) {
  const host = challengeName(domain)
  const target = stripTrailingDot(fulldomain)
  return `${host}. IN CNAME ${target}.`
}

/** Cloudflare Name field for zone `zone` (e.g. _acme-challenge.oib). */
export function cloudflareChallengeName(host: string, zone: string) {
  const fqdn = challengeName(host)
  const suffix = `.${zone.trim()}`
  if (fqdn === `${CHALLENGE_LABEL}${suffix}` || fqdn.endsWith(suffix)) {
    return fqdn.slice(0, -suffix.length)
  }
  return CHALLENGE_LABEL
}

export type CnameExample = {
  host: string
  name: string
  cloudflareName: string
  target: string
  covers: string
}

export function apexCnameExample(domain: string, fulldomain: string): CnameExample {
  const zone = domain.trim()
  return {
    host: zone,
    name: challengeName(zone),
    cloudflareName: cloudflareChallengeName(zone, zone),
    target: stripTrailingDot(fulldomain),
    covers: `${zone} and *.${zone}`,
  }
}

/**
 * Suffixes of a nested path under the apex (shallow first).
 * e.g. child.parent.grandparent → grandparent, parent.grandparent, child.parent.grandparent
 */
export function expandNestedPath(path: string): string[] {
  const parts = path.split('.').filter(Boolean)
  if (parts.length === 0) {
    return []
  }
  const result: string[] = []
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    result.push(parts.slice(i).join('.'))
  }
  return result
}

/** Unique nested paths after expanding every dotted input (shallow first). */
export function expandNestedLabels(labels: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const label of labels) {
    for (const path of expandNestedPath(label)) {
      if (seen.has(path)) {
        continue
      }
      seen.add(path)
      out.push(path)
    }
  }
  return out
}

export function nestedCnameExamples(apex: string, labels: readonly string[]): CnameExample[] {
  const zone = apex.trim()
  const apexChallenge = challengeName(zone)
  return expandNestedLabels(labels).map((label) => {
    const host = `${label}.${zone}`
    return {
      host,
      name: challengeName(host),
      cloudflareName: cloudflareChallengeName(host, zone),
      target: apexChallenge,
      covers: `*.${host}`,
    }
  })
}

const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const NESTED_PATH = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/

function isValidNestedPath(value: string) {
  if (!NESTED_PATH.test(value)) {
    return false
  }
  return value.split('.').every(segment => DNS_LABEL.test(segment))
}

/** Split a free-text list into unique nested paths (comma/space/semicolon; dots stay in the path). */
export function parseNestedLabels(raw: string): string[] {
  const seen = new Set<string>()
  const labels: string[] = []
  for (const part of raw.split(/[\s,;]+/)) {
    const label = part.trim().toLowerCase().replace(/^\*\./, '').replace(/\.$/, '')
    if (!label || !isValidNestedPath(label)) {
      continue
    }
    if (seen.has(label)) {
      continue
    }
    seen.add(label)
    labels.push(label)
  }
  return labels
}
