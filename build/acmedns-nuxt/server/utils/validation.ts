const SAFE_RE = /[^A-Za-z\-\_0-9]+/g
const SUBDOMAIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function sanitizeString(value: string): string {
  return value.replace(SAFE_RE, '')
}

export function sanitizeIPv6addr(value: string): string {
  return value.replace(/[\[\]]+/g, '')
}

export function sanitizeDomainQuestion(name: string): string {
  const lower = name.toLowerCase().replace(/\.$/, '')
  const firstDot = lower.indexOf('.')
  if (firstDot > 0) {
    return lower.slice(0, firstDot)
  }
  return lower
}

export function getValidUsername(username: string): string {
  if (!UUID_RE.test(username)) {
    throw new Error(`Invalid username: ${username}`)
  }
  return username.toLowerCase()
}

export function validKey(key: string): boolean {
  const cleaned = sanitizeString(key)
  return key.length === 40 && cleaned.length === 40
}

export function validSubdomain(subdomain: string): boolean {
  return SUBDOMAIN_RE.test(subdomain)
}

export function validTXT(txt: string): boolean {
  const cleaned = sanitizeString(txt)
  return txt.length === 43 && cleaned.length === 43
}

export function jsonError(message: string) {
  return { error: message }
}

const PASSWORD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890-_'

export function generatePassword(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let out = ''
  for (let i = 0; i < length; i++) {
    out += PASSWORD_ALPHABET[bytes[i]! % PASSWORD_ALPHABET.length]!
  }
  return out
}

/** Parse CIDR (IPv4 or IPv6) and test membership. Empty allow list ⇒ allow all. */
export function ipInCidrs(ip: string, cidrs: string[]): boolean {
  if (cidrs.length === 0) {
    return true
  }
  for (const cidr of cidrs) {
    if (ipMatchesCidr(ip, sanitizeIPv6addr(cidr))) {
      return true
    }
  }
  return false
}

function ipMatchesCidr(ip: string, cidr: string): boolean {
  const slash = cidr.indexOf('/')
  if (slash < 0) {
    return false
  }
  const base = cidr.slice(0, slash)
  const prefix = Number(cidr.slice(slash + 1))
  if (!Number.isFinite(prefix)) {
    return false
  }

  if (base.includes(':') || ip.includes(':')) {
    return ipv6Matches(ip, base, prefix)
  }
  return ipv4Matches(ip, base, prefix)
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) {
    return null
  }
  let n = 0
  for (const part of parts) {
    const octet = Number(part)
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      return null
    }
    n = (n << 8) + octet
  }
  return n >>> 0
}

function ipv4Matches(ip: string, base: string, prefix: number): boolean {
  if (prefix < 0 || prefix > 32) {
    return false
  }
  const ipInt = ipv4ToInt(ip)
  const baseInt = ipv4ToInt(base)
  if (ipInt === null || baseInt === null) {
    return false
  }
  if (prefix === 0) {
    return true
  }
  const mask = prefix === 32 ? 0xffffffff : (~0 << (32 - prefix)) >>> 0
  return (ipInt & mask) === (baseInt & mask)
}

function parseIpv6(ip: string): Uint8Array | null {
  const cleaned = sanitizeIPv6addr(ip).toLowerCase()
  if (!cleaned.includes(':')) {
    return null
  }

  // Handle IPv4-mapped tails (e.g. ::ffff:127.0.0.1) by expanding the v4 part
  let input = cleaned
  if (input.includes('.')) {
    const lastColon = input.lastIndexOf(':')
    const v4 = input.slice(lastColon + 1)
    const v4Int = ipv4ToInt(v4)
    if (v4Int === null) {
      return null
    }
    const hi = (v4Int >>> 16) & 0xffff
    const lo = v4Int & 0xffff
    input = `${input.slice(0, lastColon)}:${hi.toString(16)}:${lo.toString(16)}`
  }

  const sides = input.split('::')
  if (sides.length > 2) {
    return null
  }

  const head = sides[0] ? sides[0].split(':').filter(Boolean) : []
  const tail = sides.length === 2 && sides[1] ? sides[1].split(':').filter(Boolean) : []
  if (head.length + tail.length > 8) {
    return null
  }

  const missing = 8 - head.length - (sides.length === 2 ? tail.length : 0)
  const groups: number[] = []
  for (const g of head) {
    const n = Number.parseInt(g, 16)
    if (!Number.isFinite(n) || n < 0 || n > 0xffff) {
      return null
    }
    groups.push(n)
  }
  if (sides.length === 2) {
    for (let i = 0; i < missing; i++) {
      groups.push(0)
    }
    for (const g of tail) {
      const n = Number.parseInt(g, 16)
      if (!Number.isFinite(n) || n < 0 || n > 0xffff) {
        return null
      }
      groups.push(n)
    }
  }

  if (groups.length !== 8) {
    return null
  }

  const out = new Uint8Array(16)
  for (let i = 0; i < 8; i++) {
    out[i * 2] = (groups[i]! >> 8) & 0xff
    out[i * 2 + 1] = groups[i]! & 0xff
  }
  return out
}

function ipv6Matches(ip: string, base: string, prefix: number): boolean {
  if (prefix < 0 || prefix > 128) {
    return false
  }
  const ipBytes = parseIpv6(ip)
  const baseBytes = parseIpv6(base)
  if (!ipBytes || !baseBytes) {
    return false
  }
  let remaining = prefix
  for (let i = 0; i < 16; i++) {
    if (remaining >= 8) {
      if (ipBytes[i] !== baseBytes[i]) {
        return false
      }
      remaining -= 8
    }
    else if (remaining > 0) {
      const mask = (0xff << (8 - remaining)) & 0xff
      if ((ipBytes[i]! & mask) !== (baseBytes[i]! & mask)) {
        return false
      }
      remaining = 0
    }
    else {
      break
    }
  }
  return true
}

export function validateCidrList(cidrs: string[]): void {
  for (const cidr of cidrs) {
    const cleaned = sanitizeIPv6addr(cidr)
    const slash = cleaned.indexOf('/')
    if (slash < 0) {
      throw new Error('invalid_allowfrom_cidr')
    }
    const base = cleaned.slice(0, slash)
    const prefix = Number(cleaned.slice(slash + 1))
    if (!Number.isFinite(prefix)) {
      throw new Error('invalid_allowfrom_cidr')
    }
    if (base.includes(':')) {
      if (!parseIpv6(base) || prefix < 0 || prefix > 128) {
        throw new Error('invalid_allowfrom_cidr')
      }
    }
    else if (ipv4ToInt(base) === null || prefix < 0 || prefix > 32) {
      throw new Error('invalid_allowfrom_cidr')
    }
  }
}

export function validCidrEntries(cidrs: string[]): string[] {
  const valid: string[] = []
  for (const cidr of cidrs) {
    try {
      validateCidrList([cidr])
      valid.push(sanitizeIPv6addr(cidr))
    }
    catch {
      // skip invalid
    }
  }
  return valid
}
