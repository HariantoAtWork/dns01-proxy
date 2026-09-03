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
}

function isProxyData(data: unknown): data is ProxyWsData {
  return Boolean(data && typeof data === 'object' && (data as ProxyWsData).kind === 'proxy')
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

  let upstream: WebSocket
  try {
    upstream = new WebSocket(upstreamUrl)
  }
  catch (error) {
    console.warn(`[proxy] ws connect failed ${upstreamUrl}:`, error)
    return false
  }

  const ok = server.upgrade(req, {
    data: { kind: 'proxy', upstream } satisfies ProxyWsData,
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
  },
  message(ws: ServerWebSocket<ProxyWsData>, message: string | Buffer) {
    if (!isProxyData(ws.data)) {
      return
    }
    const upstream = ws.data.upstream
    if (upstream.readyState !== WebSocket.OPEN) {
      return
    }
    if (typeof message === 'string') {
      upstream.send(message)
    }
    else {
      upstream.send(message)
    }
  },
  close(ws: ServerWebSocket<ProxyWsData>) {
    if (!isProxyData(ws.data)) {
      return
    }
    try {
      ws.data.upstream.close()
    }
    catch {
      // ignore
    }
  },
}
