import type { Server, ServerWebSocket } from 'bun'
import type { ListenBinding } from '../utils/listen'
import {
  buildUpstreamWsUrl,
  resolveForwardTarget,
} from './forward'
import type { RouteMatch } from './routeTable'

export interface ProxyWsData {
  kind: 'proxy'
  upstream: WebSocket
  pending: Array<string | Buffer>
}

function isProxyData(data: unknown): data is ProxyWsData {
  return Boolean(data && typeof data === 'object' && (data as ProxyWsData).kind === 'proxy')
}

/** Headers the upstream often needs for cookie/auth and Host-based apps. */
export function buildUpstreamWsHeaders(req: Request, match: RouteMatch): Record<string, string> {
  const headers: Record<string, string> = {}
  const hostHeader = req.headers.get('host') || match.host.domainNames[0] || ''
  headers.Host = hostHeader.split(':')[0] || hostHeader

  const cookie = req.headers.get('cookie')
  if (cookie) {
    headers.Cookie = cookie
  }
  const origin = req.headers.get('origin')
  if (origin) {
    headers.Origin = origin
  }
  const authorization = req.headers.get('authorization')
  if (authorization) {
    headers.Authorization = authorization
  }
  const protocol = req.headers.get('sec-websocket-protocol')
  if (protocol) {
    headers['Sec-WebSocket-Protocol'] = protocol
  }
  const userAgent = req.headers.get('user-agent')
  if (userAgent) {
    headers['User-Agent'] = userAgent
  }

  return headers
}

function flushPending(data: ProxyWsData) {
  if (data.upstream.readyState !== WebSocket.OPEN) {
    return
  }
  while (data.pending.length) {
    const next = data.pending.shift()
    if (next === undefined) {
      break
    }
    data.upstream.send(next)
  }
}

/**
 * Attempt to upgrade an edge request to a proxied WebSocket.
 * Returns true when upgrade was accepted (caller must not return a Response).
 */
export function tryUpgradeProxyWebSocket(
  req: Request,
  server: Server,
  binding: ListenBinding,
  reqUrl: URL,
  match: RouteMatch,
): boolean {
  if (binding.role !== 'edge' || !match.host.allowWebsocketUpgrade) {
    return false
  }
  if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
    return false
  }

  const target = resolveForwardTarget(match)
  const upstreamUrl = buildUpstreamWsUrl(reqUrl, target)
  const upstreamHeaders = buildUpstreamWsHeaders(req, match)

  let upstream: WebSocket
  try {
    upstream = new WebSocket(upstreamUrl, { headers: upstreamHeaders })
  }
  catch (error) {
    console.warn(`[proxy] ws connect failed ${upstreamUrl}:`, error)
    return false
  }

  const ok = server.upgrade(req, {
    data: {
      kind: 'proxy',
      upstream,
      pending: [],
    } satisfies ProxyWsData,
  })
  if (!ok) {
    upstream.close()
    return false
  }
  return true
}

export const proxyWebsocketHandlers = {
  open(ws: ServerWebSocket<ProxyWsData>) {
    if (!isProxyData(ws.data)) {
      return
    }
    const upstream = ws.data.upstream
    upstream.binaryType = 'arraybuffer'
    upstream.addEventListener('open', () => {
      flushPending(ws.data)
    })
    upstream.addEventListener('message', (event) => {
      try {
        if (typeof event.data === 'string') {
          ws.send(event.data)
        }
        else {
          ws.send(event.data as ArrayBuffer)
        }
      }
      catch {
        // client gone
      }
    })
    upstream.addEventListener('close', () => {
      try {
        ws.close()
      }
      catch {
        // ignore
      }
    })
    upstream.addEventListener('error', () => {
      try {
        ws.close()
      }
      catch {
        // ignore
      }
    })
    if (upstream.readyState === WebSocket.OPEN) {
      flushPending(ws.data)
    }
  },
  message(ws: ServerWebSocket<ProxyWsData>, message: string | Buffer) {
    if (!isProxyData(ws.data)) {
      return
    }
    const upstream = ws.data.upstream
    if (upstream.readyState === WebSocket.OPEN) {
      if (typeof message === 'string') {
        upstream.send(message)
      }
      else {
        upstream.send(message)
      }
      return
    }
    if (upstream.readyState === WebSocket.CONNECTING) {
      ws.data.pending.push(message)
    }
  },
  close(ws: ServerWebSocket<ProxyWsData>) {
    if (!isProxyData(ws.data)) {
      return
    }
    ws.data.pending.length = 0
    try {
      ws.data.upstream.close()
    }
    catch {
      // ignore
    }
  },
}
