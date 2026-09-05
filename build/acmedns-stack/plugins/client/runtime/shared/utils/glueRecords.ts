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

/** Normalise SOA RNAME (hostmaster@zone → hostmaster.zone). */
export function normalizeSoaRname(nsadmin: string, fallbackZone: string) {
  const raw = nsadmin.trim() || `hostmaster@${fallbackZone}`
  return normalizeZoneFqdn(raw.replace('@', '.'))
}

/** Auth-zone glue: apex A (+ optional AAAA) + NS + SOA (SOA is also synthesised at query time). */
export function authZoneGlueRecords(
  domain: string,
  addresses: AuthZoneGlueAddresses | string,
  nsname?: string,
  nsadmin?: string,
) {
  const fqdn = normalizeZoneFqdn(domain)
  const ns = normalizeZoneFqdn(nsname || domain)
  const rname = normalizeSoaRname(nsadmin || '', fqdn)
  const resolved = normalizeAddresses(addresses)
  const lines: string[] = []

  // Serial/timers match dns/server.ts soaRecord(); live answers still use a date-based serial.
  lines.push(`${fqdn}. SOA ${ns}. ${rname}. 1 28800 7200 604800 86400`)
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
  nsadmin?: string,
) {
  const fqdn = normalizeZoneFqdn(domain)
  const ns = normalizeZoneFqdn(nsname || domain)
  const rname = normalizeSoaRname(nsadmin || '', fqdn)
  const want = normalizeAddresses(addresses)
  let hasA = !want.ipv4
  let hasAaaa = !want.ipv6
  let hasNs = false
  let hasSoa = false

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
    if (parsed.type === 'SOA' && parsed.name === fqdn) {
      const soaParts = parsed.value.split(/\s+/)
      const primary = normalizeZoneFqdn(soaParts[0] || '')
      const admin = normalizeZoneFqdn(soaParts[1] || '')
      if (primary === ns && admin === rname) {
        hasSoa = true
      }
    }
  }

  return hasA && hasAaaa && hasNs && hasSoa
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

export function formatGlueRecordLog(
  domain: string,
  addresses: AuthZoneGlueAddresses | string,
  nsadmin?: string,
) {
  const fqdn = normalizeZoneFqdn(domain)
  const rname = normalizeSoaRname(nsadmin || '', fqdn)
  const resolved = normalizeAddresses(addresses)
  const parts = [`${fqdn}. SOA ${fqdn}. ${rname}.`]
  if (resolved.ipv4) {
    parts.push(`${fqdn}. A ${resolved.ipv4}.`)
  }
  if (resolved.ipv6) {
    parts.push(`${fqdn}. AAAA ${resolved.ipv6}.`)
  }
  parts.push(`${fqdn}. NS ${fqdn}.`)
  return parts.join(' ; ')
}
