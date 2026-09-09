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

/** Access line — gated by PROXY_LOG_LEVEL / PROXY_ACCESS_LOG_LEVEL (default info). */
export function logProxyAccess(fields: ProxyAccessLogFields): void {
  if (!proxyAccessLogEnabled()) {
    return
  }
  const level = resolveProxyAccessLogLevel()
  if (level === 'silent') {
    return
  }
  proxyLog(level, formatProxyAccessLine(fields))
}
