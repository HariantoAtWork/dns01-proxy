import type { Server } from 'bun'
import type { ListenBinding } from '../utils/listen'
import { isControlBinding, isEdgeBinding } from '../utils/listen'
import { recordAccessDeny } from './accessDenies'
import { getAccessListById, getProxySettingsCached } from './accessListState'
import { verifyInboundBearer } from './bearerKeyState'
import { logProxyAccess } from './accessLog'
import { resolveProxyClientIp } from './clientIp'
import { isReservedHostname } from './reserved'
import { forwardHttpRequest, forceSslRedirect } from './forward'
import { matchProxyRoute } from './routeTable'
import { tryUpgradeProxyWebSocket } from './websocket'
import { evaluateAccessList } from './accessEvaluate'
import { respondPublicLiveStatus } from './liveStatus'
import { publishProxyVisit } from './visitBus'

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

async function enforceBearerKey(
  req: Request,
  match: NonNullable<ReturnType<typeof matchProxyRoute>>,
  inbound: string,
  path: string,
  pathname: string,
): Promise<Response | null> {
  const listId = match.host.bearerListId || match.host.bearerKeyId
  if (!listId) {
    return null
  }

  if (verifyInboundBearer(listId, req.headers.get('authorization'))) {
    // Never forward the gateway token to upstream.
    match.stripAuthorization = true
    return null
  }

  const isPublicRoot = req.method === 'GET' && pathname === '/'
  if (isPublicRoot) {
    logProxyAccess({
      status: 200,
      method: req.method,
      inbound,
      path,
      upstream: '(live-status)',
      id: match.host.id,
      note: 'bearer-missing live-status',
    })
    return respondPublicLiveStatus(req, match.host)
  }

  logProxyAccess({
    status: 401,
    method: req.method,
    inbound,
    path,
    upstream: '(bearer)',
    id: match.host.id,
    note: `bearer-denied list=${listId}`,
  })
  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Bearer realm="Proxy"',
    },
  })
}

async function enforceAccessList(
  req: Request,
  server: Server,
  match: NonNullable<ReturnType<typeof matchProxyRoute>>,
  inbound: string,
  path: string,
): Promise<Response | null> {
  const listId = match.host.accessListId
  if (!listId) {
    return null
  }
  const list = getAccessListById(listId)
  if (!list) {
    return null
  }

  const settings = getProxySettingsCached()
  const resolved = resolveProxyClientIp(req, {
    trustForwardedClientIp: settings.trustForwardedClientIp,
    server,
  })
  const result = await evaluateAccessList(
    list,
    resolved.address,
    req.headers.get('authorization'),
    { skipBasicAuth: Boolean(match.stripAuthorization) },
  )

  if (result.ok) {
    if (result.stripAuthorization) {
      match.stripAuthorization = true
    }
    return null
  }

  const ipLabel = resolved.address || 'unknown'
  recordAccessDeny({
    ip: ipLabel,
    hostId: match.host.id,
    domain: match.host.domainNames[0] || inbound,
    listId: list.id,
    reason: result.reason,
  })
  logProxyAccess({
    status: result.status,
    method: req.method,
    inbound,
    path,
    upstream: '(access-list)',
    id: match.host.id,
    note: `access-denied ip=${ipLabel} list=${list.id} ${result.reason}`,
  })

  if (result.status === 401) {
    return new Response('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': `Basic realm="Proxy Access List"`,
      },
    })
  }
  return new Response('Forbidden', { status: 403 })
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

  const inbound = req.headers.get('host') || reqUrl.host || '(no host)'
  const path = `${reqUrl.pathname}${reqUrl.search}`

  const match = matchProxyRoute(req.headers.get('host'), reqUrl.pathname)
  if (!match) {
    logProxyAccess({
      status: 404,
      method: req.method,
      inbound,
      path,
      upstream: '(no-route)',
      note: 'unmatched-host',
    })
    return new Response('Not Found', { status: 404 })
  }

  publishProxyVisit({
    hostId: match.host.id,
    domain: hostname,
    at: new Date().toISOString(),
  })

  if (!binding.tls) {
    const redirect = forceSslRedirect(req, reqUrl, match.host)
    if (redirect) {
      logProxyAccess({
        status: redirect.status,
        method: req.method,
        inbound,
        path,
        upstream: '(force-ssl)',
        id: match.host.id,
        note: 'redirect',
      })
      return redirect
    }
  }

  const bearerDenied = await enforceBearerKey(
    req,
    match,
    inbound,
    path,
    reqUrl.pathname,
  )
  if (bearerDenied) {
    return bearerDenied
  }

  const denied = await enforceAccessList(req, server, match, inbound, path)
  if (denied) {
    return denied
  }

  if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
    if (tryUpgradeProxyWebSocket(req, server, binding, reqUrl, match)) {
      logProxyAccess({
        status: 101,
        method: req.method,
        inbound,
        path,
        upstream: '(websocket)',
        id: match.host.id,
        note: 'upgrade',
      })
      return { upgraded: true }
    }
    logProxyAccess({
      status: 502,
      method: req.method,
      inbound,
      path,
      upstream: '(websocket)',
      id: match.host.id,
      note: 'upgrade-failed',
    })
    return new Response('WebSocket upgrade failed', { status: 502 })
  }

  return forwardHttpRequest(req, match, binding, reqUrl, server)
}
