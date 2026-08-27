import type {
  CertApplyResult,
  CertJobQueueItem,
  CertJobQueueSnapshot,
  CertJobStatus,
  LetsEncryptDirectoryMode,
} from '#shared/types/certs'
import { publishCertLive } from '../certLiveBus'

export type JobSource = 'renew' | 'apply'

export interface InternalJob {
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
  abortController?: AbortController
  resolve: (results: CertApplyResult[]) => void
  reject: (error: unknown) => void
}

export const waiting: InternalJob[] = []
export const cancelled: InternalJob[] = []
export let running: InternalJob | null = null
export let nextJobId = 1
export let pumping = false

export function setRunning(job: InternalJob | null) {
  running = job
}

export function setPumping(value: boolean) {
  pumping = value
}

export function allocateJobId() {
  return nextJobId++
}

export function jobCancelledError() {
  return createError({
    statusCode: 499,
    statusMessage: 'Job cancelled',
  })
}

export function isAbortLike(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }
  const err = error as { name?: string, message?: string, statusCode?: number }
  return err.name === 'AbortError'
    || err.name === 'TimeoutError'
    || err.statusCode === 499
    || /cancelled|aborted|timed out/i.test(err.message || '')
}

export function noopResolve(_results: CertApplyResult[]) {}
export function noopReject(_error: unknown) {}

export function toPublic(job: InternalJob): CertJobQueueItem {
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

export function detachPromiseHandlers(job: InternalJob) {
  job.resolve = noopResolve
  job.reject = noopReject
}

export function emitQueue() {
  publishCertLive({
    type: 'queue',
    data: {
      job: certJobStatus(),
      queue: certJobQueueSnapshot(),
    },
  })
}

export function findJob(id: number) {
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

export function certJobStatus(): CertJobStatus {
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

export function certJobQueueSnapshot(): CertJobQueueSnapshot {
  return {
    running: running ? toPublic(running) : null,
    queued: waiting.map(toPublic),
    cancelled: cancelled.map(toPublic),
  }
}

export function certJobLocked() {
  return Boolean(running) || waiting.length > 0
}
