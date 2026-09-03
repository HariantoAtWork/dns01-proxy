import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ProxyHost, ProxyHostsFile, ProxyLocation } from '../../plugins/proxy/runtime/shared/types/proxyHost'
import { normalizeProxyHostsFile } from '../../plugins/proxy/runtime/shared/utils/proxyHost'
import { getLetsencryptDir, getProxyHostsFilePath } from '../../core/paths'
import { isReservedHostname } from './reserved'

export interface RouteMatch {
  host: ProxyHost
  /** Matched custom location, or null for the default forward target. */
  location: ProxyLocation | null
}

let hostsByDomain = new Map<string, ProxyHost>()
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
  const next = new Map<string, ProxyHost>()
  const enabled: ProxyHost[] = []
  for (const host of list) {
    if (!host.enabled) {
      continue
    }
    enabled.push(host)
    for (const name of host.domainNames) {
      const key = name.replace(/\.$/, '').toLowerCase()
      if (!key || isReservedHostname(key)) {
        continue
      }
      next.set(key, host)
    }
  }
  hostsByDomain = next
  enabledHosts = enabled
}

export function listEnabledProxyHosts(): ProxyHost[] {
  return enabledHosts
}

export function matchProxyRoute(hostHeader: string | null, pathname: string): RouteMatch | null {
  const hostname = hostnameFromHeader(hostHeader)
  if (!hostname || isReservedHostname(hostname)) {
    return null
  }
  const host = hostsByDomain.get(hostname)
  if (!host) {
    return null
  }

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

  return { host, location: best }
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
