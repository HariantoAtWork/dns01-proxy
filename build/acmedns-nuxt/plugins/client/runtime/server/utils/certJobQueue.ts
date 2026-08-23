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
  taskIndex?: number
  taskTotal?: number
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
    taskIndex: job.taskIndex,
    taskTotal: job.taskTotal,
    completedCount: job.results?.length ?? 0,
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
  priorResults?: CertApplyResult[]
  onProgress: (progress: { certName: string | undefined, taskIndex: number, taskTotal: number }) => void
  shouldCancel: () => boolean
}): Promise<{ results: CertApplyResult[], cancelled: boolean }> {
  const continuing = Boolean(options.priorResults?.length)
  appendCertActivity({
    source: 'system',
    level: 'info',
    message: continuing
      ? `Job #${options.jobId} continuing (${options.source}, ${options.mode}) — ${options.priorResults!.length} already done`
      : `Job #${options.jobId} started (${options.source}, ${options.mode})`,
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

  const results: CertApplyResult[] = [...(options.priorResults ?? [])]
  const completedNames = new Set(results.map(r => r.certName))
  const taskTotal = wanted.length

  for (let index = 0; index < wanted.length; index += 1) {
    const line = wanted[index]!
    const taskIndex = index + 1

    if (completedNames.has(line.certName)) {
      continue
    }

    if (options.shouldCancel()) {
      appendCertActivity({
        source: 'system',
        level: 'warn',
        message: `Job #${options.jobId} cancel requested — stopping before ${line.certName}`,
      })
      return { results, cancelled: true }
    }

    options.onProgress({ certName: line.certName, taskIndex, taskTotal })
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

  options.onProgress({ certName: undefined, taskIndex: taskTotal, taskTotal })
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
      priorResults: job.results?.length ? job.results : undefined,
      onProgress: ({ certName, taskIndex, taskTotal }) => {
        job.currentCert = certName
        job.taskIndex = taskIndex
        job.taskTotal = taskTotal
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
    void (async () => {
      let taskTotal: number | undefined
      try {
        const domains = await readDomainsFile()
        if (domains.ok) {
          const wanted = options.certNames?.length
            ? domains.lines.filter(l => options.certNames!.includes(l.certName))
            : domains.lines
          taskTotal = wanted.length
        }
      }
      catch {
        // queue anyway; executeApplyCertificates will validate
      }

      const job: InternalJob = {
        id: nextJobId++,
        source: options.source,
        mode: options.mode,
        status: 'queued',
        createdAt: new Date().toISOString(),
        certNames: options.certNames,
        force: options.force,
        renewOnly: options.renewOnly,
        taskTotal,
        resolve,
        reject,
      }

      waiting.push(job)
      appendCertActivity({
        source: 'system',
        level: 'info',
        message: `Job #${job.id} queued (${options.source}, ${options.mode}) — position ${waiting.length}${taskTotal ? `, ${taskTotal} cert(s)` : ''}`,
      })
      emitQueue()

      void pumpQueue()
    })()
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

function requeueCancelledJob(id: number, mode: 'continue' | 'rerun'): CertJobQueueItem {
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

  const completedBefore = removed.results?.length ?? 0

  if (mode === 'rerun') {
    removed.results = undefined
  }
  else if (completedBefore === 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Nothing to continue — use Re-run to start this job from the beginning',
    })
  }

  removed.status = 'queued'
  removed.cancelRequested = false
  removed.deleteOnCancel = false
  removed.startedAt = undefined
  removed.finishedAt = undefined
  removed.currentCert = undefined
  removed.taskIndex = undefined
  removed.error = undefined
  detachPromiseHandlers(removed)

  waiting.push(removed)
  appendCertActivity({
    source: 'system',
    level: 'info',
    message: mode === 'rerun'
      ? `Job #${removed.id} re-queued (re-run from start, ${removed.source}, ${removed.mode})`
      : `Job #${removed.id} continued (${removed.source}, ${removed.mode}) — skipping ${completedBefore} already done`,
  })
  emitQueue()

  void pumpQueue()
  return toPublic(removed)
}

/** Continue a cancelled job, skipping certificates already processed. */
export function continueCertJob(id: number): CertJobQueueItem {
  return requeueCancelledJob(id, 'continue')
}

/** Re-run a cancelled job from the first certificate line. */
export function rerunCertJob(id: number): CertJobQueueItem {
  return requeueCancelledJob(id, 'rerun')
}

/** @deprecated use continueCertJob */
export function resumeCertJob(id: number): CertJobQueueItem {
  return continueCertJob(id)
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
    taskIndex: running.taskIndex,
    taskTotal: running.taskTotal,
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
