import type {
  CertActivityEntry,
  CertJobQueueSnapshot,
  CertJobStatus,
  CertRateLimit,
  DomainsDnsCheck,
  LetsEncryptDirectoryMode,
} from '#shared/types/certs'
import { certActivitySourceLabel } from '#shared/utils/certLog'

export type CertLiveTransport = 'off' | 'connecting' | 'live' | 'polling' | 'paused'

export function dnsChecksForLine(lineNo: number, dnsChecks?: DomainsDnsCheck[]) {
  return dnsChecks?.filter(check => check.line === lineNo) ?? []
}

export function dnsCheckLabel(status: DomainsDnsCheck['status']) {
  switch (status) {
    case 'ok': return 'OK'
    case 'missing': return 'Missing'
    case 'mismatch': return 'Mismatch'
    case 'no_account': return 'No account'
    case 'error': return 'Error'
    default: return 'Pending'
  }
}

export function dnsCheckClass(status: DomainsDnsCheck['status']) {
  switch (status) {
    case 'ok': return 'text-signal'
    case 'no_account': return 'text-muted'
    case 'pending': return 'text-muted'
    default: return 'text-danger'
  }
}

/** Missing/mismatch rows show copyable CNAME Name + Content. */
export function dnsCheckNeedsCopy(status: DomainsDnsCheck['status']) {
  return status === 'missing' || status === 'mismatch'
}

export function jobLabel(id: number, source: string, mode: string) {
  const tree = mode === 'staging' ? 'staging' : 'live'
  return `#${id} ${tree}/${source}`
}

export function activitySourceLabel(entry: CertActivityEntry) {
  return certActivitySourceLabel(entry.source, entry.mode)
}

export function canResumeJob(job: { completedCount?: number }) {
  return (job.completedCount ?? 0) > 0
}

export function canIssueCert(entry: { inDomainsFile: boolean, status: string }) {
  return entry.inDomainsFile && entry.status !== 'orphan'
}

export function certInFlightOrQueued(
  certName: string,
  issuingCerts: string[],
  certJob: CertJobStatus,
  certQueue: CertJobQueueSnapshot,
) {
  if (issuingCerts.includes(certName)) {
    return true
  }
  const running = certQueue.running
  if (running?.certNames?.includes(certName) || running?.currentCert === certName) {
    return true
  }
  if (certJob.running && certJob.currentCert === certName) {
    return true
  }
  return certQueue.queued.some(job => job.certNames?.includes(certName))
}

export function issueDisabled(
  entry: { certName: string, inDomainsFile: boolean, status: string },
  dirty: boolean,
  directoryMode: LetsEncryptDirectoryMode,
  acmeEnabled: boolean,
  issuingCerts: string[],
  certJob: CertJobStatus,
  certQueue: CertJobQueueSnapshot,
) {
  return dirty
    || !canIssueCert(entry)
    || certInFlightOrQueued(entry.certName, issuingCerts, certJob, certQueue)
    || (directoryMode === 'production' && !acmeEnabled)
}

export function statusLabel(status: string) {
  switch (status) {
    case 'ok': return 'OK'
    case 'missing': return 'Missing'
    case 'drift': return 'SAN drift'
    case 'orphan': return 'Orphan'
    default: return status
  }
}

export function activityLevelClass(level: string) {
  switch (level) {
    case 'error': return 'text-danger'
    case 'warn': return 'text-muted'
    default: return 'text-ink'
  }
}

export function activitySourceClass(entry: CertActivityEntry) {
  if (entry.source === 'acme') {
    return 'text-signal'
  }
  if (entry.mode === 'staging') {
    return 'text-muted'
  }
  if (entry.mode === 'production') {
    return 'text-live'
  }
  return 'text-muted'
}

export function transportDotClass(mode: CertLiveTransport) {
  switch (mode) {
    case 'live': return 'text-live'
    case 'polling': return 'text-signal'
    case 'connecting': return 'text-muted animate-pulse'
    default: return 'text-muted'
  }
}

export function transportClass(mode: CertLiveTransport) {
  switch (mode) {
    case 'live': return 'text-live'
    case 'polling': return 'text-signal'
    case 'connecting': return 'text-muted'
    default: return 'text-muted'
  }
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleString()
}

export function formatRemaining(untilIso: string, nowMs: number) {
  const ms = Date.parse(untilIso) - nowMs
  if (ms <= 0) {
    return 'ready'
  }
  const total = Math.max(0, Math.ceil(ms / 1000))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const parts: string[] = []
  if (days > 0) {
    parts.push(`${days}d`)
  }
  if (days > 0 || hours > 0) {
    parts.push(`${hours}h`)
  }
  if (days > 0 || hours > 0 || minutes > 0) {
    parts.push(`${minutes}m`)
  }
  parts.push(`${seconds}s`)
  return parts.join(' ')
}

export function rateLimitLabel(limit: CertRateLimit, nowMs: number) {
  const who = limit.scope === 'account'
    ? `Account (${limit.mode})`
    : (limit.certName || 'Certificate')
  return `${who}: ${formatRemaining(limit.until, nowMs)} left · until ${formatTime(limit.until)}`
}
