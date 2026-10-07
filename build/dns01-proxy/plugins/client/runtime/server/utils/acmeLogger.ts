import acme from 'acme-client'
import type { CertActivityLevel, LetsEncryptDirectoryMode } from '#shared/types/certs'
import { appendCertActivity } from './certActivity'
import { clearCertRateLimit, recordCertRateLimit } from './certRateLimit'

/** HTTP 429 / 5xx retries inside acme-client axios (default library: 5). */
export const ACME_HTTP_RETRY_MAX_ATTEMPTS = (() => {
  const raw = Number(process.env.ACME_HTTP_RETRY_MAX_ATTEMPTS ?? 3)
  if (!Number.isFinite(raw)) {
    return 3
  }
  return Math.max(0, Math.min(10, Math.floor(raw)))
})()

interface AcmeLogContext {
  certName: string
  mode: LetsEncryptDirectoryMode
  rateLimitAbort?: AbortController
  /** How many Retry-After / wait messages we acted on in this cert run. */
  rateLimitHits: number
}

let context: AcmeLogContext | null = null
let installed = false
let last429Endpoint: string | undefined
let httpRetriesConfigured = false

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

/** Cap acme-client's axios 429/5xx retry loop (sleeps are not cancelable). */
export function configureAcmeHttpRetries() {
  if (httpRetriesConfigured) {
    return
  }
  httpRetriesConfigured = true
  const defaults = acme.axios.defaults as {
    acmeSettings?: { retryMaxAttempts?: number, retryDefaultDelay?: number }
  }
  if (!defaults.acmeSettings) {
    defaults.acmeSettings = {}
  }
  defaults.acmeSettings.retryMaxAttempts = ACME_HTTP_RETRY_MAX_ATTEMPTS
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

  context.rateLimitHits += 1
  const { mode, certName, rateLimitAbort, rateLimitHits } = context
  const endpoint = last429Endpoint
  last429Endpoint = undefined

  // First hit wins the persisted cooldown; later axios retries must not stack "until".
  if (rateLimitHits > 1) {
    if (rateLimitHits >= ACME_HTTP_RETRY_MAX_ATTEMPTS) {
      try {
        rateLimitAbort?.abort(
          Object.assign(
            new Error(
              `Let's Encrypt rate limit — stopped after ${ACME_HTTP_RETRY_MAX_ATTEMPTS} HTTP retry attempt(s)`,
            ),
            { name: 'AbortError', rateLimited: true },
          ),
        )
      }
      catch {
        // already aborted
      }
    }
    return
  }

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
      mode,
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
  configureAcmeHttpRetries()

  acme.setLogger((message: string) => {
    noteRateLimitFromMessage(message)
    appendCertActivity({
      source: 'acme',
      mode: context?.mode,
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
  context = { ...ctx, rateLimitAbort, rateLimitHits: 0 }
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
  appendCertActivity({
    source: 'acme',
    mode: context?.mode,
    level,
    certName,
    message,
  })
}

export async function clearRateLimitAfterSuccess(
  mode: LetsEncryptDirectoryMode,
  certName: string,
) {
  await clearCertRateLimit({ mode, certName })
}
