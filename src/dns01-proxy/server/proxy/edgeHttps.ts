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

/** Background heal when :443 is down after a failed rebind. */
export const EDGE_HTTPS_HEAL_MS = 2_000

/** Bind attempts after stop (port release on Linux can exceed a few hundred ms). */
export const EDGE_HTTPS_BIND_ATTEMPTS = 12

let runtime: EdgeHttpsRuntime | null = null
let httpsServer: Server | null = null
let lastTlsBodies: BunTlsBodies | null = null
let reloadQueue: Promise<void> = Promise.resolve()
let scheduledReload: ReturnType<typeof setTimeout> | null = null
let scheduledHeal: ReturnType<typeof setTimeout> | null = null
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
    lastTlsBodies = bodies
    lastTlsFingerprint = fingerprintEdgeTls(bodies)
    lastPemFingerprint = fingerprintEdgeTlsPems(bodies)
  }
  else {
    lastTlsBodies = null
    lastTlsFingerprint = ''
    lastPemFingerprint = ''
  }
  clearEdgeHttpsHeal()
}

function serveOptions(tlsBodies: BunTlsBodies, reusePort = true) {
  if (!runtime) {
    throw new Error('edge HTTPS runtime not registered')
  }
  return {
    port: runtime.binding.port,
    hostname: runtime.binding.host,
    idleTimeout: resolveIdleTimeoutSeconds('edge'),
    // SO_REUSEPORT lets us bind the next SNI set before stopping the old listener,
    // so a Proxy Host add does not open a :443 black hole for every Source.
    reusePort,
    tls: tlsBodies,
    http2: true,
    fetch: (req: Request, server: unknown) => runtime!.fetch(req, server),
    websocket: runtime.websocket,
  } as Parameters<typeof Bun.serve>[0]
}

function startHttps(tlsBodies: BunTlsBodies, reusePort = true): Server {
  return Bun.serve(serveOptions(tlsBodies, reusePort))
}

async function startHttpsWithRetry(
  tlsBodies: BunTlsBodies,
  reusePort = true,
): Promise<Server> {
  let lastError: unknown
  for (let attempt = 0; attempt < EDGE_HTTPS_BIND_ATTEMPTS; attempt++) {
    try {
      return startHttps(tlsBodies, reusePort)
    }
    catch (error) {
      lastError = error
      // Port may still be releasing after a graceful/forced stop.
      await Bun.sleep(Math.min(2_000, 50 * (attempt + 1) ** 2))
    }
  }
  throw lastError
}

function clearEdgeHttpsHeal(): void {
  if (scheduledHeal) {
    clearTimeout(scheduledHeal)
    scheduledHeal = null
  }
}

/** Keep retrying bind when :443 is dead until something else succeeds or PEMs go idle. */
function scheduleEdgeHttpsHeal(delayMs = EDGE_HTTPS_HEAL_MS): void {
  if (scheduledHeal) {
    return
  }
  scheduledHeal = setTimeout(() => {
    scheduledHeal = null
    if (httpsServer) {
      return
    }
    proxyLog('warn', '[acmedns] Edge HTTPS heal — retrying :443 bind')
    void reloadEdgeHttps()
  }, delayMs)
}

function rememberBound(server: Server, tlsBodies: BunTlsBodies): void {
  httpsServer = server
  lastTlsBodies = tlsBodies
  lastTlsFingerprint = fingerprintEdgeTls(tlsBodies)
  lastPemFingerprint = fingerprintEdgeTlsPems(tlsBodies)
  clearEdgeHttpsHeal()
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
  return server.reload(serveOptions(tlsBodies, true))
}

/** True when the edge HTTPS listener is currently bound. */
export function isEdgeHttpsBound(): boolean {
  return httpsServer != null
}

async function rollbackHttps(previousTls: BunTlsBodies | null, reason: unknown): Promise<void> {
  const detail = reason instanceof Error ? reason.message : String(reason)
  if (!previousTls) {
    httpsServer = null
    scheduleEdgeHttpsHeal()
    throw new Error(`Edge HTTPS bind failed and no previous TLS to restore: ${detail}`)
  }

  try {
    const restored = await startHttpsWithRetry(previousTls, true)
    rememberBound(restored, previousTls)
    proxyLog(
      'warn',
      `[acmedns] Edge HTTPS rolled back to previous SNI after bind failure: ${detail}`,
    )
  }
  catch (rollbackError) {
    httpsServer = null
    scheduleEdgeHttpsHeal()
    const rollbackDetail = rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
    throw new Error(
      `Edge HTTPS bind failed (${detail}); rollback also failed (${rollbackDetail})`,
    )
  }
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
  // Prefer overlap rebind (reusePort); fall back to stop+start with rollback.
  if (httpsServer && tlsBodies) {
    if (nextPemFingerprint !== lastPemFingerprint) {
      proxyLog('info', '[acmedns] Edge HTTPS PEMs changed — rebinding :443 (Bun reload cannot swap cert bodies)')
    }
    else {
      proxyLog('info', '[acmedns] Edge HTTPS SNI names changed — rebinding :443 (Bun reload cannot add serverNames)')
    }
  }

  const previousTls = lastTlsBodies
  const previousServer = httpsServer

  // Idle: no PEMs / SSL hosts — stop cleanly.
  if (!tlsBodies) {
    if (previousServer) {
      const how = await stopHttpsWithDrainCap(previousServer)
      if (how === 'forced') {
        proxyLog('warn', `[acmedns] Edge HTTPS drain timed out after ${EDGE_HTTPS_DRAIN_MS}ms — forced stop`)
      }
    }
    httpsServer = null
    lastTlsBodies = null
    lastTlsFingerprint = ''
    lastPemFingerprint = ''
    clearEdgeHttpsHeal()
    proxyLog('info', '[acmedns] Edge HTTPS idle — no readable PEMs / SSL hosts')
    return
  }

  // Overlap: bind next SNI set first (SO_REUSEPORT), then drain the old listener.
  // Existing Sources keep answering on :443 while the new server comes up.
  if (previousServer) {
    try {
      const nextServer = await startHttpsWithRetry(tlsBodies, true)
      rememberBound(nextServer, tlsBodies)
      const how = await stopHttpsWithDrainCap(previousServer)
      if (how === 'forced') {
        proxyLog('warn', `[acmedns] Edge HTTPS previous listener drain timed out after ${EDGE_HTTPS_DRAIN_MS}ms — forced stop`)
      }
      proxyLog('info', `[acmedns] Edge HTTPS rebound on ${nextServer.url} (SNI, overlap)`)
      return
    }
    catch (overlapError) {
      proxyLog(
        'warn',
        `[acmedns] Edge HTTPS overlap bind failed — falling back to stop+start: ${
          overlapError instanceof Error ? overlapError.message : overlapError
        }`,
      )
    }
  }

  // Stop+start fallback (also used when nothing is bound yet).
  if (previousServer && httpsServer === previousServer) {
    const how = await stopHttpsWithDrainCap(previousServer)
    if (how === 'forced') {
      proxyLog('warn', `[acmedns] Edge HTTPS drain timed out after ${EDGE_HTTPS_DRAIN_MS}ms — forced stop`)
    }
    httpsServer = null
  }

  try {
    const nextServer = await startHttpsWithRetry(tlsBodies, true)
    rememberBound(nextServer, tlsBodies)
    proxyLog('info', `[acmedns] Edge HTTPS rebound on ${nextServer.url} (SNI)`)
  }
  catch (error) {
    await rollbackHttps(previousTls, error)
  }
}

/** Rebuild SNI material (short :443 drain + rebind when TLS fingerprint changes). */
export function reloadEdgeHttps(): Promise<void> {
  reloadQueue = reloadQueue
    .then(() => reloadEdgeHttpsUnlocked())
    .catch((error) => {
      proxyLog('warn', `[acmedns] Edge HTTPS reload failed: ${error instanceof Error ? error.message : error}`)
      if (!httpsServer) {
        scheduleEdgeHttpsHeal()
      }
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

/** Test helper — clear timers / runtime between cases. */
export function resetEdgeHttpsForTests(): void {
  if (scheduledReload) {
    clearTimeout(scheduledReload)
    scheduledReload = null
  }
  clearEdgeHttpsHeal()
  if (httpsServer) {
    try {
      void httpsServer.stop(true)
    }
    catch {
      // ignore
    }
  }
  runtime = null
  httpsServer = null
  lastTlsBodies = null
  lastTlsFingerprint = ''
  lastPemFingerprint = ''
  reloadQueue = Promise.resolve()
}
