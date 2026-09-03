/// <reference types="bun-types" />
import '#nitro-internal-pollyfills'
import { readFileSync } from 'node:fs'
import { useNitroApp } from 'nitropack/runtime'
import { startScheduleRunner } from 'nitropack/runtime/internal'
import wsAdapter from 'crossws/adapters/bun'
import { loadAcmeConfigSync } from './utils/config'
import {
  resolveListenOptions,
  type ListenBinding,
  type ListenTlsOptions,
} from './utils/listen'
import { tryHandleProxy } from './proxy/handle'
import { reloadRouteTable } from './proxy/routeTable'
import { buildEdgeTlsOptions, shouldBindEdgeHttps } from './proxy/tls'
import { proxyWebsocketHandlers } from './proxy/websocket'

loadAcmeConfigSync()
reloadRouteTable()

const nitroApp = useNitroApp()
const websocketEnabled = Boolean((import.meta as ImportMeta & { _websocket?: boolean })._websocket)
const ws = websocketEnabled ? wsAdapter(nitroApp.h3App.websocket) : undefined

const listen = resolveListenOptions()

/** Absolute URLs ignore base; relative paths (some scanners / proxies) need one. */
function resolveRequestUrl(req: Request, binding: ListenBinding): URL {
  const hostHeader = req.headers.get('host')
  const wildcard =
    binding.host === '0.0.0.0'
    || binding.host === '::'
    || binding.host === '[::]'
  const defaultHost = wildcard ? '127.0.0.1' : binding.host
  const omitPort =
    (binding.tls && binding.port === 443)
    || (!binding.tls && binding.port === 80)
  const host = hostHeader || (omitPort ? defaultHost : `${defaultHost}:${binding.port}`)
  const protocol = binding.tls ? 'https' : 'http'
  return new URL(req.url, `${protocol}://${host}`)
}

function tlsServeOption(tls: ListenTlsOptions | ListenTlsOptions[] | null) {
  if (!tls) {
    return {}
  }
  // Edge may pass pre-loaded PEM bodies via a side channel — see startEdgeHttps.
  if (Array.isArray(tls)) {
    return {
      tls: tls.map(item => ({
        cert: readFileSync(item.certPath, 'utf8'),
        key: readFileSync(item.keyPath, 'utf8'),
        ...(item.serverName ? { serverName: item.serverName } : {}),
      })),
    }
  }
  if (!tls.certPath || !tls.keyPath) {
    return {}
  }
  return {
    tls: {
      cert: readFileSync(tls.certPath, 'utf8'),
      key: readFileSync(tls.keyPath, 'utf8'),
      ...(tls.serverName ? { serverName: tls.serverName } : {}),
    },
  }
}

async function handleFetch(req: Request, serverRef: unknown, binding: ListenBinding) {
  let url: URL
  try {
    url = resolveRequestUrl(req, binding)
  }
  catch {
    return new Response('Bad Request', { status: 400 })
  }

  if (binding.role === 'edge') {
    const result = await tryHandleProxy(req, binding, serverRef as import('bun').Server, url)
    if (result && typeof result === 'object' && 'upgraded' in result) {
      return undefined as unknown as Response
    }
    if (result instanceof Response) {
      return result
    }
    // Reserved auth host → Nitro below
  }

  if (websocketEnabled && req.headers.get('upgrade') === 'websocket') {
    return ws!.handleUpgrade(req, serverRef)
  }

  let body: ArrayBuffer | undefined
  if (req.body) {
    body = await req.arrayBuffer()
  }
  return nitroApp.localFetch(url.pathname + url.search, {
    host: url.hostname,
    protocol: url.protocol,
    headers: req.headers,
    method: req.method,
    redirect: req.redirect,
    body,
  })
}

function startControlBinding(binding: ListenBinding) {
  const base = {
    port: binding.port,
    hostname: binding.host,
    idleTimeout: Number.parseInt(process.env.NITRO_BUN_IDLE_TIMEOUT || '') || undefined,
    ...tlsServeOption(binding.tls),
    fetch: (req: Request, server: unknown) => handleFetch(req, server, binding),
  }

  if (websocketEnabled && ws?.websocket) {
    return Bun.serve({
      ...base,
      websocket: ws.websocket,
    })
  }

  return Bun.serve(base as Parameters<typeof Bun.serve>[0])
}

function startEdgeBinding(binding: ListenBinding, tlsBodies?: ReturnType<typeof buildEdgeTlsOptions>) {
  const tlsOpt = tlsBodies
    ? { tls: tlsBodies }
    : tlsServeOption(binding.tls)

  return Bun.serve({
    port: binding.port,
    hostname: binding.host,
    idleTimeout: Number.parseInt(process.env.NITRO_BUN_IDLE_TIMEOUT || '') || undefined,
    ...tlsOpt,
    fetch: (req: Request, server: unknown) => handleFetch(req, server, binding),
    websocket: proxyWebsocketHandlers,
  } as Parameters<typeof Bun.serve>[0])
}

const httpServer = startEdgeBinding(listen.http)
console.log(`[acmedns] Edge HTTP on ${httpServer.url}`)

if (shouldBindEdgeHttps()) {
  const edgeTls = buildEdgeTlsOptions()
  if (edgeTls) {
    const httpsPort = listen.https?.port ?? 443
    const httpsBinding: ListenBinding = {
      host: listen.http.host,
      port: httpsPort,
      role: 'edge',
      tls: listen.https?.tls ?? { certPath: '', keyPath: '' },
    }
    const httpsServer = startEdgeBinding(httpsBinding, edgeTls)
    console.log(`[acmedns] Edge HTTPS on ${httpsServer.url} (SNI)`)
  }
  else {
    console.log('[acmedns] Edge HTTPS skipped — no readable PEMs')
  }
}
else if (listen.https) {
  const httpsServer = startEdgeBinding(listen.https)
  console.log(`[acmedns] Edge HTTPS on ${httpsServer.url}`)
}
else {
  console.log('[acmedns] Edge HTTPS disabled')
}

const controlHttp = startControlBinding(listen.controlHttp)
console.log(`[acmedns] Control HTTP on ${controlHttp.url}`)

if (listen.controlHttps) {
  const controlHttps = startControlBinding(listen.controlHttps)
  console.log(`[acmedns] Control HTTPS on ${controlHttps.url}`)
}
else {
  console.log('[acmedns] Control HTTPS disabled (no default cert)')
}

if ((import.meta as ImportMeta & { _tasks?: boolean })._tasks) {
  startScheduleRunner()
}
