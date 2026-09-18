import type { Server } from 'bun'
import type { ListenBinding } from '../utils/listen'
import { resolveIdleTimeoutSeconds } from '../utils/idleTimeout'
import {
  buildEdgeTlsOptions,
  fingerprintEdgeTls,
  shouldBindEdgeHttps,
} from './tls'
import { proxyLog } from './proxyLog'

type EdgeFetch = (req: Request, server: unknown) => Response | Promise<Response | undefined>

type EdgeHttpsRuntime = {
  binding: ListenBinding
  fetch: EdgeFetch
  websocket: object
}

type BunTlsBodies = NonNullable<ReturnType<typeof buildEdgeTlsOptions>>

/** Max wait for graceful :443 drain before force-stop (WebSocket/SSE can hold forever). */
export const EDGE_HTTPS_DRAIN_MS = 2_000

/** Coalesce rapid Proxy Host saves into one SNI update. */
export const EDGE_HTTPS_RELOAD_DEBOUNCE_MS = 750

let runtime: EdgeHttpsRuntime | null = null
let httpsServer: Server | null = null
let reloadQueue: Promise<void> = Promise.resolve()
let scheduledReload: ReturnType<typeof setTimeout> | null = null
let lastTlsFingerprint = ''

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
  if (server) {
    const want = shouldBindEdgeHttps()
    lastTlsFingerprint = fingerprintEdgeTls(want ? buildEdgeTlsOptions() : null)
  }
  else {
    lastTlsFingerprint = ''
  }
}

function serveOptions(tlsBodies: BunTlsBodies) {
  if (!runtime) {
    throw new Error('edge HTTPS runtime not registered')
  }
  return {
    port: runtime.binding.port,
    hostname: runtime.binding.host,
    idleTimeout: resolveIdleTimeoutSeconds('edge'),
    tls: tlsBodies,
    http2: true,
    fetch: (req: Request, server: unknown) => runtime!.fetch(req, server),
    websocket: runtime.websocket,
  } as Parameters<typeof Bun.serve>[0]
}

function startHttps(tlsBodies: BunTlsBodies): Server {
  return Bun.serve(serveOptions(tlsBodies))
}

async function startHttpsWithRetry(tlsBodies: BunTlsBodies): Promise<Server> {
  let lastError: unknown
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return startHttps(tlsBodies)
    }
    catch (error) {
      lastError = error
      // Port may still be releasing after a graceful stop.
      await Bun.sleep(25 * (attempt + 1))
    }
  }
  throw lastError
}

/**
 * Prefer graceful drain (keeps in-flight reserved-host Nitro responses intact),
 * but never block rebind longer than EDGE_HTTPS_DRAIN_MS.
 */
export async function stopHttpsWithDrainCap(
  server: Server,
  drainMs = EDGE_HTTPS_DRAIN_MS,
): Promise<'graceful' | 'forced'> {
  const graceful = server.stop(false)
  const timedOut = await Promise.race([
    graceful.then(() => false as const),
    Bun.sleep(drainMs).then(() => true as const),
  ])
  if (!timedOut) {
    return 'graceful'
  }
  try {
    await server.stop(true)
  }
  catch {
    // Already closed by the in-flight graceful stop.
  }
  return 'forced'
}

/**
 * Hot-update SNI/TLS on the live :443 listener (Bun.serve reload).
 * Does not drop the socket — other Proxy Hosts keep working across host add/remove.
 */
export function applyEdgeHttpsTlsHot(
  server: Server,
  tlsBodies: BunTlsBodies,
): Server {
  if (!runtime) {
    throw new Error('edge HTTPS runtime not registered')
  }
  return server.reload(serveOptions(tlsBodies))
}

async function reloadEdgeHttpsUnlocked(): Promise<void> {
  if (!runtime) {
    return
  }

  const want = shouldBindEdgeHttps()
  const tlsBodies = want ? buildEdgeTlsOptions() : null
  const nextFingerprint = fingerprintEdgeTls(tlsBodies)

  // Routes already hot-swapped — skip when SNI PEMs + serverNames are identical.
  if (httpsServer && nextFingerprint === lastTlsFingerprint && nextFingerprint !== '') {
    proxyLog('debug', '[acmedns] Edge HTTPS SNI unchanged — skip rebind')
    return
  }
  if (!httpsServer && !tlsBodies && lastTlsFingerprint === '') {
    return
  }

  // Still have a live HTTPS listener and still want TLS: hot-reload SNI in place.
  // stop()+rebind briefly refuses :443 and kills every other host — unacceptable for NPM parity.
  if (httpsServer && tlsBodies) {
    try {
      httpsServer = applyEdgeHttpsTlsHot(httpsServer, tlsBodies)
      lastTlsFingerprint = nextFingerprint
      proxyLog('info', `[acmedns] Edge HTTPS SNI hot-reloaded on ${httpsServer.url} (no port drop)`)
      return
    }
    catch (error) {
      proxyLog(
        'warn',
        `[acmedns] Edge HTTPS hot-reload failed — falling back to rebind: ${
          error instanceof Error ? error.message : error
        }`,
      )
    }
  }

  if (httpsServer) {
    const how = await stopHttpsWithDrainCap(httpsServer)
    if (how === 'forced') {
      proxyLog('warn', `[acmedns] Edge HTTPS drain timed out after ${EDGE_HTTPS_DRAIN_MS}ms — forced stop`)
    }
    httpsServer = null
  }

  if (!tlsBodies) {
    lastTlsFingerprint = ''
    proxyLog('info', '[acmedns] Edge HTTPS idle — no readable PEMs / SSL hosts')
    return
  }

  httpsServer = await startHttpsWithRetry(tlsBodies)
  lastTlsFingerprint = nextFingerprint
  proxyLog('info', `[acmedns] Edge HTTPS rebound on ${httpsServer.url} (SNI)`)
}

/** Rebuild SNI material without dropping live traffic when possible. */
export function reloadEdgeHttps(): Promise<void> {
  reloadQueue = reloadQueue
    .then(() => reloadEdgeHttpsUnlocked())
    .catch((error) => {
      proxyLog('warn', `[acmedns] Edge HTTPS reload failed: ${error instanceof Error ? error.message : error}`)
    })
  return reloadQueue
}

/**
 * Debounce + defer SNI update so the current API response can flush first.
 * Prefer this from Proxy Host writes and production `/live` cert changes.
 */
export function scheduleEdgeHttpsReload(delayMs = EDGE_HTTPS_RELOAD_DEBOUNCE_MS): void {
  if (scheduledReload) {
    clearTimeout(scheduledReload)
  }
  scheduledReload = setTimeout(() => {
    scheduledReload = null
    void reloadEdgeHttps()
  }, delayMs)
}
