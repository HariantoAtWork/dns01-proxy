import type { ProxyHost, ProxyLocation } from '../../plugins/proxy/runtime/shared/types/proxyHost'
import type { ListenBinding } from '../utils/listen'
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

export async function forwardHttpRequest(
  req: Request,
  match: RouteMatch,
  binding: ListenBinding,
  reqUrl: URL,
): Promise<Response> {
  const target = resolveForwardTarget(match)
  const upstream = buildUpstreamUrl(reqUrl, target)
  const headers = buildForwardHeaders(req, match, binding)

  let body: ArrayBuffer | undefined
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
    body = await req.arrayBuffer()
  }

  try {
    const upstreamRes = await fetch(upstream, {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
    })
    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: upstreamRes.headers,
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'upstream error'
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
