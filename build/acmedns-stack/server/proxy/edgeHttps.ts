import type { Server } from 'bun'
import type { ListenBinding } from '../utils/listen'
import { resolveIdleTimeoutSeconds } from '../utils/idleTimeout'
import {
  buildEdgeTlsOptions,
  fingerprintEdgeTls,
  fingerprintEdgeTlsPems,
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
let lastPemFingerprint = ''

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
    const bodies = want ? buildEdgeTlsOptions() : null
    lastTlsFingerprint = fingerprintEdgeTls(bodies)
    lastPemFingerprint = fingerprintEdgeTlsPems(bodies)
  }
  else {
    lastTlsFingerprint = ''
    lastPemFingerprint = ''
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
 * Bun.serve().reload() with new TLS options — for regression tests only.
 * Production must rebind: reload neither swaps PEM bodies for existing
 * serverNames nor registers newly added serverNames (unmatched SNI keeps the
 * no-SNI default cert, often the auth zone).
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
  const nextPemFingerprint = fingerprintEdgeTlsPems(tlsBodies)

  // Routes already hot-swapped — skip when SNI PEMs + serverNames are identical.
  if (httpsServer && nextFingerprint === lastTlsFingerprint && nextFingerprint !== '') {
    proxyLog('debug', '[acmedns] Edge HTTPS SNI unchanged — skip rebind')
    return
  }
  if (!httpsServer && !tlsBodies && lastTlsFingerprint === '') {
    return
  }

  // Bun.serve().reload() is not reliable for TLS:
  // - PEM body changes keep the old leaf for existing serverNames
  // - newly added serverNames never bind (unmatched SNI → auth/default cert)
  // Always stop+rebind :443 when the fingerprint changes.
  if (httpsServer && tlsBodies) {
    if (nextPemFingerprint !== lastPemFingerprint) {
      proxyLog('info', '[acmedns] Edge HTTPS PEMs changed — rebinding :443 (Bun reload cannot swap cert bodies)')
    }
    else {
      proxyLog('info', '[acmedns] Edge HTTPS SNI names changed — rebinding :443 (Bun reload cannot add serverNames)')
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
    lastPemFingerprint = ''
    proxyLog('info', '[acmedns] Edge HTTPS idle — no readable PEMs / SSL hosts')
    return
  }

  httpsServer = await startHttpsWithRetry(tlsBodies)
  lastTlsFingerprint = nextFingerprint
  lastPemFingerprint = nextPemFingerprint
  proxyLog('info', `[acmedns] Edge HTTPS rebound on ${httpsServer.url} (SNI)`)
}

/** Rebuild SNI material (short :443 drain + rebind when TLS fingerprint changes). */
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
