import { proxyAccessLogEnabled, proxyLog, resolveProxyAccessLogLevel } from './proxyLog'

export { proxyAccessLogEnabled } from './proxyLog'

export interface ProxyAccessLogFields {
  status: number
  method: string
  inbound: string
  path: string
  /** Upstream URL or short label (e.g. `(no-route)`, `(redirect)`). */
  upstream: string
  ms?: number
  id?: string
  note?: string
}

export function formatProxyAccessLine(fields: ProxyAccessLogFields): string {
  const msPart = fields.ms !== undefined ? ` ${Math.max(0, Math.round(fields.ms))}ms` : ''
  const idPart = fields.id ? ` id=${fields.id}` : ''
  const notePart = fields.note ? ` ${fields.note}` : ''
  return `[proxy] ${fields.status}${msPart} ${fields.method} ${fields.inbound}${fields.path} → ${fields.upstream}${idPart}${notePart}`
}

/**
 * Health scanners / Docker DNS often hit the edge with Host that is not a Proxy Host.
 * Keep those at debug so info logs look like real traffic.
 */
export function isNoisyUnmatchedHost(inbound: string): boolean {
  const raw = (inbound || '').trim().toLowerCase()
  if (!raw) {
    return true
  }
  const host = raw.startsWith('[')
    ? raw.slice(1, raw.indexOf(']')).toLowerCase()
    : (raw.split(':')[0] || '').toLowerCase()
  if (!host) {
    return true
  }
  if (
    host === 'host.docker.internal'
    || host === 'localhost'
    || host === '127.0.0.1'
    || host === '::1'
    || host === '0.0.0.0'
  ) {
    return true
  }
  // Bare IPv4
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    return true
  }
  // Bare IPv6 (has colons, no dots)
  if (host.includes(':') && !host.includes('.')) {
    return true
  }
  return false
}

/** Access line — gated by PROXY_LOG_LEVEL / PROXY_ACCESS_LOG_LEVEL (default info). */
export function logProxyAccess(fields: ProxyAccessLogFields): void {
  if (fields.note === 'unmatched-host' && isNoisyUnmatchedHost(fields.inbound)) {
    proxyLog('debug', formatProxyAccessLine(fields))
    return
  }
  if (!proxyAccessLogEnabled()) {
    return
  }
  const level = resolveProxyAccessLogLevel()
  if (level === 'silent') {
    return
  }
  proxyLog(level, formatProxyAccessLine(fields))
}
