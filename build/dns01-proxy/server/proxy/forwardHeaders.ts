import type { ProxyHost } from '../../plugins/proxy/runtime/shared/types/proxyHost'
import { hstsHeaderValue } from '../../plugins/proxy/runtime/shared/utils/proxyHost'
import type { ListenBinding } from '../utils/listen'
import { getProxySettingsCached } from './accessListState'
import { resolveProxyClientIp } from './clientIp'
import type { RouteMatch } from './routeTable'
import type { Server } from 'bun'

function clientIp(req: Request, server?: Server): string {
  const settings = getProxySettingsCached()
  const resolved = resolveProxyClientIp(req, {
    trustForwardedClientIp: settings.trustForwardedClientIp,
    server,
  })
  return resolved.address || ''
}

export function buildForwardHeaders(
  req: Request,
  match: RouteMatch,
  binding: ListenBinding,
  server?: Server,
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

  if (match.stripAuthorization) {
    headers.delete('authorization')
  }

  const hostHeader = req.headers.get('host') || match.host.domainNames[0] || ''
  headers.set('Host', hostHeader.split(':')[0] || hostHeader)

  const ip = clientIp(req, server)
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

/** Drop hop-by-hop / length headers so Bun can reframe the streamed body.
 * Keep `content-encoding` — upstream fetch uses `decompress: false` so bytes stay compressed.
 */
export function sanitizeUpstreamResponseHeaders(headers: Headers): Headers {
  const out = new Headers(headers)
  out.delete('connection')
  out.delete('keep-alive')
  out.delete('proxy-authenticate')
  out.delete('proxy-authorization')
  out.delete('te')
  out.delete('trailers')
  out.delete('transfer-encoding')
  out.delete('content-length')
  out.delete('upgrade')
  return out
}

/** True when the client-facing request is (or should be treated as) HTTPS. */
export function clientFacingHttps(
  req: Request,
  host: Pick<ProxyHost, 'sslForced' | 'trustForwardedProto'>,
  binding: ListenBinding,
): boolean {
  if (binding.tls) {
    return true
  }
  if (host.sslForced) {
    return true
  }
  const incomingProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()
  if (incomingProto === 'https') {
    return true
  }
  if (host.trustForwardedProto && incomingProto) {
    return incomingProto === 'https'
  }
  return false
}

/** Attach Strict-Transport-Security when HSTS is on and the client sees HTTPS. */
export function applyHstsHeader(
  headers: Headers,
  host: Pick<ProxyHost, 'hstsEnabled' | 'hstsSubdomains' | 'sslForced' | 'trustForwardedProto'>,
  req: Request,
  binding: ListenBinding,
): Headers {
  const value = hstsHeaderValue(host)
  if (!value || !clientFacingHttps(req, host, binding)) {
    return headers
  }
  headers.set('Strict-Transport-Security', value)
  return headers
}
