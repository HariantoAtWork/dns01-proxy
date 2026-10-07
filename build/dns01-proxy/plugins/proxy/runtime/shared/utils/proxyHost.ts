import { v7 as uuid } from 'uuid'
import type {
  ForwardScheme,
  ProxyHost,
  ProxyHostInput,
  ProxyHostsFile,
  ProxyLocation,
} from '../types/proxyHost'

/** Default upstream port for a forward scheme (empty/invalid port → this). */
export function defaultForwardPort(scheme: ForwardScheme): number {
  return scheme === 'https' ? 443 : 80
}

/** Parse optional idleTimeout seconds; invalid/empty → null. */
export function asIdleTimeoutSeconds(raw: unknown): number | null {
  if (raw == null || raw === '') {
    return null
  }
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw).trim(), 10)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    return null
  }
  return n
}

export function emptyProxyHost(): ProxyHostInput {
  return {
    domainNames: [],
    forwardScheme: 'http',
    forwardHost: '',
    forwardPort: 80,
    allowWebsocketUpgrade: false,
    accessListId: null,
    bearerListId: null,
    locations: [],
    certificateName: null,
    sslForced: false,
    http2Support: false,
    hstsEnabled: false,
    hstsSubdomains: false,
    trustForwardedProto: false,
    idleTimeout: null,
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

/** Whether a visit hostname should flash a Source-row domain entry (exact or one-label wildcard). */
export function visitMatchesDomainEntry(visitDomain: string, entryName: string): boolean {
  const visit = normalizeDomainName(visitDomain)
  const entry = normalizeDomainName(entryName)
  if (!visit || !entry) {
    return false
  }
  if (visit === entry) {
    return true
  }
  if (!isWildcardDomainName(entry)) {
    return false
  }
  const suffix = wildcardParentSuffix(entry)
  if (!suffix || !visit.endsWith(`.${suffix}`)) {
    return false
  }
  const label = visit.slice(0, -(suffix.length + 1))
  return label.length > 0 && !label.includes('.')
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

export type DomainConflict = {
  domain: string
  hostId: string
  /** Display label for the other host (first domain, or id). */
  hostLabel: string
}

/**
 * Domains that already appear on another proxy host (exact normalized match).
 * Pass `excludeHostId` when editing so the current host is ignored.
 */
export function findDuplicateDomainConflicts(
  domainNames: string[],
  existingHosts: Array<Pick<ProxyHost, 'id' | 'domainNames'>>,
  excludeHostId?: string | null,
): DomainConflict[] {
  const claimed = new Map<string, { hostId: string, hostLabel: string }>()
  for (const host of existingHosts) {
    if (excludeHostId && host.id === excludeHostId) {
      continue
    }
    const label = host.domainNames[0] || host.id
    for (const name of host.domainNames) {
      const key = normalizeDomainName(name)
      if (!key || claimed.has(key)) {
        continue
      }
      claimed.set(key, { hostId: host.id, hostLabel: label })
    }
  }

  const conflicts: DomainConflict[] = []
  const seen = new Set<string>()
  for (const raw of domainNames) {
    const domain = normalizeDomainName(raw)
    if (!domain || seen.has(domain)) {
      continue
    }
    seen.add(domain)
    const owner = claimed.get(domain)
    if (owner) {
      conflicts.push({ domain, hostId: owner.hostId, hostLabel: owner.hostLabel })
    }
  }
  return conflicts
}

/** Short alert copy for duplicate domain conflicts. */
export function formatDuplicateDomainWarning(conflicts: DomainConflict[]): string {
  if (!conflicts.length) {
    return ''
  }
  if (conflicts.length === 1) {
    const [item] = conflicts
    return `Domain already used by another proxy host (${item.hostLabel}): ${item.domain}`
  }
  const domains = conflicts.map(item => item.domain).join(', ')
  return `Domain(s) already used by another proxy host: ${domains}`
}

function asScheme(value: unknown): ForwardScheme {
  return value === 'https' ? 'https' : 'http'
}

/** Empty / invalid / 0 → scheme default (80 http, 443 https). */
export function asForwardPort(value: unknown, scheme: ForwardScheme): number {
  if (value === undefined || value === null || value === '') {
    return defaultForwardPort(scheme)
  }
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 1 || n > 65535) {
    return defaultForwardPort(scheme)
  }
  return Math.trunc(n)
}

export type ParsedForwardTarget = {
  scheme: ForwardScheme
  host: string
  port: number
}

/**
 * Parse a pasted forward URL or `host:port` into scheme / host / port.
 * Returns null for plain hostnames (leave the field as typed).
 */
export function parseForwardTargetInput(raw: string): ParsedForwardTarget | null {
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }

  let candidate = trimmed
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    // full URL — ok
  }
  else if (/^[^/\s?#]+:\d{1,5}$/.test(trimmed)) {
    // host:port without scheme (IPv6 bracket form: [::1]:8080)
    candidate = `http://${trimmed}`
  }
  else {
    return null
  }

  try {
    const url = new URL(candidate)
    const scheme = url.protocol === 'https:'
      ? 'https'
      : url.protocol === 'http:'
        ? 'http'
        : null
    if (!scheme) {
      return null
    }
    const host = url.hostname.trim()
    if (!host) {
      return null
    }
    const port = url.port
      ? asForwardPort(url.port, scheme)
      : defaultForwardPort(scheme)
    return { scheme, host, port }
  }
  catch {
    return null
  }
}

/** Apply URL paste parsing onto a forward target; returns true when fields changed. */
export function applyForwardTargetInput(
  target: { forwardScheme: ForwardScheme, forwardHost: string, forwardPort: number },
  raw: string,
): boolean {
  const parsed = parseForwardTargetInput(raw)
  if (!parsed) {
    return false
  }
  target.forwardScheme = parsed.scheme
  target.forwardHost = parsed.host
  target.forwardPort = parsed.port
  return true
}

function asLocation(raw: unknown): ProxyLocation | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const row = raw as Record<string, unknown>
  const path = String(row.path || '').trim()
  let forwardScheme = asScheme(row.forwardScheme)
  let forwardHost = String(row.forwardHost || '').trim()
  let forwardPort = asForwardPort(row.forwardPort, forwardScheme)
  const parsed = parseForwardTargetInput(forwardHost)
  if (parsed) {
    forwardScheme = parsed.scheme
    forwardHost = parsed.host
    forwardPort = parsed.port
  }
  if (!path || !forwardHost) {
    return null
  }
  return {
    path: path.startsWith('/') ? path : `/${path}`,
    forwardScheme,
    forwardHost,
    forwardPort,
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
  let forwardScheme = asScheme(row.forwardScheme)
  let forwardHost = String(row.forwardHost || '').trim()
  let forwardPort = asForwardPort(row.forwardPort, forwardScheme)
  const parsed = parseForwardTargetInput(forwardHost)
  if (parsed) {
    forwardScheme = parsed.scheme
    forwardHost = parsed.host
    forwardPort = parsed.port
  }

  return {
    id,
    domainNames,
    forwardScheme,
    forwardHost,
    forwardPort,
    allowWebsocketUpgrade: Boolean(row.allowWebsocketUpgrade),
    accessListId: row.accessListId == null || row.accessListId === ''
      ? null
      : String(row.accessListId),
    bearerListId: (() => {
      if (row.bearerListId != null && row.bearerListId !== '') {
        return String(row.bearerListId)
      }
      // Legacy single-key binding.
      if (row.bearerKeyId != null && row.bearerKeyId !== '') {
        return String(row.bearerKeyId)
      }
      return null
    })(),
    locations,
    certificateName: row.certificateName == null || row.certificateName === ''
      ? null
      : String(row.certificateName),
    sslForced: Boolean(row.sslForced),
    // Default on only when SSL is opted in; SSL-off hosts should not show HTTP/2 as enabled.
    http2Support: row.certificateName == null || row.certificateName === ''
      ? false
      : row.http2Support === undefined
        ? true
        : Boolean(row.http2Support),
    hstsEnabled: Boolean(row.hstsEnabled),
    hstsSubdomains: Boolean(row.hstsSubdomains),
    trustForwardedProto: Boolean(row.trustForwardedProto),
    idleTimeout: asIdleTimeoutSeconds(row.idleTimeout),
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
  if (host.idleTimeout != null) {
    if (!Number.isInteger(host.idleTimeout) || host.idleTimeout < 0) {
      return 'Idle timeout must be a non-negative integer (seconds), or empty to inherit'
    }
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

/** Strict-Transport-Security value, or null when HSTS is off. */
export function hstsHeaderValue(host: Pick<ProxyHost, 'hstsEnabled' | 'hstsSubdomains'>): string | null {
  if (!host.hstsEnabled) {
    return null
  }
  return host.hstsSubdomains
    ? 'max-age=31536000; includeSubDomains'
    : 'max-age=31536000'
}
