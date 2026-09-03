import type { Server } from 'bun'
import type { ListenBinding } from '../utils/listen'
import { isControlBinding, isEdgeBinding } from '../utils/listen'
import { isReservedHostname } from './reserved'
import { forwardHttpRequest, forceSslRedirect } from './forward'
import { matchProxyRoute } from './routeTable'
import { tryUpgradeProxyWebSocket } from './websocket'

function hostnameOf(req: Request, url: URL): string {
  const header = req.headers.get('host')
  if (header) {
    const raw = header.trim().toLowerCase()
    if (raw.startsWith('[')) {
      const end = raw.indexOf(']')
      return end >= 0 ? raw.slice(0, end + 1) : raw
    }
    const colon = raw.lastIndexOf(':')
    if (colon > 0 && /^\d+$/.test(raw.slice(colon + 1))) {
      return raw.slice(0, colon)
    }
    return raw
  }
  return url.hostname.toLowerCase()
}

/**
 * Edge reverse-proxy attempt.
 * - `null` → caller should fall through to Nitro (control ports, reserved hosts)
 * - `Response` → handled (including 404 for unknown edge hosts)
 * - `{ upgraded: true }` → WebSocket upgrade accepted; do not return a Response
 */
export async function tryHandleProxy(
  req: Request,
  binding: ListenBinding,
  server: Server,
  reqUrl: URL,
): Promise<Response | { upgraded: true } | null> {
  if (isControlBinding(binding)) {
    return null
  }
  if (!isEdgeBinding(binding)) {
    return null
  }

  const hostname = hostnameOf(req, reqUrl)
  if (isReservedHostname(hostname)) {
    return null
  }

  const match = matchProxyRoute(req.headers.get('host'), reqUrl.pathname)
  if (!match) {
    return new Response('Not Found', { status: 404 })
  }

  if (!binding.tls) {
    const redirect = forceSslRedirect(req, reqUrl, match.host)
    if (redirect) {
      return redirect
    }
  }

  if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
    if (tryUpgradeProxyWebSocket(req, server, binding, reqUrl, match)) {
      return { upgraded: true }
    }
    return new Response('WebSocket upgrade failed', { status: 502 })
  }

  return forwardHttpRequest(req, match, binding, reqUrl)
}
