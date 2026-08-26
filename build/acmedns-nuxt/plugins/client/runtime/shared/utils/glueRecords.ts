/** RFC 5737 documentation IPv4 — common placeholder in seed configs. */
export const PLACEHOLDER_PUBLIC_IPV4 = '198.51.100.1'

export interface AuthZoneGlueAddresses {
  ipv4?: string
  ipv6?: string
}

export function normalizeZoneFqdn(value: string) {
  return value.trim().replace(/\.$/, '').toLowerCase()
}

function normalizeAddresses(input: AuthZoneGlueAddresses | string): AuthZoneGlueAddresses {
  if (typeof input === 'string') {
    return { ipv4: input.trim() }
  }
  return {
    ipv4: input.ipv4?.trim() || '',
    ipv6: input.ipv6?.trim() || '',
  }
}

/** Auth-zone glue: apex A (+ optional AAAA) + NS. */
export function authZoneGlueRecords(
  domain: string,
  addresses: AuthZoneGlueAddresses | string,
  nsname?: string,
) {
  const fqdn = normalizeZoneFqdn(domain)
  const ns = normalizeZoneFqdn(nsname || domain)
  const resolved = normalizeAddresses(addresses)
  const lines: string[] = []

  if (resolved.ipv4) {
    lines.push(`${fqdn}. A ${resolved.ipv4}`)
  }
  if (resolved.ipv6) {
    lines.push(`${fqdn}. AAAA ${resolved.ipv6}`)
  }
  lines.push(`${ns}. NS ${ns}.`)

  return lines
}

function parseRecordLine(raw: string) {
  const parts = raw.trim().split(/\s+/)
  if (parts.length < 3) {
    return null
  }
  return {
    name: normalizeZoneFqdn(parts[0]!),
    type: parts[1]!.toUpperCase(),
    value: parts.slice(2).join(' ').replace(/\.$/, '').toLowerCase(),
  }
}

export function glueRecordsMatchDomain(
  records: string[],
  domain: string,
  nsname?: string,
  addresses: AuthZoneGlueAddresses = {},
) {
  const fqdn = normalizeZoneFqdn(domain)
  const ns = normalizeZoneFqdn(nsname || domain)
  const want = normalizeAddresses(addresses)
  let hasA = !want.ipv4
  let hasAaaa = !want.ipv6
  let hasNs = false

  for (const raw of records) {
    const parsed = parseRecordLine(raw)
    if (!parsed) {
      continue
    }
    if (parsed.type === 'A' && parsed.name === fqdn) {
      hasA = true
    }
    if (parsed.type === 'AAAA' && parsed.name === fqdn) {
      hasAaaa = true
    }
    if (parsed.type === 'NS' && parsed.name === ns && parsed.value === ns) {
      hasNs = true
    }
  }

  return hasA && hasAaaa && hasNs
}

export function recordsUsePlaceholderIp(records: string[]) {
  return records.some((raw) => {
    const parsed = parseRecordLine(raw)
    return parsed?.type === 'A' && parsed.value === PLACEHOLDER_PUBLIC_IPV4
  })
}

export function recordsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false
  }
  return left.every((line, index) => line.trim() === right[index]!.trim())
}

export function formatGlueRecordLog(domain: string, addresses: AuthZoneGlueAddresses | string) {
  const fqdn = normalizeZoneFqdn(domain)
  const resolved = normalizeAddresses(addresses)
  const parts = [`${fqdn}. NS ${fqdn}.`]
  if (resolved.ipv4) {
    parts.unshift(`${fqdn}. A ${resolved.ipv4}.`)
  }
  if (resolved.ipv6) {
    parts.splice(resolved.ipv4 ? 1 : 0, 0, `${fqdn}. AAAA ${resolved.ipv6}.`)
  }
  return parts.join(' ; ')
}
