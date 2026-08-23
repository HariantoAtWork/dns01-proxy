import '#nitro-internal-pollyfills'
import { readFileSync } from 'node:fs'
import { useNitroApp } from 'nitropack/runtime'
import { startScheduleRunner } from 'nitropack/runtime/internal'
import wsAdapter from 'crossws/adapters/bun'
import { loadAcmeConfigSync } from './utils/config'
import { resolveListenOptions, type ListenBinding } from './utils/listen'

loadAcmeConfigSync()

const nitroApp = useNitroApp()
// @ts-expect-error replaced at build time by Nitro
const ws = import.meta._websocket ? wsAdapter(nitroApp.h3App.websocket) : undefined

const listen = resolveListenOptions()

async function handleFetch(req: Request, serverRef: unknown) {
  // @ts-expect-error replaced at build time by Nitro
  if (import.meta._websocket && req.headers.get('upgrade') === 'websocket') {
    return ws!.handleUpgrade(req, serverRef)
  }
  const url = new URL(req.url)
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
  return Bun.serve({
    port: binding.port,
    hostname: binding.host,
    idleTimeout: Number.parseInt(process.env.NITRO_BUN_IDLE_TIMEOUT || '') || undefined,
    // @ts-expect-error replaced at build time by Nitro
    websocket: import.meta._websocket ? ws?.websocket : undefined,
    ...(binding.tls
      ? {
          tls: {
            cert: readFileSync(binding.tls.certPath, 'utf8'),
            key: readFileSync(binding.tls.keyPath, 'utf8'),
          },
        }
      : {}),
    fetch: handleFetch,
  })
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

// @ts-expect-error replaced at build time by Nitro
if (import.meta._tasks) {
  startScheduleRunner()
}
