import '#nitro-internal-pollyfills'
import { readFileSync } from 'node:fs'
import { useNitroApp } from 'nitropack/runtime'
import { startScheduleRunner } from 'nitropack/runtime/internal'
import wsAdapter from 'crossws/adapters/bun'
import { resolveListenOptions } from './utils/listen'

const nitroApp = useNitroApp()
// @ts-expect-error replaced at build time by Nitro
const ws = import.meta._websocket ? wsAdapter(nitroApp.h3App.websocket) : undefined

const listen = resolveListenOptions()

const server = Bun.serve({
  port: listen.port,
  host: listen.host,
  idleTimeout: Number.parseInt(process.env.NITRO_BUN_IDLE_TIMEOUT || '') || undefined,
  // @ts-expect-error replaced at build time by Nitro
  websocket: import.meta._websocket ? ws?.websocket : undefined,
  ...(listen.tls
    ? {
        tls: {
          cert: readFileSync(listen.tls.certPath, 'utf8'),
          key: readFileSync(listen.tls.keyPath, 'utf8'),
        },
      }
    : {}),
  async fetch(req, serverRef) {
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
  },
})

const mode = listen.tls ? 'HTTPS' : 'HTTP'
console.log(`[acmedns] Listening ${mode} on ${server.url} (api.tls=${listen.tls ? 'cert' : 'none'})`)

// @ts-expect-error replaced at build time by Nitro
if (import.meta._tasks) {
  startScheduleRunner()
}
