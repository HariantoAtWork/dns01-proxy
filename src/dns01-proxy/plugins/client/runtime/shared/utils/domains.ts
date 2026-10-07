import type { AcmeDnsCredentials, ClientStorageMap } from '#shared/types/clientstorage'

const APEX_RE = /^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$/

export function apexName(domain: string): string {
  if (domain.startsWith('*.')) {
    return domain.slice(2)
  }
  return domain
}

export function isValidDomainName(name: string): boolean {
  const stars = name.replace(/[^*]/g, '')
  if (stars.length > 1) {
    return false
  }
  const apex = apexName(name)
  if (name.includes('*') && !name.startsWith('*.')) {
    return false
  }
  return APEX_RE.test(apex)
}

export function impliedParentWildcards(name: string): string[] {
  if (!name.startsWith('*.')) {
    return []
  }
  const labels = name.slice(2).split('.')
  if (labels.length < 4) {
    return []
  }
  const result: string[] = []
  for (let i = 1; i < labels.length - 1; i += 1) {
    const suffixLabels = labels.slice(i)
    if (suffixLabels.length <= 2) {
      continue
    }
    result.push(`*.${suffixLabels.join('.')}`)
  }
  result.reverse()
  return result
}

function sanSortKey(name: string, apex: string): [number, number, string] {
  if (name === apex) {
    return [0, 0, name]
  }
  if (apex && name === `*.${apex}`) {
    return [1, 0, name]
  }
  return [2, apexName(name).split('.').length, name]
}

export function lineApex(names: string[]): string {
  const apexes = names.filter(Boolean).map(apexName)
  if (apexes.length === 0) {
    return ''
  }
  return apexes.reduce((best, host) => {
    const bestKey = [best.split('.').length, best] as const
    const hostKey = [host.split('.').length, host] as const
    if (hostKey[0] < bestKey[0] || (hostKey[0] === bestKey[0] && hostKey[1] < bestKey[1])) {
      return host
    }
    return best
  })
}

export function canonicalSans(names: string[]): string[] {
  const apex = lineApex(names)
  return [...names].sort((a, b) => {
    const ka = sanSortKey(a, apex)
    const kb = sanSortKey(b, apex)
    if (ka[0] !== kb[0]) {
      return ka[0] - kb[0]
    }
    if (ka[1] !== kb[1]) {
      return ka[1] - kb[1]
    }
    return ka[2] < kb[2] ? -1 : ka[2] > kb[2] ? 1 : 0
  })
}

export function expandLine(names: string[]): string[] {
  const seen = new Set<string>()
  const collected: string[] = []

  const add = (entry: string) => {
    if (entry && !seen.has(entry)) {
      seen.add(entry)
      collected.push(entry)
    }
  }

  for (const name of names) {
    add(name)
    for (const implied of impliedParentWildcards(name)) {
      add(implied)
    }
  }
  return canonicalSans(collected)
}

export function storageCandidates(domain: string): string[] {
  const host = apexName(domain)
  const labels = host.split('.')
  if (labels.length < 2) {
    return domain ? [domain] : []
  }

  const keys: string[] = []
  const seen = new Set<string>()
  for (let i = 0; i < labels.length - 1; i += 1) {
    const suffix = labels.slice(i).join('.')
    for (const key of [`*.${suffix}`, suffix]) {
      if (!seen.has(key)) {
        seen.add(key)
        keys.push(key)
      }
    }
  }
  return keys
}

/** Most-specific clientstorage row for a challenge host (any server_url). */
export function findAccount(
  storage: ClientStorageMap,
  domain: string,
): { key: string | null, account: AcmeDnsCredentials | null } {
  for (const key of storageCandidates(domain)) {
    const account = storage[key]
    if (account) {
      return { key, account }
    }
  }
  return { key: null, account: null }
}

export function challengeZones(names: string[]): string[] {
  const seen = new Set<string>()
  const zones: string[] = []
  for (const name of names) {
    const zone = apexName(name)
    if (!seen.has(zone)) {
      seen.add(zone)
      zones.push(zone)
    }
  }
  return zones
}
