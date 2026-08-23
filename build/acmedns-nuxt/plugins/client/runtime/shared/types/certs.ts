export type LetsEncryptDirectoryMode = 'production' | 'staging'

export interface DomainsLineError {
  line: number
  message: string
}

export interface ParsedDomainsLine {
  line: number
  names: string[]
  certName: string
  expanded: string[]
  raw: string
}

export interface DomainsParseResult {
  ok: boolean
  text: string
  lines: ParsedDomainsLine[]
  errors: DomainsLineError[]
  dnsChecks?: DomainsDnsCheck[]
}

export type DomainsDnsCheckStatus = 'pending' | 'ok' | 'missing' | 'mismatch' | 'no_account' | 'error'

export interface DomainsDnsCheck {
  line: number
  zone: string
  /** Public DNS name, e.g. _acme-challenge.example.com */
  name: string
  expected: string
  actual?: string
  status: DomainsDnsCheckStatus
  accountKey?: string
  message?: string
}

export interface CertSettings {
  directoryMode: LetsEncryptDirectoryMode
}

export type CertLineStatus = 'ok' | 'missing' | 'drift' | 'orphan' | 'error'

export interface CertStatusEntry {
  certName: string
  names: string[]
  expanded: string[]
  status: CertLineStatus
  notAfter?: string
  sansOnDisk?: string[]
  tree: 'live' | 'staging' | 'trash' | 'none'
  /** True when PEMs exist under live/<certName>/ (production). */
  liveOnDisk?: boolean
  lastError?: string
  /** ISO timestamp when Let's Encrypt rate limit lifts (if any). */
  rateLimitedUntil?: string
  rateLimitDetail?: string
  inDomainsFile: boolean
}

export interface CertApplyResult {
  certName: string
  ok: boolean
  message: string
  notAfter?: string
}

export interface TrashItem {
  certName: string
  trashedAt: string
  fromTree: 'live' | 'staging'
  notAfter?: string
}

export interface LastSavedItem {
  certName: string
  savedAt: string
  fromTree: 'live' | 'staging'
  notAfter?: string
}

export type CertActivitySource = 'renew' | 'apply' | 'system' | 'acme'

export type CertActivityLevel = 'info' | 'warn' | 'error'

export interface CertActivityEntry {
  id: number
  at: string
  source: CertActivitySource
  level: CertActivityLevel
  certName?: string
  message: string
}

/** Persisted Let's Encrypt Retry-After / 429 cooldown (survives reboot). */
export interface CertRateLimit {
  id: string
  mode: LetsEncryptDirectoryMode
  scope: 'account' | 'cert'
  certName?: string
  until: string
  retryAfterSeconds: number
  endpoint?: string
  at: string
  detail: string
}

export interface CertJobStatus {
  running: boolean
  id?: number
  source?: CertActivitySource
  mode?: LetsEncryptDirectoryMode
  startedAt?: string
  currentCert?: string
  /** 1-based index of the certificate line being processed */
  taskIndex?: number
  /** Total certificate lines in this job batch */
  taskTotal?: number
  queueLength?: number
}

export type CertJobQueueStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface CertJobQueueItem {
  id: number
  source: 'renew' | 'apply'
  mode: LetsEncryptDirectoryMode
  status: CertJobQueueStatus
  createdAt: string
  startedAt?: string
  finishedAt?: string
  currentCert?: string
  taskIndex?: number
  taskTotal?: number
  /** Certificate lines already finished before cancel (for continue) */
  completedCount?: number
  certNames?: string[]
  force?: boolean
  renewOnly?: boolean
  error?: string
  cancelRequested?: boolean
}

export interface CertJobQueueSnapshot {
  running: CertJobQueueItem | null
  queued: CertJobQueueItem[]
  cancelled: CertJobQueueItem[]
}

export interface CertActivityResponse {
  entries: CertActivityEntry[]
  job: CertJobStatus
  queue: CertJobQueueSnapshot
  lastErrors: Record<string, { message: string, at: string }>
  rateLimits: CertRateLimit[]
}

export interface CertLiveSnapshot {
  entries: CertActivityEntry[]
  job: CertJobStatus
  queue: CertJobQueueSnapshot
  lastErrors: Record<string, { message: string, at: string }>
  rateLimits: CertRateLimit[]
}

export interface CertLiveActivityEvent {
  entry: CertActivityEntry
  lastErrors: Record<string, { message: string, at: string }>
}

export interface CertLiveQueueEvent {
  job: CertJobStatus
  queue: CertJobQueueSnapshot
}

export interface CertLiveStatusEvent {
  mode: LetsEncryptDirectoryMode
  entries: CertStatusEntry[]
}

export interface CertLiveRateLimitsEvent {
  rateLimits: CertRateLimit[]
}
