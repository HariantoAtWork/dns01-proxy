import type { ProxyHost } from '../../plugins/proxy/runtime/shared/types/proxyHost'
import type { ListenBinding } from '../utils/listen'
import { logProxyAccess } from './accessLog'
import {
  applyHstsHeader,
  buildForwardHeaders,
  sanitizeUpstreamResponseHeaders,
} from './forwardHeaders'
import {
  buildUpstreamUrl,
  formatProxyUpstreamContext,
  resolveForwardTarget,
  validateForwardTarget,
} from './forwardTarget'
import { proxyLog } from './proxyLog'
import type { RouteMatch } from './routeTable'
import type { Server } from 'bun'

export type { ForwardTarget } from './forwardTarget'
export {
  buildUpstreamUrl,
  buildUpstreamWsUrl,
  describeTarget,
  formatProxyUpstreamContext,
  resolveForwardTarget,
  validateForwardTarget,
} from './forwardTarget'
export {
  applyHstsHeader,
  buildForwardHeaders,
  clientFacingHttps,
  sanitizeUpstreamResponseHeaders,
} from './forwardHeaders'

/** Default upstream fetch deadline (ms). `0` disables (needed for long video/AI streams). */
export const DEFAULT_PROXY_UPSTREAM_TIMEOUT_MS = 0

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

function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return ''
  }
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' || typeof code === 'number' ? String(code) : ''
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
