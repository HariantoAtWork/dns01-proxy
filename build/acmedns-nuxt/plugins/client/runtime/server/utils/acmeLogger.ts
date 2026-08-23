import acme from 'acme-client'
import type { CertActivityLevel, LetsEncryptDirectoryMode } from '#shared/types/certs'
import { appendCertActivity } from './certActivity'
import { clearCertRateLimit, recordCertRateLimit } from './certRateLimit'

interface AcmeLogContext {
  certName: string
  mode: LetsEncryptDirectoryMode
  rateLimitAbort?: AbortController
}

let context: AcmeLogContext | null = null
let installed = false
let last429Endpoint: string | undefined

const RETRY_AFTER_RE = /retry-after response header with value:\s*(\d+)/i
const WAITING_SECONDS_RE = /waiting\s+(\d+)\s+seconds/i
const HTTP_429_RE = /Caught HTTP 429.*?URL\s+(\S+)/i
const HTTP_429_SIMPLE_RE = /Caught HTTP 429/i

function classifyAcmeLevel(message: string): CertActivityLevel {
  const lower = message.toLowerCase()
  if (
    lower.includes('unable to')
    || lower.includes(' threw error')
    || lower.includes('returned error')
    || /^resp [45]\d\d/.test(lower)
    || lower.includes('caught http 429')
    || RETRY_AFTER_RE.test(message)
  ) {
    return 'error'
  }
  if (lower.includes('skipping') || lower.includes('deactivating')) {
    return 'warn'
  }
  return 'info'
}

function shortEndpoint(url: string) {
  try {
    return new URL(url).pathname
  }
  catch {
    return url
  }
}

function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const days = Math.floor(s / 86400)
  const hours = Math.floor((s % 86400) / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const parts: string[] = []
  if (days) {
    parts.push(`${days}d`)
  }
  if (hours) {
    parts.push(`${hours}h`)
  }
  if (minutes || !parts.length) {
    parts.push(`${minutes}m`)
  }
  return parts.join(' ')
}

function noteRateLimitFromMessage(message: string) {
  const hit429 = HTTP_429_RE.exec(message)
  if (hit429?.[1]) {
    last429Endpoint = hit429[1]
  }
  else if (HTTP_429_SIMPLE_RE.test(message) && !last429Endpoint) {
    last429Endpoint = undefined
  }

  const match = RETRY_AFTER_RE.exec(message) || WAITING_SECONDS_RE.exec(message)
  if (!match || !context) {
    return
  }

  const seconds = Number(match[1])
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return
  }

  const { mode, certName, rateLimitAbort } = context
  const endpoint = last429Endpoint
  last429Endpoint = undefined

  void recordCertRateLimit({
    mode,
    certName,
    retryAfterSeconds: seconds,
    endpoint,
    detail: `Let's Encrypt rate limit (HTTP 429) — wait ${formatDuration(seconds)}`
      + (endpoint ? ` before retrying ${shortEndpoint(endpoint)}` : ''),
  }).then((entry) => {
    appendCertActivity({
      source: 'acme',
      level: 'error',
      certName,
      message: `${entry.detail} · resumes ${entry.until}`,
    })
    try {
      rateLimitAbort?.abort(
        Object.assign(new Error(entry.detail), { name: 'AbortError', rateLimited: true }),
      )
    }
    catch {
      // already aborted
    }
  }).catch((error) => {
    console.warn('[acme] failed to persist rate limit', error)
  })
}

export function installAcmeLogger() {
  if (installed) {
    return
  }
  installed = true

  acme.setLogger((message: string) => {
    noteRateLimitFromMessage(message)
    appendCertActivity({
      source: 'acme',
      level: classifyAcmeLevel(message),
      certName: context?.certName,
      message,
    })
  })
}

export async function withAcmeLogContext<T>(
  ctx: { certName: string, mode: LetsEncryptDirectoryMode },
  fn: (rateLimitSignal: AbortSignal) => Promise<T>,
): Promise<T> {
  installAcmeLogger()
  const rateLimitAbort = new AbortController()
  context = { ...ctx, rateLimitAbort }
  try {
    return await fn(rateLimitAbort.signal)
  }
  finally {
    context = null
  }
}

export function logAcmeStep(
  certName: string,
  message: string,
  level: CertActivityLevel = 'info',
) {
  appendCertActivity({ source: 'acme', level, certName, message })
}

export async function clearRateLimitAfterSuccess(
  mode: LetsEncryptDirectoryMode,
  certName: string,
) {
  await clearCertRateLimit({ mode, certName })
}
