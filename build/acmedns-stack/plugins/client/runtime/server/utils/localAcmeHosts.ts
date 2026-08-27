import os from 'node:os'

const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '::1'] as const

export function normalizeAcmeHost(host: string): string {
  return host.replace(/\.$/, '').toLowerCase()
}

let cachedInternalHosts: Set<string> | undefined

/** Reset cached host set (tests only). */
export function resetInternalAcmeDnsHostsCache() {
  cachedInternalHosts = undefined
}

export function internalAcmeDnsHosts(): Set<string> {
  if (cachedInternalHosts) {
    return cachedInternalHosts
  }

  const hosts = new Set<string>(LOOPBACK_HOSTS)

  const sysHost = normalizeAcmeHost(os.hostname())
  if (sysHost) {
    hosts.add(sysHost)
  }

  cachedInternalHosts = hosts
  return hosts
}

/** Loopback and container/process hostname. */
export function isInternalAcmeDnsHost(host: string): boolean {
  if (!host) {
    return false
  }
  return internalAcmeDnsHosts().has(normalizeAcmeHost(host))
}
