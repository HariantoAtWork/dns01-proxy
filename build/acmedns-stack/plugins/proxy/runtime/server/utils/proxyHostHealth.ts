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

async function probeHttp(
  url: string,
  timeoutMs: number,
): Promise<{ status: number } | { error: string }> {
  // Prefer GET: many upstreams mishandle HEAD, and a single timed attempt is enough
  // before we fall back to TCP.
  try {
    const res = await fetchOnce(url, 'GET', timeoutMs)
    return { status: res.status }
  }
  catch (getError) {
    try {
      const head = await fetchOnce(url, 'HEAD', Math.min(1000, timeoutMs))
      return { status: head.status }
    }
    catch (headError) {
      const message = getError instanceof Error
        ? getError.message
        : headError instanceof Error
          ? headError.message
          : 'http probe failed'
      return { error: message }
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

/**
 * Reachability for Proxy Host status column.
 * Any HTTP response counts as online; HTTPS skips cert verify; TCP connect is fallback
 * when the upstream speaks TLS on an `http://` target (e.g. code-server :8443).
 */
export async function probeProxyHostHealth(
  target: ProbeTarget,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ProxyHostHealthProbe> {
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

  const tcp = await probeTcp(target.forwardHost, target.forwardPort, timeoutMs)
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
    error: `${http.error}; ${tcp.error}`,
  }
}
