import { dirname, join } from 'node:path'
import { promises as fs } from 'node:fs'
import type { CertRateLimit, LetsEncryptDirectoryMode } from '#shared/types/certs'
import { getCertSettingsPath } from './certSettings'
import { publishCertLive } from './certLiveBus'

interface StoreFile {
  limits: CertRateLimit[]
}

let cache: CertRateLimit[] | null = null
let loadPromise: Promise<void> | null = null

function rateLimitPath() {
  return join(dirname(getCertSettingsPath()), 'cert-rate-limits.json')
}

function limitId(entry: Pick<CertRateLimit, 'mode' | 'scope' | 'certName'>) {
  if (entry.scope === 'account') {
    return `${entry.mode}:account`
  }
  return `${entry.mode}:cert:${entry.certName || 'unknown'}`
}

function pruneExpired(limits: CertRateLimit[], now = Date.now()) {
  return limits.filter(entry => Date.parse(entry.until) > now)
}

async function ensureLoaded() {
  if (cache) {
    return
  }
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const raw = await fs.readFile(rateLimitPath(), 'utf-8')
        const parsed = JSON.parse(raw) as StoreFile
        cache = pruneExpired(Array.isArray(parsed.limits) ? parsed.limits : [])
      }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code !== 'ENOENT') {
          console.warn('[cert-rate-limit] failed to load', error)
        }
        cache = []
      }
    })()
  }
  await loadPromise
}

async function persist() {
  if (!cache) {
    return
  }
  cache = pruneExpired(cache)
  const path = rateLimitPath()
  await fs.mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  const body: StoreFile = { limits: cache }
  await fs.writeFile(tmp, `${JSON.stringify(body, null, 2)}\n`, 'utf-8')
  await fs.rename(tmp, path)
}

function publish() {
  publishCertLive({
    type: 'rateLimits',
    data: { rateLimits: getCertRateLimitsSync() },
  })
}

/** Sync read after boot load; empty until ensureLoaded. */
export function getCertRateLimitsSync(): CertRateLimit[] {
  return pruneExpired(cache ?? [])
}

export async function getCertRateLimits(): Promise<CertRateLimit[]> {
  await ensureLoaded()
  return getCertRateLimitsSync()
}

export async function recordCertRateLimit(input: {
  mode: LetsEncryptDirectoryMode
  certName?: string
  retryAfterSeconds: number
  endpoint?: string
  detail?: string
}): Promise<CertRateLimit> {
  await ensureLoaded()
  const seconds = Math.max(1, Math.floor(input.retryAfterSeconds))
  const until = new Date(Date.now() + seconds * 1000).toISOString()
  const endpoint = input.endpoint || ''
  const scope: CertRateLimit['scope'] = /new-order|new-acct|new-nonce/i.test(endpoint)
    ? 'account'
    : 'cert'

  const entry: CertRateLimit = {
    id: limitId({
      mode: input.mode,
      scope,
      certName: input.certName,
    }),
    mode: input.mode,
    scope,
    certName: input.certName,
    until,
    retryAfterSeconds: seconds,
    endpoint: endpoint || undefined,
    at: new Date().toISOString(),
    detail: input.detail
      || `Let's Encrypt HTTP 429 — retry after ${seconds}s`,
  }

  const next = (cache ?? []).filter(item => item.id !== entry.id)
  next.push(entry)
  cache = next
  await persist()
  publish()
  return entry
}

export async function clearCertRateLimit(options: {
  mode: LetsEncryptDirectoryMode
  certName?: string
}) {
  await ensureLoaded()
  const before = cache?.length ?? 0
  cache = (cache ?? []).filter((entry) => {
    if (entry.mode !== options.mode) {
      return true
    }
    if (options.certName && entry.certName === options.certName && entry.scope === 'cert') {
      return false
    }
    return true
  })
  if ((cache?.length ?? 0) !== before) {
    await persist()
    publish()
  }
}

export function rateLimitForCert(
  limits: CertRateLimit[],
  mode: LetsEncryptDirectoryMode,
  certName: string,
): CertRateLimit | undefined {
  const active = pruneExpired(limits).filter(l => l.mode === mode)
  const account = active.find(l => l.scope === 'account')
  const cert = active.find(l => l.scope === 'cert' && l.certName === certName)
  if (account && cert) {
    return Date.parse(account.until) >= Date.parse(cert.until) ? account : cert
  }
  return account || cert
}

/** Boot hook — load file into memory. */
export async function initCertRateLimits() {
  await ensureLoaded()
}
