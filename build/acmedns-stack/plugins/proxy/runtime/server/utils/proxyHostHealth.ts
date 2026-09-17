import { connect as netConnect } from 'node:net'

export type ProxyHostHealthProbe = {
  online: boolean
  latencyMs: number
  status?: number
  target: string
  via?: 'http' | 'tcp'
  error?: string
}

type ProbeTarget = {
  forwardScheme: 'http' | 'https'
  forwardHost: string
  forwardPort: number
}

const DEFAULT_TIMEOUT_MS = 3000
/** Public/hairpin probes stay short so a large Hosts list cannot pin the edge. */
const DEFAULT_REMOTE_TIMEOUT_MS = 2500

/** Process-wide cap: remote probes hairpin back into this Bun edge. */
const REMOTE_PROBE_CONCURRENCY = 1

let remoteProbeActive = 0
const remoteProbeWaiters: Array<() => void> = []

async function withRemoteProbeSlot<T>(fn: () => Promise<T>): Promise<T> {
  while (remoteProbeActive >= REMOTE_PROBE_CONCURRENCY) {
    await new Promise<void>((resolve) => {
      remoteProbeWaiters.push(resolve)
    })
  }
  remoteProbeActive += 1
  try {
    return await fn()
  }
  finally {
    remoteProbeActive -= 1
    const next = remoteProbeWaiters.shift()
    next?.()
  }
}

function probeUrl(target: ProbeTarget): string {
  return `${target.forwardScheme}://${target.forwardHost}:${target.forwardPort}/`
}

type BunFetchInit = RequestInit & {
  tls?: { rejectUnauthorized: boolean }
}

function fetchInit(method: 'HEAD' | 'GET', signal: AbortSignal): BunFetchInit {
  return {
    method,
    redirect: 'manual',
    signal,
    // Upstream containers often use self-signed / private CA certs (mail, code-server).
    tls: { rejectUnauthorized: false },
  }
}

/** Release the socket — unread bodies pin Bun/undici connections and starve other hosts. */
async function releaseResponse(res: Response): Promise<void> {
  try {
    await res.body?.cancel()
  }
  catch {
    // Already closed or consumed.
  }
}

async function fetchOnce(
  url: string,
  method: 'HEAD' | 'GET',
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, fetchInit(method, controller.signal))
  }
  finally {
    clearTimeout(timer)
  }
}

/** Short, stable probe error labels for UI tooltips. */
export function classifyProbeError(message: string): string {
  const text = message.trim() || 'probe failed'
  if (/ENOTFOUND|getaddrinfo|EAI_AGAIN/i.test(text)) {
    return 'DNS: hostname not found'
  }
  if (/timeout|aborted|AbortError|The operation was aborted/i.test(text)) {
    return 'timeout'
  }
  if (/CERTIFICATE|CERT_|UNKNOWN_CERTIFICATE|SSL|TLS/i.test(text)) {
    return 'TLS probe failed'
  }
  if (/ECONNREFUSED/i.test(text)) {
    return 'connection refused'
  }
  return text.length > 96 ? `${text.slice(0, 93)}…` : text
}

async function probeHttp(
  url: string,
  timeoutMs: number,
): Promise<{ status: number } | { error: string }> {
  // Prefer GET: many upstreams mishandle HEAD, and a single timed attempt is enough
  // before we fall back to TCP.
  try {
    const res = await fetchOnce(url, 'GET', timeoutMs)
    const status = res.status
    await releaseResponse(res)
    return { status }
  }
  catch (getError) {
    try {
      const head = await fetchOnce(url, 'HEAD', Math.min(1000, timeoutMs))
      const status = head.status
      await releaseResponse(head)
      return { status }
    }
    catch (headError) {
      const message = getError instanceof Error
        ? getError.message
        : headError instanceof Error
          ? headError.message
          : 'http probe failed'
      return { error: classifyProbeError(message) }
    }
  }
}

async function probeTcp(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<{ ok: true } | { error: string }> {
  return await new Promise((resolve) => {
    const socket = netConnect({ host, port })
    let settled = false

    const finish = (result: { ok: true } | { error: string }) => {
      if (settled) {
        return
      }
      settled = true
      socket.destroy()
      resolve(result)
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish({ ok: true }))
    socket.once('timeout', () => finish({ error: 'tcp timeout' }))
    socket.once('error', (error) => {
      finish({ error: error instanceof Error ? error.message : 'tcp error' })
    })
  })
}

function validateProbeTarget(target: ProbeTarget): string | null {
  const host = typeof target.forwardHost === 'string' ? target.forwardHost.trim() : ''
  if (!host) {
    return 'forward host is empty'
  }
  if (!Number.isFinite(target.forwardPort) || target.forwardPort <= 0 || target.forwardPort > 65535) {
    return `forward port is invalid (${String(target.forwardPort)})`
  }
  if (target.forwardScheme !== 'http' && target.forwardScheme !== 'https') {
    return `forward scheme is invalid (${String(target.forwardScheme)})`
  }
  return null
}

/**
 * Reachability for Proxy Host status column.
 * Any HTTP response counts as online; HTTPS skips cert verify; TCP connect is fallback
 * when the upstream speaks TLS on an `http://` target (e.g. code-server :8443).
 */
export async function probeProxyHostHealth(
  target: ProbeTarget,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ProxyHostHealthProbe> {
  const invalid = validateProbeTarget(target)
  if (invalid) {
    return {
      online: false,
      latencyMs: 0,
      target: probeUrl({
        ...target,
        forwardHost: target.forwardHost?.trim() || '(empty)',
      }),
      error: invalid,
    }
  }

  const url = probeUrl(target)
  const started = Date.now()
  const http = await probeHttp(url, timeoutMs)
  if ('status' in http) {
    return {
      online: true,
      latencyMs: Date.now() - started,
      status: http.status,
      target: url,
      via: 'http',
    }
  }

  const tcp = await probeTcp(target.forwardHost.trim(), target.forwardPort, timeoutMs)
  if ('ok' in tcp) {
    return {
      online: true,
      latencyMs: Date.now() - started,
      target: url,
      via: 'tcp',
    }
  }

  return {
    online: false,
    latencyMs: Date.now() - started,
    target: url,
    error: `${http.error}; ${classifyProbeError(tcp.error)}`,
  }
}

export type ProxyRemoteHealthProbe = {
  online: boolean
  latencyMs: number
  status?: number
  target: string
  error?: string
}

/**
 * Reachability for Proxy Host Source-column LEDs.
 * Probes the public site URL (same as the Source link). HTTP(S) only — no TCP fallback.
 * Any HTTP response counts as online.
 *
 * Serialized process-wide so a large Hosts list cannot hairpin-DoS live :80/:443 traffic.
 */
export async function probeProxyRemoteHealth(
  url: string,
  timeoutMs = DEFAULT_REMOTE_TIMEOUT_MS,
): Promise<ProxyRemoteHealthProbe> {
  return await withRemoteProbeSlot(() => probeProxyRemoteHealthUnlocked(url, timeoutMs))
}

async function probeProxyRemoteHealthUnlocked(
  url: string,
  timeoutMs: number,
): Promise<ProxyRemoteHealthProbe> {
  const target = typeof url === 'string' ? url.trim() : ''
  if (!target) {
    return {
      online: false,
      latencyMs: 0,
      target: '(empty)',
      error: 'remote URL is empty',
    }
  }

  const started = Date.now()
  const http = await probeHttp(target, timeoutMs)
  if ('status' in http) {
    return {
      online: true,
      latencyMs: Date.now() - started,
      status: http.status,
      target,
    }
  }

  return {
    online: false,
    latencyMs: Date.now() - started,
    target,
    error: http.error,
  }
}
