import { envAuthDomain } from '../../core/env'
import { getAcmeConfig } from '../utils/config'

function normalizeHost(value: string): string {
  return value.replace(/\.$/, '').toLowerCase().trim()
}

/** Hostnames that must never be used as ProxyHost domainNames / edge proxy targets. */
export function getReservedHostnames(): string[] {
  const hosts = new Set<string>()
  try {
    const zone = getAcmeConfig().general.domain
    if (zone) {
      hosts.add(normalizeHost(zone))
    }
  }
  catch {
    // Config may be unavailable in unit tests — env-only still applies.
  }
  const auth = envAuthDomain()
  if (auth) {
    hosts.add(normalizeHost(auth))
  }
  return [...hosts].filter(Boolean)
}

export function isReservedHostname(hostname: string): boolean {
  const host = normalizeHost(hostname)
  if (!host) {
    return false
  }
  return getReservedHostnames().includes(host)
}

export function findReservedDomainOverlap(domainNames: string[]): string[] {
  const reserved = new Set(getReservedHostnames())
  return domainNames
    .map(normalizeHost)
    .filter(name => reserved.has(name))
}
