import type { ProxyHost, ProxyLocation } from '../../plugins/proxy/runtime/shared/types/proxyHost'
import { hstsHeaderValue } from '../../plugins/proxy/runtime/shared/utils/proxyHost'
import type { ListenBinding } from '../utils/listen'
import { getProxySettingsCached } from './accessListState'
import { logProxyAccess } from './accessLog'
import { resolveProxyClientIp } from './clientIp'
import { proxyLog } from './proxyLog'
import type { RouteMatch } from './routeTable'
import type { Server } from 'bun'

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

function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return ''
  }
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' || typeof code === 'number' ? String(code) : ''
}

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
  server?: Server,
): Promise<Response> {
  const target = resolveForwardTarget(match)
  const upstream = buildUpstreamUrl(reqUrl, target)
  const context = formatProxyUpstreamContext(match, req, reqUrl, target, upstream)
  const inbound = req.headers.get('host') || reqUrl.host || '(no host)'
  const path = `${reqUrl.pathname}${reqUrl.search}`
  const started = performance.now()

  const access = (status: number, note?: string) => {
    logProxyAccess({
      status,
      method: req.method,
      inbound,
      path,
      upstream,
      ms: performance.now() - started,
      id: match.host.id,
      note,
    })
  }

  const invalid = validateForwardTarget(target)
  if (invalid) {
    proxyLog('warn', `[proxy] invalid upstream config: ${invalid} | ${context}`)
    access(502, `invalid-config`)
    return new Response('Bad Gateway', { status: 502 })
  }

  const headers = buildForwardHeaders(req, match, binding, server)
  const timeoutMs = proxyUpstreamTimeoutMs()
  const signal = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined

  const init: RequestInit & {
    duplex?: 'half'
    decompress?: boolean
    tls?: { rejectUnauthorized: boolean }
  } = {
    method: req.method,
    headers,
    redirect: 'manual',
    signal,
    // Bun fetch decompresses by default but keeps Content-Encoding — browsers then
    // fail with blank pages / ERR_CONTENT_DECODING_FAILED. Pass bytes through as-is.
    decompress: false,
  }

  // Match health probes: docker upstreams often use self-signed / private CA certs.
  if (target.scheme === 'https') {
    init.tls = { rejectUnauthorized: false }
  }

  // Stream the request body when present — avoid buffering whole uploads in RAM.
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
    init.body = req.body
    init.duplex = 'half'
  }

  try {
    const upstreamRes = await fetch(upstream, init)
    access(upstreamRes.status)
    const outHeaders = applyHstsHeader(
      sanitizeUpstreamResponseHeaders(upstreamRes.headers),
      match.host,
      req,
      binding,
    )
    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: outHeaders,
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'upstream error'
    const code = errorCode(error)
    if (isAbortLike(error) && timeoutMs > 0) {
      proxyLog('warn', `[proxy] upstream timed out after ${timeoutMs}ms | ${context}`)
      access(504, 'timeout')
      return new Response('Gateway Timeout', { status: 504 })
    }
    const codePart = code ? ` code=${code}` : ''
    proxyLog('warn', `[proxy] upstream failed:${codePart} ${message} | ${context}`)
    access(502, code ? `code=${code}` : undefined)
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
