import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ProxyHost, ProxyHostsFile, ProxyLocation } from '../../plugins/proxy/runtime/shared/types/proxyHost'
import {
  isWildcardDomainName,
  normalizeDomainName,
  normalizeProxyHostsFile,
  wildcardParentSuffix,
} from '../../plugins/proxy/runtime/shared/utils/proxyHost'
import { getLetsencryptDir, getProxyHostsFilePath } from '../../core/paths'
import { isReservedHostname } from './reserved'

export interface RouteMatch {
  host: ProxyHost
  /** Matched custom location, or null for the default forward target. */
  location: ProxyLocation | null
}

/** Exact hostname → host (e.g. `app.example.com`). */
let hostsByDomain = new Map<string, ProxyHost>()
/**
 * Wildcard parent suffix → host (e.g. `example.com` for `*.example.com`).
 * One-label DNS wildcards only; exact map always wins at match time.
 */
let hostsByWildcardSuffix = new Map<string, ProxyHost>()
let enabledHosts: ProxyHost[] = []

function hostnameFromHeader(hostHeader: string | null): string {
  if (!hostHeader) {
    return ''
  }
  const raw = hostHeader.trim().toLowerCase()
  // Strip port (:443) but keep IPv6 brackets handled by URL when possible.
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']')
    return end >= 0 ? raw.slice(0, end + 1) : raw
  }
  const colon = raw.lastIndexOf(':')
  if (colon > 0 && /^\d+$/.test(raw.slice(colon + 1))) {
    return raw.slice(0, colon)
  }
  return raw
}

export function loadProxyHostsFromDisk(): ProxyHost[] {
  const filePath = getProxyHostsFilePath()
  if (!existsSync(filePath)) {
    return []
  }
  try {
    const text = readFileSync(filePath, 'utf8')
    const file = normalizeProxyHostsFile(JSON.parse(text) as ProxyHostsFile)
    return file.hosts
  }
  catch (error) {
    console.warn('[proxy] failed to read proxy-hosts.json:', error)
    return []
  }
}

export function reloadRouteTable(hosts?: ProxyHost[]): void {
  const list = hosts ?? loadProxyHostsFromDisk()
  const nextExact = new Map<string, ProxyHost>()
  const nextWild = new Map<string, ProxyHost>()
  const enabled: ProxyHost[] = []
  for (const host of list) {
    if (!host.enabled) {
      continue
    }
    enabled.push(host)
    for (const name of host.domainNames) {
      const key = normalizeDomainName(name)
      if (!key || isReservedHostname(key)) {
        continue
      }
      if (isWildcardDomainName(key)) {
        const suffix = wildcardParentSuffix(key)
        if (suffix) {
          nextWild.set(suffix, host)
        }
        continue
      }
      nextExact.set(key, host)
    }
  }
  hostsByDomain = nextExact
  hostsByWildcardSuffix = nextWild
  enabledHosts = enabled
}

export function listEnabledProxyHosts(): ProxyHost[] {
  return enabledHosts
}

/** Resolve an enabled ProxyHost for a request hostname (exact, then one-label wildcard). */
export function resolveProxyHostForHostname(hostname: string): ProxyHost | null {
  const host = normalizeDomainName(hostname)
  if (!host || isReservedHostname(host)) {
    return null
  }
  const exact = hostsByDomain.get(host)
  if (exact) {
    return exact
  }
  const dot = host.indexOf('.')
  if (dot <= 0) {
    return null
  }
  const label = host.slice(0, dot)
  const suffix = host.slice(dot + 1)
  if (!label || label.includes('.') || !suffix) {
    return null
  }
  return hostsByWildcardSuffix.get(suffix) ?? null
}

function matchLocation(host: ProxyHost, pathname: string): ProxyLocation | null {
  let best: ProxyLocation | null = null
  let bestLen = -1
  for (const location of host.locations) {
    const path = location.path.startsWith('/') ? location.path : `/${location.path}`
    const matches = path === '/'
      || pathname === path
      || pathname.startsWith(`${path}/`)
    if (matches && path.length > bestLen) {
      best = location
      bestLen = path.length
    }
  }
  return best
}

export function matchProxyRoute(hostHeader: string | null, pathname: string): RouteMatch | null {
  const hostname = hostnameFromHeader(hostHeader)
  const host = resolveProxyHostForHostname(hostname)
  if (!host) {
    return null
  }
  return { host, location: matchLocation(host, pathname) }
}

export function resolveCertPemPaths(certificateName: string): { certPath: string, keyPath: string } | null {
  const dir = join(getLetsencryptDir(), 'live', certificateName)
  const certPath = join(dir, 'fullchain.pem')
  const keyPath = join(dir, 'privkey.pem')
  if (!existsSync(certPath) || !existsSync(keyPath)) {
    return null
  }
  return { certPath, keyPath }
}
