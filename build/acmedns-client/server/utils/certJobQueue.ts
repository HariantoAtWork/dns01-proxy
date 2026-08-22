import type {
  CertApplyResult,
  CertJobQueueItem,
  CertJobQueueSnapshot,
  CertJobStatus,
  LetsEncryptDirectoryMode,
} from '#shared/types/certs'
import { readDomainsFile } from './domainsFile'
import { issueCertificate } from './acmeIssue'
import { isAcmeEnabled } from './certSettings'
import { appendCertActivity, getLastCertErrors } from './certActivity'
import { publishCertLive } from './certLiveBus'
import { buildCertStatus, needsRenewal, readCertMeta } from './certStatus'

const QUIET_MESSAGES = new Set([
  'Not due for renewal',
  'No certificate to renew',
  'Up to date',
])

type JobSource = 'renew' | 'apply'

interface InternalJob {
  id: number
  source: JobSource
  mode: LetsEncryptDirectoryMode
  status: CertJobQueueItem['status']
  createdAt: string
  startedAt?: string
  finishedAt?: string
  currentCert?: string
  certNames?: string[]
  force?: boolean
  renewOnly?: boolean
  results?: CertApplyResult[]
  error?: string
  cancelRequested?: boolean
  deleteOnCancel?: boolean
  resolve: (results: CertApplyResult[]) => void
  reject: (error: unknown) => void
}

const waiting: InternalJob[] = []
const cancelled: InternalJob[] = []
let running: InternalJob | null = null
let nextJobId = 1
let pumping = false

function jobCancelledError() {
  return createError({
    statusCode: 499,
    statusMessage: 'Job cancelled',
  })
}

function noopResolve(_results: CertApplyResult[]) {}
function noopReject(_error: unknown) {}

function toPublic(job: InternalJob): CertJobQueueItem {
  return {
    id: job.id,
    source: job.source,
    mode: job.mode,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    currentCert: job.currentCert,
    certNames: job.certNames,
    force: job.force,
    renewOnly: job.renewOnly,
    error: job.error,
    cancelRequested: job.cancelRequested,
  }
}

function detachPromiseHandlers(job: InternalJob) {
  job.resolve = noopResolve
  job.reject = noopReject
}

function emitQueue() {
  publishCertLive({
    type: 'queue',
    data: {
      job: getCertJobStatus(),
      queue: getCertJobQueueSnapshot(),
    },
  })
}

async function emitStatus(mode: LetsEncryptDirectoryMode) {
  const lastErrors = getLastCertErrors()
  const entries = await buildCertStatus(mode)
  publishCertLive({
    type: 'status',
    data: {
      mode,
      entries: entries.map((entry) => {
        const lastError = lastErrors[entry.certName]
        return lastError ? { ...entry, lastError: lastError.message } : entry
      }),
    },
  })
}

function logApplyResult(source: JobSource, result: CertApplyResult) {
  if (QUIET_MESSAGES.has(result.message)) {
    return
  }
  appendCertActivity({
    source,
    level: result.ok ? 'info' : 'error',
    certName: result.certName,
    message: result.message,
  })
}

async function executeApplyCertificates(options: {
  mode: LetsEncryptDirectoryMode
  source: JobSource
  certNames?: string[]
  force?: boolean
  renewOnly?: boolean
  jobId: number
  onCurrentCert: (certName: string | undefined) => void
  shouldCancel: () => boolean
}): Promise<{ results: CertApplyResult[], cancelled: boolean }> {
  appendCertActivity({
    source: 'system',
    level: 'info',
    message: `Job #${options.jobId} started (${options.source}, ${options.mode})`,
  })

  const domains = await readDomainsFile()
  if (!domains.ok) {
    throw createError({
      statusCode: 400,
      statusMessage: 'domains.txt has validation errors. Fix and save first.',
    })
  }

  const wanted = options.certNames?.length
    ? domains.lines.filter(l => options.certNames!.includes(l.certName))
    : domains.lines

  const results: CertApplyResult[] = []

  for (const line of wanted) {
    if (options.shouldCancel()) {
      appendCertActivity({
        source: 'system',
        level: 'warn',
        message: `Job #${options.jobId} cancel requested — stopping before ${line.certName}`,
      })
      return { results, cancelled: true }
    }

    options.onCurrentCert(line.certName)
    emitQueue()
    const meta = await readCertMeta(options.mode, line.certName)
    const status = (await buildCertStatus(options.mode)).find(s => s.certName === line.certName)
    const missing = !meta
    const drift = status?.status === 'drift'
    const due = meta ? needsRenewal(meta.notAfter) : true

    if (options.renewOnly) {
      if (!meta || !due) {
        results.push({
          certName: line.certName,
          ok: true,
          message: meta ? 'Not due for renewal' : 'No certificate to renew',
          notAfter: meta?.notAfter,
        })
        continue
      }
    }
    else if (!options.force && !missing && !drift) {
      results.push({
        certName: line.certName,
        ok: true,
        message: 'Up to date',
        notAfter: meta?.notAfter,
      })
      continue
    }

    appendCertActivity({
      source: options.source,
      level: 'info',
      certName: line.certName,
      message: missing ? 'Issuing certificate…' : 'Renewing certificate…',
    })

    try {
      await issueCertificate({
        mode: options.mode,
        certName: line.certName,
        altNames: line.expanded,
      })
      const after = await readCertMeta(options.mode, line.certName)
      const result: CertApplyResult = {
        certName: line.certName,
        ok: true,
        message: missing ? 'Issued' : drift ? 'Re-issued (SAN change)' : 'Renewed',
        notAfter: after?.notAfter,
      }
      results.push(result)
      logApplyResult(options.source, result)
      await emitStatus(options.mode)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : 'Issue failed'
      const result: CertApplyResult = {
        certName: line.certName,
        ok: false,
        message,
      }
      results.push(result)
      logApplyResult(options.source, result)
    }
  }

  options.onCurrentCert(undefined)
  emitQueue()

  const renewed = results.filter(r => r.ok && ['Renewed', 'Issued', 'Re-issued (SAN change)'].includes(r.message))
  const failed = results.filter(r => !r.ok)
  appendCertActivity({
    source: options.source,
    level: failed.length ? 'warn' : 'info',
    message: options.source === 'renew'
      ? `Job #${options.jobId} complete: ${renewed.length} renewed, ${failed.length} failed`
      : `Job #${options.jobId} complete: ${renewed.length} issued/renewed, ${failed.length} failed`,
  })

  return { results, cancelled: false }
}

function finishCancelledJob(job: InternalJob) {
  if (job.deleteOnCancel) {
    appendCertActivity({
      source: 'system',
      level: 'info',
      message: `Job #${job.id} deleted (${job.source}, ${job.mode})`,
    })
    job.reject(jobCancelledError())
    return
  }

  job.status = 'cancelled'
  job.finishedAt = new Date().toISOString()
  job.currentCert = undefined
  cancelled.push(job)
  appendCertActivity({
    source: 'system',
    level: 'warn',
    message: `Job #${job.id} cancelled (${job.source}, ${job.mode})`,
  })
  job.reject(jobCancelledError())
}

async function pumpQueue() {
  if (pumping || running) {
    return
  }

  const job = waiting.shift()
  if (!job) {
    return
  }

  pumping = true
  running = job
  job.status = 'running'
  job.startedAt = new Date().toISOString()
  job.cancelRequested = false
  job.deleteOnCancel = false
  emitQueue()

  try {
    const { results, cancelled: wasCancelled } = await executeApplyCertificates({
      mode: job.mode,
      source: job.source,
      certNames: job.certNames,
      force: job.force,
      renewOnly: job.renewOnly,
      jobId: job.id,
      onCurrentCert: (certName) => {
        job.currentCert = certName
      },
      shouldCancel: () => Boolean(job.cancelRequested),
    })

    job.results = results

    if (wasCancelled) {
      finishCancelledJob(job)
    }
    else {
      job.status = 'completed'
      job.finishedAt = new Date().toISOString()
      job.resolve(results)
    }
  }
  catch (error) {
    job.status = 'failed'
    job.error = error instanceof Error ? error.message : 'Job failed'
    job.finishedAt = new Date().toISOString()
    job.reject(error)
  }
  finally {
    running = null
    pumping = false
    emitQueue()
    void emitStatus(job.mode)
    void pumpQueue()
  }
}

export function enqueueCertJob(options: {
  mode: LetsEncryptDirectoryMode
  source: JobSource
  certNames?: string[]
  force?: boolean
  renewOnly?: boolean
}): Promise<CertApplyResult[]> {
  if (!isAcmeEnabled()) {
    return Promise.reject(createError({
      statusCode: 503,
      statusMessage: 'Certificate ACME is disabled (CERTS_ACME_ENABLED=false).',
    }))
  }

  return new Promise((resolve, reject) => {
    const job: InternalJob = {
      id: nextJobId++,
      source: options.source,
      mode: options.mode,
      status: 'queued',
      createdAt: new Date().toISOString(),
      certNames: options.certNames,
      force: options.force,
      renewOnly: options.renewOnly,
      resolve,
      reject,
    }

    waiting.push(job)
    appendCertActivity({
      source: 'system',
      level: 'info',
      message: `Job #${job.id} queued (${options.source}, ${options.mode}) — position ${waiting.length}`,
    })
    emitQueue()

    void pumpQueue()
  })
}

function findJob(id: number) {
  if (running?.id === id) {
    return { job: running, list: 'running' as const }
  }
  const queuedIdx = waiting.findIndex(j => j.id === id)
  if (queuedIdx >= 0) {
    return { job: waiting[queuedIdx], list: 'queued' as const, index: queuedIdx }
  }
  const cancelledIdx = cancelled.findIndex(j => j.id === id)
  if (cancelledIdx >= 0) {
    return { job: cancelled[cancelledIdx], list: 'cancelled' as const, index: cancelledIdx }
  }
  return null
}

export function cancelCertJob(id: number): CertJobQueueItem {
  const found = findJob(id)
  if (!found) {
    throw createError({ statusCode: 404, statusMessage: 'Job not found' })
  }

  const { job, list } = found

  if (list === 'running') {
    job.cancelRequested = true
    appendCertActivity({
      source: 'system',
      level: 'warn',
      message: `Job #${job.id} cancel requested — will stop after current certificate`,
    })
    emitQueue()
    return toPublic(job)
  }

  if (list === 'queued') {
    const idx = found.index!
    const [removed] = waiting.splice(idx, 1)
    if (!removed) {
      throw createError({ statusCode: 404, statusMessage: 'Job not found' })
    }
    removed.status = 'cancelled'
    removed.finishedAt = new Date().toISOString()
    cancelled.push(removed)
    appendCertActivity({
      source: 'system',
      level: 'warn',
      message: `Job #${removed.id} cancelled (${removed.source}, ${removed.mode})`,
    })
    removed.reject(jobCancelledError())
    emitQueue()
    return toPublic(removed)
  }

  throw createError({
    statusCode: 409,
    statusMessage: 'Job is already cancelled',
  })
}

export function resumeCertJob(id: number): CertJobQueueItem {
  const found = findJob(id)
  if (!found || found.list !== 'cancelled') {
    throw createError({
      statusCode: 404,
      statusMessage: 'Cancelled job not found',
    })
  }

  const idx = found.index!
  const [removed] = cancelled.splice(idx, 1)
  if (!removed) {
    throw createError({ statusCode: 404, statusMessage: 'Cancelled job not found' })
  }
  removed.status = 'queued'
  removed.cancelRequested = false
  removed.deleteOnCancel = false
  removed.startedAt = undefined
  removed.finishedAt = undefined
  removed.currentCert = undefined
  removed.error = undefined
  removed.results = undefined
  detachPromiseHandlers(removed)

  waiting.push(removed)
  appendCertActivity({
    source: 'system',
    level: 'info',
    message: `Job #${removed.id} resumed (${removed.source}, ${removed.mode}) — position ${waiting.length}`,
  })
  emitQueue()

  void pumpQueue()
  return toPublic(removed)
}

export function deleteCertJob(id: number): CertJobQueueItem {
  const found = findJob(id)
  if (!found) {
    throw createError({ statusCode: 404, statusMessage: 'Job not found' })
  }

  const { job, list } = found

  if (list === 'running') {
    job.cancelRequested = true
    job.deleteOnCancel = true
    appendCertActivity({
      source: 'system',
      level: 'warn',
      message: `Job #${job.id} delete requested — will stop after current certificate`,
    })
    emitQueue()
    return toPublic(job)
  }

  if (list === 'queued') {
    const idx = found.index!
    const [removed] = waiting.splice(idx, 1)
    if (!removed) {
      throw createError({ statusCode: 404, statusMessage: 'Job not found' })
    }
    appendCertActivity({
      source: 'system',
      level: 'info',
      message: `Job #${removed.id} deleted (${removed.source}, ${removed.mode})`,
    })
    removed.reject(jobCancelledError())
    emitQueue()
    return toPublic(removed)
  }

  const idx = found.index!
  const [removed] = cancelled.splice(idx, 1)
  if (!removed) {
    throw createError({ statusCode: 404, statusMessage: 'Job not found' })
  }
  appendCertActivity({
    source: 'system',
    level: 'info',
    message: `Job #${removed.id} deleted (${removed.source}, ${removed.mode})`,
  })
  emitQueue()
  return toPublic(removed)
}

export function getCertJobStatus(): CertJobStatus {
  if (!running) {
    return { running: false, queueLength: waiting.length }
  }
  return {
    running: true,
    id: running.id,
    source: running.source,
    mode: running.mode,
    startedAt: running.startedAt,
    currentCert: running.currentCert,
    queueLength: waiting.length,
  }
}

export function getCertJobQueueSnapshot(): CertJobQueueSnapshot {
  return {
    running: running ? toPublic(running) : null,
    queued: waiting.map(toPublic),
    cancelled: cancelled.map(toPublic),
  }
}

export function isCertJobLocked() {
  return running !== null
}
