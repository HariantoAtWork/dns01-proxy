import type { ProxyHost, ProxyLocation } from '../../plugins/proxy/runtime/shared/types/proxyHost'
import type { RouteMatch } from './routeTable'

export interface ForwardTarget {
  scheme: 'http' | 'https'
  host: string
  port: number
}

export function resolveForwardTarget(match: RouteMatch): ForwardTarget {
  if (match.location) {
    return {
      scheme: match.location.forwardScheme,
      host: match.location.forwardHost,
      port: match.location.forwardPort,
    }
  }
  return {
    scheme: match.host.forwardScheme,
    host: match.host.forwardHost,
    port: match.host.forwardPort,
  }
}

export function buildUpstreamUrl(reqUrl: URL, target: ForwardTarget): string {
  const path = `${reqUrl.pathname}${reqUrl.search}`
  return `${target.scheme}://${target.host}:${target.port}${path}`
}

export function buildUpstreamWsUrl(reqUrl: URL, target: ForwardTarget): string {
  const scheme = target.scheme === 'https' ? 'wss' : 'ws'
  return `${scheme}://${target.host}:${target.port}${reqUrl.pathname}${reqUrl.search}`
}

/**
 * Returns a human reason when the forward target cannot form a valid URL.
 * Call before fetch/WebSocket so Bun does not dump a bare ERR_INVALID_URL.
 */
export function validateForwardTarget(target: ForwardTarget): string | null {
  const host = typeof target.host === 'string' ? target.host.trim() : ''
  if (!host) {
    return 'forward host is empty'
  }
  if (/^https?:\/\//i.test(host)) {
    return 'forward host includes a scheme (use hostname/IP only)'
  }
  if (host.includes('/') || host.includes(' ')) {
    return `forward host looks malformed (${JSON.stringify(host)})`
  }
  if (!Number.isFinite(target.port) || target.port <= 0 || target.port > 65535) {
    return `forward port is invalid (${String(target.port)})`
  }
  if (target.scheme !== 'http' && target.scheme !== 'https') {
    return `forward scheme is invalid (${String(target.scheme)})`
  }
  try {
    const parsed = new URL(`${target.scheme}://${host}:${target.port}/`)
    if (!parsed.hostname) {
      return 'forward host produced an empty hostname'
    }
  }
  catch {
    return 'forward target is not a valid URL'
  }
  return null
}

export function formatProxyUpstreamContext(
  match: RouteMatch,
  req: Request,
  reqUrl: URL,
  target: ForwardTarget,
  upstream: string,
): string {
  const domains = match.host.domainNames.join(',') || '(none)'
  const location = match.location ? ` location=${match.location.path}` : ''
  const inbound = req.headers.get('host') || reqUrl.host || '(no host)'
  return [
    `id=${match.host.id}`,
    `domains=${domains}${location}`,
    `inbound=${inbound}`,
    `${req.method} ${reqUrl.pathname}${reqUrl.search}`,
    `→ ${upstream}`,
    `target scheme=${target.scheme} host=${JSON.stringify(target.host)} port=${target.port}`,
  ].join(' ')
}

/** Test helper — location vs default target. */
export function describeTarget(host: ProxyHost, location: ProxyLocation | null): string {
  const t = location
    ? { scheme: location.forwardScheme, host: location.forwardHost, port: location.forwardPort }
    : { scheme: host.forwardScheme, host: host.forwardHost, port: host.forwardPort }
  return `${t.scheme}://${t.host}:${t.port}`
}
