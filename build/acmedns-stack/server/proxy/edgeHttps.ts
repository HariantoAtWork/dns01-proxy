import type { Server } from 'bun'
import type { ListenBinding } from '../utils/listen'
import { resolveIdleTimeoutSeconds } from '../utils/idleTimeout'
import { buildEdgeTlsOptions, shouldBindEdgeHttps } from './tls'
import { proxyLog } from './proxyLog'

type EdgeFetch = (req: Request, server: unknown) => Response | Promise<Response | undefined>

type EdgeHttpsRuntime = {
  binding: ListenBinding
  fetch: EdgeFetch
  websocket: object
}

let runtime: EdgeHttpsRuntime | null = null
let httpsServer: Server | null = null
let reloadQueue: Promise<void> = Promise.resolve()

/**
 * Remember how to (re)bind edge HTTPS after Proxy Host / cert changes.
 * Call once from process entry after the initial listen.
 */
export function registerEdgeHttpsRuntime(
  options: EdgeHttpsRuntime,
  server: Server | null,
): void {
  runtime = options
  httpsServer = server
}

function startHttps(tlsBodies: NonNullable<ReturnType<typeof buildEdgeTlsOptions>>): Server {
  if (!runtime) {
    throw new Error('edge HTTPS runtime not registered')
  }
  return Bun.serve({
    port: runtime.binding.port,
    hostname: runtime.binding.host,
    idleTimeout: resolveIdleTimeoutSeconds('edge'),
    tls: tlsBodies,
    http2: true,
    fetch: (req, server) => runtime!.fetch(req, server),
    websocket: runtime.websocket,
  } as Parameters<typeof Bun.serve>[0])
}

async function reloadEdgeHttpsUnlocked(): Promise<void> {
  if (!runtime) {
    return
  }

  const want = shouldBindEdgeHttps()
  const tlsBodies = want ? buildEdgeTlsOptions() : null

  if (httpsServer) {
    await httpsServer.stop(true)
    httpsServer = null
  }

  if (!tlsBodies) {
    proxyLog('info', '[acmedns] Edge HTTPS idle — no readable PEMs / SSL hosts')
    return
  }

  httpsServer = startHttps(tlsBodies)
  proxyLog('info', `[acmedns] Edge HTTPS reloaded on ${httpsServer.url} (SNI)`)
}

/** Rebuild SNI material and rebind :443 without restarting the whole process. */
export function reloadEdgeHttps(): Promise<void> {
  reloadQueue = reloadQueue
    .then(() => reloadEdgeHttpsUnlocked())
    .catch((error) => {
      proxyLog('warn', `[acmedns] Edge HTTPS reload failed: ${error instanceof Error ? error.message : error}`)
    })
  return reloadQueue
}
