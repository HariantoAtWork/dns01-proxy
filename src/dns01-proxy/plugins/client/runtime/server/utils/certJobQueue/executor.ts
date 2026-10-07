import type {
  CertApplyResult,
  LetsEncryptDirectoryMode,
} from '#shared/types/certs'
import { readDomainsFile } from '../domainsFile'
import { isAcmeEnabledForMode } from '../certSettings'
import { appendCertActivity } from '../certActivity'
import { publishCertLive } from '../certLiveBus'
import { buildCertLiveStatus } from '../certLivePublish'
import { persistCertJobSummary } from '../certJobSummaries'
import {
  allocateJobId,
  emitQueue,
  isAbortLike,
  jobCancelledError,
  setPumping,
  setRunning,
  clearRunningJobTasks,
  type InternalJob,
  type JobSource,
  waiting,
  cancelled,
  pumping,
  running,
} from './state'
import { getLabPlugin, requireLabPlugin } from './labRegistry'
import { createCertJobTaskPlan } from '../../../shared/utils/certJobTasks'
import { ACME_CERT_TIMEOUT_MS, executeApplyCertificates } from './applyCertificates'

export { ACME_CERT_TIMEOUT_MS, executeApplyCertificates }

async function emitStatus(mode: LetsEncryptDirectoryMode) {
  publishCertLive({
    type: 'status',
    data: await buildCertLiveStatus(mode),
  })
}

export function finishCancelledJob(job: InternalJob) {
  if (job.deleteOnCancel) {
    appendCertActivity({
      source: job.source,
      mode: job.mode,
      level: 'info',
      message: `Job #${job.id} deleted`,
    })
    job.reject(jobCancelledError())
    return
  }

  job.status = 'cancelled'
  job.finishedAt = new Date().toISOString()
  job.currentCert = undefined
  void persistCertJobSummary(job, true)
  clearRunningJobTasks()
  cancelled.push(job)
  appendCertActivity({
    source: job.source,
    mode: job.mode,
    level: 'warn',
    message: `Job #${job.id} cancelled`,
  })
  job.reject(jobCancelledError())
}

export function abortRunningJob(job: InternalJob, reason: string) {
  job.cancelRequested = true
  try {
    job.abortController?.abort(new Error(reason))
  }
  catch {
    // already aborted
  }
}

export async function pumpQueue() {
  if (pumping || running) {
    return
  }

  const job = waiting.shift()
  if (!job) {
    return
  }

  setPumping(true)
  setRunning(job)
  job.status = 'running'
  job.startedAt = new Date().toISOString()
  job.cancelRequested = false
  job.deleteOnCancel = false
  job.abortController = new AbortController()
  emitQueue()

  try {
    let results: CertApplyResult[]
    let wasCancelled: boolean

    if (job.source === 'lab') {
      const lab = requireLabPlugin()
      ;({ results, cancelled: wasCancelled } = await lab.executor({
        certNames: job.certNames,
        force: job.force,
        jobId: job.id,
        priorResults: job.results?.length ? job.results : undefined,
        abortSignal: job.abortController.signal,
        onProgress: ({ certName, taskIndex, taskTotal }) => {
          job.currentCert = certName
          job.taskIndex = taskIndex
          job.taskTotal = taskTotal
        },
        shouldCancel: () => Boolean(job.cancelRequested),
      }))
    }
    else {
      ;({ results, cancelled: wasCancelled } = await executeApplyCertificates({
        mode: job.mode,
        source: job.source,
        certNames: job.certNames,
        force: job.force,
        renewOnly: job.renewOnly,
        jobId: job.id,
        priorResults: job.results?.length ? job.results : undefined,
        abortSignal: job.abortController.signal,
        onProgress: ({ certName, taskIndex, taskTotal }) => {
          job.currentCert = certName
          job.taskIndex = taskIndex
          job.taskTotal = taskTotal
        },
        shouldCancel: () => Boolean(job.cancelRequested),
      }))
    }

    job.results = results

    if (wasCancelled) {
      finishCancelledJob(job)
    }
    else {
      job.status = 'completed'
      job.finishedAt = new Date().toISOString()
      void persistCertJobSummary(job, false)
      job.resolve(results)
    }
  }
  catch (error) {
    if (isAbortLike(error) || job.cancelRequested) {
      finishCancelledJob(job)
    }
    else {
      job.status = 'failed'
      job.error = error instanceof Error ? error.message : 'Job failed'
      job.finishedAt = new Date().toISOString()
      void persistCertJobSummary(job, false)
      appendCertActivity({
        source: job.source,
        mode: job.mode,
        level: 'error',
        message: `Job #${job.id} failed: ${job.error}`,
      })
      job.reject(error)
    }
  }
  finally {
    job.abortController = undefined
    setRunning(null)
    setPumping(false)
    emitQueue()
    void emitStatus(job.mode)
    void pumpQueue()
  }
}

export async function createQueuedJob(options: {
  mode: LetsEncryptDirectoryMode
  source: JobSource
  certNames?: string[]
  force?: boolean
  renewOnly?: boolean
  resolve: (results: CertApplyResult[]) => void
  reject: (error: unknown) => void
}): Promise<InternalJob> {
  if (options.source !== 'lab' && !isAcmeEnabledForMode(options.mode)) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Production ACME is disabled (CERTS_ACME_DISABLED=true). Staging Apply still works.',
    })
  }

  let taskTotal: number | undefined
  let tasks: InternalJob['tasks']
  try {
    if (options.source === 'lab') {
      const lab = getLabPlugin()
      if (lab) {
        const domains = await lab.readDomains()
        if (domains.ok) {
          const wanted = options.certNames?.length
            ? domains.lines.filter(l => options.certNames!.includes(l.certName))
            : domains.lines
          taskTotal = wanted.length
          if (taskTotal) {
            tasks = lab.jobTasks.createPlan(wanted.map(line => line.certName))
          }
        }
      }
    }
    else {
      const domains = await readDomainsFile()
      if (domains.ok) {
        const wanted = options.certNames?.length
          ? domains.lines.filter(l => options.certNames!.includes(l.certName))
          : domains.lines
        taskTotal = wanted.length
        if (taskTotal) {
          tasks = createCertJobTaskPlan(wanted.map(line => line.certName))
        }
      }
    }
  }
  catch {
    // queue anyway; executor will validate
  }

  const job: InternalJob = {
    id: allocateJobId(),
    source: options.source,
    mode: options.mode,
    status: 'queued',
    createdAt: new Date().toISOString(),
    certNames: options.certNames,
    force: options.force,
    renewOnly: options.renewOnly,
    taskTotal,
    tasks,
    resolve: options.resolve,
    reject: options.reject,
  }

  waiting.push(job)
  appendCertActivity({
    source: options.source,
    mode: options.mode,
    level: 'info',
    message: `Job #${job.id} queued — position ${waiting.length}${taskTotal ? `, ${taskTotal} cert(s)` : ''}`,
  })
  emitQueue()
  void pumpQueue()
  return job
}
