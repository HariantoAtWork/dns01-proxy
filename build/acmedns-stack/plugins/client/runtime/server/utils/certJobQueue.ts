import type {
  CertApplyResult,
  CertJobQueueItem,
  LetsEncryptDirectoryMode,
} from '#shared/types/certs'
import { appendCertActivity } from './certActivity'
import {
  cancelled,
  detachPromiseHandlers,
  emitQueue,
  findJob,
  jobCancelledError,
  noopReject,
  noopResolve,
  toPublic,
  waiting,
} from './certJobQueue/state'
import {
  abortRunningJob,
  createQueuedJob,
  pumpQueue,
} from './certJobQueue/executor'

export {
  certJobLocked as isCertJobLocked,
  certJobQueueSnapshot as getCertJobQueueSnapshot,
  certJobStatus as getCertJobStatus,
} from './certJobQueue/state'

/** Fire-and-forget queue (HTTP Apply). Progress via SSE / activity. */
export async function startCertJob(options: {
  mode: LetsEncryptDirectoryMode
  source: 'renew' | 'apply'
  certNames?: string[]
  force?: boolean
  renewOnly?: boolean
}): Promise<CertJobQueueItem> {
  const job = await createQueuedJob({
    ...options,
    resolve: noopResolve,
    reject: noopReject,
  })
  return toPublic(job)
}

/** Queue a DNS-01 lab run (shared queue with cert Apply). */
export async function startLabJob(options: {
  certNames?: string[]
  force?: boolean
}): Promise<CertJobQueueItem> {
  const job = await createQueuedJob({
    source: 'lab',
    mode: 'production',
    certNames: options.certNames,
    force: options.force,
    resolve: noopResolve,
    reject: noopReject,
  })
  return toPublic(job)
}

/** Wait until the job finishes (renew timer). */
export function enqueueCertJob(options: {
  mode: LetsEncryptDirectoryMode
  source: 'renew' | 'apply'
  certNames?: string[]
  force?: boolean
  renewOnly?: boolean
}): Promise<CertApplyResult[]> {
  return new Promise((resolve, reject) => {
    void createQueuedJob({
      ...options,
      resolve,
      reject,
    }).catch(reject)
  })
}

export function cancelCertJob(id: number): CertJobQueueItem {
  const found = findJob(id)
  if (!found) {
    throw createError({ statusCode: 404, statusMessage: 'Job not found' })
  }

  const { job, list } = found

  if (list === 'running') {
    abortRunningJob(job, 'Job cancelled by operator')
    appendCertActivity({
      source: job.source,
      mode: job.mode,
      level: 'warn',
      message: `Job #${job.id} cancel requested — aborting current ACME attempt`,
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
      source: removed.source,
      mode: removed.mode,
      level: 'warn',
      message: `Job #${removed.id} cancelled`,
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
  removed.tasks = undefined
  removed.error = undefined
  removed.abortController = undefined
  detachPromiseHandlers(removed)

  waiting.push(removed)
  appendCertActivity({
    source: removed.source,
    mode: removed.mode,
    level: 'info',
    message: mode === 'rerun'
      ? `Job #${removed.id} re-queued (re-run from start)`
      : `Job #${removed.id} continued — skipping ${completedBefore} already done`,
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
    job.deleteOnCancel = true
    abortRunningJob(job, 'Job deleted by operator')
    appendCertActivity({
      source: job.source,
      mode: job.mode,
      level: 'warn',
      message: `Job #${job.id} delete requested — aborting current ACME attempt`,
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
      source: removed.source,
      mode: removed.mode,
      level: 'info',
      message: `Job #${removed.id} deleted`,
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
    source: removed.source,
    mode: removed.mode,
    level: 'info',
    message: `Job #${removed.id} deleted`,
  })
  emitQueue()
  return toPublic(removed)
}
