import type { ProxyHost, ProxyLocation } from '../../plugins/proxy/runtime/shared/types/proxyHost'
import type { ListenBinding } from '../utils/listen'
import type { RouteMatch } from './routeTable'

export interface ForwardTarget {
  scheme: 'http' | 'https'
  host: string
  port: number
}

/** Default upstream fetch deadline (ms). `PROXY_UPSTREAM_TIMEOUT_MS=0` disables. */
export const DEFAULT_PROXY_UPSTREAM_TIMEOUT_MS = 60_000

export function proxyUpstreamTimeoutMs(): number {
  const raw = process.env.PROXY_UPSTREAM_TIMEOUT_MS
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_PROXY_UPSTREAM_TIMEOUT_MS
  }
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) {
    return DEFAULT_PROXY_UPSTREAM_TIMEOUT_MS
  }
  return Math.floor(value)
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

function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    return xff.split(',')[0]!.trim()
  }
  return req.headers.get('x-real-ip') || ''
}

export function buildForwardHeaders(
  req: Request,
  match: RouteMatch,
  binding: ListenBinding,
): Headers {
  const headers = new Headers(req.headers)
  // Hop-by-hop
  headers.delete('host')
  headers.delete('connection')
  headers.delete('keep-alive')
  headers.delete('proxy-authenticate')
  headers.delete('proxy-authorization')
  headers.delete('te')
  headers.delete('trailers')
  headers.delete('transfer-encoding')
  headers.delete('upgrade')

  const hostHeader = req.headers.get('host') || match.host.domainNames[0] || ''
  headers.set('Host', hostHeader.split(':')[0] || hostHeader)

  const ip = clientIp(req)
  if (ip) {
    headers.set('X-Real-IP', ip)
    const prior = req.headers.get('x-forwarded-for')
    headers.set('X-Forwarded-For', prior ? `${prior}, ${ip}` : ip)
  }

  // Client-facing scheme: TLS binding, Force SSL intent, or trusted CDN header.
  // Prefer inbound X-Forwarded-Proto=https so Cloudflare Flexible / Synology
  // TLS termination does not look like plain HTTP to the upstream (redirect loops).
  const incomingProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()
  const bindingScheme = binding.tls ? 'https' : 'http'
  let forwardedProto = bindingScheme
  if (match.host.sslForced) {
    forwardedProto = 'https'
  }
  else if (incomingProto === 'https') {
    forwardedProto = 'https'
  }
  else if (match.host.trustForwardedProto && incomingProto) {
    forwardedProto = incomingProto
  }
  headers.set('X-Forwarded-Proto', forwardedProto)

  // Only for real WebSocket upgrades — never re-attach Connection: keep-alive on
  // ordinary HTTP (that blanks many upstream apps when Bun fetch proxies them).
  if (match.host.allowWebsocketUpgrade) {
    const upgrade = req.headers.get('upgrade')
    if (upgrade?.toLowerCase() === 'websocket') {
      headers.set('Upgrade', upgrade)
      headers.set('Connection', 'Upgrade')
    }
  }

  return headers
}

/** Drop hop-by-hop headers so the client gets a clean streamed response. */
export function sanitizeUpstreamResponseHeaders(headers: Headers): Headers {
  const out = new Headers(headers)
  out.delete('connection')
  out.delete('keep-alive')
  out.delete('proxy-authenticate')
  out.delete('proxy-authorization')
  out.delete('te')
  out.delete('trailers')
  out.delete('transfer-encoding')
  out.delete('upgrade')
  return out
}

function isAbortLike(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }
  const name = (error as { name?: string }).name
  return name === 'AbortError' || name === 'TimeoutError'
}

export async function forwardHttpRequest(
  req: Request,
  match: RouteMatch,
  binding: ListenBinding,
  reqUrl: URL,
): Promise<Response> {
  const target = resolveForwardTarget(match)
  const upstream = buildUpstreamUrl(reqUrl, target)
  const headers = buildForwardHeaders(req, match, binding)
  const timeoutMs = proxyUpstreamTimeoutMs()
  const signal = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined

  const init: RequestInit & { duplex?: 'half' } = {
    method: req.method,
    headers,
    redirect: 'manual',
    signal,
  }

  // Stream the request body when present — avoid buffering whole uploads in RAM.
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
    init.body = req.body
    init.duplex = 'half'
  }

  try {
    const upstreamRes = await fetch(upstream, init)
    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: sanitizeUpstreamResponseHeaders(upstreamRes.headers),
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'upstream error'
    if (isAbortLike(error) && timeoutMs > 0) {
      console.warn(`[proxy] upstream ${upstream} timed out after ${timeoutMs}ms`)
      return new Response('Gateway Timeout', { status: 504 })
    }
    console.warn(`[proxy] upstream ${upstream} failed:`, message)
    return new Response('Bad Gateway', { status: 502 })
  }
}

/**
 * HTTP → HTTPS redirect when Force SSL is on.
 * Skip when a front proxy already terminated TLS (X-Forwarded-Proto: https),
 * otherwise Cloudflare Flexible / Synology RP loops: https→origin:80→301→https…
 */
export function forceSslRedirect(req: Request, reqUrl: URL, host: ProxyHost): Response | null {
  if (!host.sslForced || !host.certificateName) {
    return null
  }
  const incomingProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()
  if (incomingProto === 'https') {
    return null
  }
  const location = `https://${reqUrl.host}${reqUrl.pathname}${reqUrl.search}`
  return Response.redirect(location, 301)
}

/** Test helper — location vs default target. */
export function describeTarget(host: ProxyHost, location: ProxyLocation | null): string {
  const t = location
    ? { scheme: location.forwardScheme, host: location.forwardHost, port: location.forwardPort }
    : { scheme: host.forwardScheme, host: host.forwardHost, port: host.forwardPort }
  return `${t.scheme}://${t.host}:${t.port}`
}
