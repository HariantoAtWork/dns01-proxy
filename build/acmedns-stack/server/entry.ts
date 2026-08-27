/// <reference types="bun-types" />
import '#nitro-internal-pollyfills'
import { readFileSync } from 'node:fs'
import { useNitroApp } from 'nitropack/runtime'
import { startScheduleRunner } from 'nitropack/runtime/internal'
import wsAdapter from 'crossws/adapters/bun'
import { loadAcmeConfigSync } from './utils/config'
import { resolveListenOptions, type ListenBinding } from './utils/listen'

loadAcmeConfigSync()

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

async function handleFetch(req: Request, serverRef: unknown, binding: ListenBinding) {
  if (websocketEnabled && req.headers.get('upgrade') === 'websocket') {
    return ws!.handleUpgrade(req, serverRef)
  }

  let url: URL
  try {
    url = resolveRequestUrl(req, binding)
  }
  catch {
    return new Response('Bad Request', { status: 400 })
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

function startBinding(binding: ListenBinding) {
  const base = {
    port: binding.port,
    hostname: binding.host,
    idleTimeout: Number.parseInt(process.env.NITRO_BUN_IDLE_TIMEOUT || '') || undefined,
    ...(binding.tls
      ? {
          tls: {
            cert: readFileSync(binding.tls.certPath, 'utf8'),
            key: readFileSync(binding.tls.keyPath, 'utf8'),
          },
        }
      : {}),
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

const httpServer = startBinding(listen.http)
console.log(`[acmedns] Listening HTTP on ${httpServer.url}`)

if (listen.https) {
  const httpsServer = startBinding(listen.https)
  console.log(`[acmedns] Listening HTTPS on ${httpsServer.url} (api.tls=cert)`)
}
else {
  console.log('[acmedns] HTTPS disabled (api.tls=none)')
}

if ((import.meta as ImportMeta & { _tasks?: boolean })._tasks) {
  startScheduleRunner()
}
