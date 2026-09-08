import { v7 as uuid } from 'uuid'
import type {
  ForwardScheme,
  ProxyHost,
  ProxyHostInput,
  ProxyHostsFile,
  ProxyLocation,
} from '../types/proxyHost'

export function emptyProxyHost(): ProxyHostInput {
  return {
    domainNames: [],
    forwardScheme: 'http',
    forwardHost: '',
    forwardPort: 80,
    cachingEnabled: false,
    blockExploits: false,
    allowWebsocketUpgrade: false,
    accessListId: null,
    locations: [],
    certificateName: null,
    sslForced: false,
    http2Support: false,
    hstsEnabled: false,
    hstsSubdomains: false,
    trustForwardedProto: false,
    advancedConfig: '',
    enabled: true,
  }
}

export function forwardTarget(host: Pick<ProxyHost, 'forwardScheme' | 'forwardHost' | 'forwardPort'>): string {
  return `${host.forwardScheme}://${host.forwardHost}:${host.forwardPort}`
}

/** Lowercase and strip a trailing dot. */
export function normalizeDomainName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\.$/, '')
}

/** DNS-style single-label wildcard: `*.example.com` (not `*`, not `foo.*.com`). */
export function isWildcardDomainName(name: string): boolean {
  const n = normalizeDomainName(name)
  return n.startsWith('*.') && n.length > 2 && !n.includes('*', 1)
}

/** Parent suffix for `*.example.com` → `example.com`. */
export function wildcardParentSuffix(name: string): string | null {
  if (!isWildcardDomainName(name)) {
    return null
  }
  return normalizeDomainName(name).slice(2)
}

function isPlainHostname(name: string): boolean {
  // One or more DNS labels; no wildcards, paths, or spaces.
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(name)
}

/** Null when valid; otherwise a short error message. */
export function validateDomainName(raw: string): string | null {
  const name = normalizeDomainName(raw)
  if (!name) {
    return 'Empty domain name'
  }
  if (name.includes('*')) {
    if (!isWildcardDomainName(name)) {
      return `Invalid wildcard (use *.example.com): ${raw}`
    }
    const suffix = name.slice(2)
    if (!suffix.includes('.') || !isPlainHostname(suffix)) {
      return `Invalid wildcard (use *.example.com): ${raw}`
    }
    return null
  }
  if (!isPlainHostname(name)) {
    return `Invalid domain name: ${raw}`
  }
  return null
}

/**
 * Whether a configured domain pattern matches a request hostname.
 * Exact names win; wildcards match exactly one label (`a.example.com` for `*.example.com`,
 * not `example.com` and not `a.b.example.com`).
 */
export function domainPatternMatchesHostname(pattern: string, hostname: string): boolean {
  const p = normalizeDomainName(pattern)
  const h = normalizeDomainName(hostname)
  if (!p || !h) {
    return false
  }
  if (p === h) {
    return true
  }
  const suffix = wildcardParentSuffix(p)
  if (!suffix) {
    return false
  }
  if (!h.endsWith(`.${suffix}`)) {
    return false
  }
  const label = h.slice(0, -(suffix.length + 1))
  return label.length > 0 && !label.includes('.')
}

export function normalizeDomainNames(raw: string | string[]): string[] {
  const parts = Array.isArray(raw)
    ? raw
    : raw.split(/[\s,]+/)
  return [...new Set(
    parts
      .map(part => normalizeDomainName(part))
      .filter(Boolean),
  )].sort()
}

function asScheme(value: unknown): ForwardScheme {
  return value === 'https' ? 'https' : 'http'
}

function asPort(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 1 || n > 65535) {
    return fallback
  }
  return Math.trunc(n)
}

function asLocation(raw: unknown): ProxyLocation | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const row = raw as Record<string, unknown>
  const path = String(row.path || '').trim()
  const forwardHost = String(row.forwardHost || '').trim()
  if (!path || !forwardHost) {
    return null
  }
  return {
    path: path.startsWith('/') ? path : `/${path}`,
    forwardScheme: asScheme(row.forwardScheme),
    forwardHost,
    forwardPort: asPort(row.forwardPort, 80),
    advancedConfig: typeof row.advancedConfig === 'string' ? row.advancedConfig : '',
  }
}

export function normalizeProxyHost(raw: unknown, idFallback?: string): ProxyHost {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const id = String(row.id || idFallback || uuid())
  const domainNames = normalizeDomainNames(
    Array.isArray(row.domainNames)
      ? row.domainNames.map(String)
      : String(row.domainNames || ''),
  )
  const locations = Array.isArray(row.locations)
    ? row.locations.map(asLocation).filter((item): item is ProxyLocation => Boolean(item))
    : []

  return {
    id,
    domainNames,
    forwardScheme: asScheme(row.forwardScheme),
    forwardHost: String(row.forwardHost || '').trim(),
    forwardPort: asPort(row.forwardPort, 80),
    cachingEnabled: Boolean(row.cachingEnabled),
    blockExploits: Boolean(row.blockExploits),
    allowWebsocketUpgrade: Boolean(row.allowWebsocketUpgrade),
    accessListId: row.accessListId == null || row.accessListId === ''
      ? null
      : String(row.accessListId),
    locations,
    certificateName: row.certificateName == null || row.certificateName === ''
      ? null
      : String(row.certificateName),
    sslForced: Boolean(row.sslForced),
    http2Support: Boolean(row.http2Support),
    hstsEnabled: Boolean(row.hstsEnabled),
    hstsSubdomains: Boolean(row.hstsSubdomains),
    trustForwardedProto: Boolean(row.trustForwardedProto),
    advancedConfig: typeof row.advancedConfig === 'string' ? row.advancedConfig : '',
    enabled: row.enabled === undefined ? true : Boolean(row.enabled),
  }
}

export function normalizeProxyHostsFile(raw: unknown): ProxyHostsFile {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const hosts = Array.isArray(row.hosts)
    ? row.hosts.map(item => normalizeProxyHost(item))
    : []
  return { version: 1, hosts }
}

export function validateProxyHost(host: ProxyHost): string | null {
  if (host.domainNames.length === 0) {
    return 'At least one domain name is required'
  }
  for (const name of host.domainNames) {
    const domainError = validateDomainName(name)
    if (domainError) {
      return domainError
    }
  }
  if (!host.forwardHost.trim()) {
    return 'Forward hostname / IP is required'
  }
  if (host.forwardPort < 1 || host.forwardPort > 65535) {
    return 'Forward port must be between 1 and 65535'
  }
  for (const location of host.locations) {
    if (!location.path.trim()) {
      return 'Custom location path is required'
    }
    if (!location.forwardHost.trim()) {
      return `Custom location ${location.path} needs a forward host`
    }
  }
  return null
}
