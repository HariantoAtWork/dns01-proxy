import type {
  CertApplyResult,
  CertJobQueueItem,
  LetsEncryptDirectoryMode,
} from '#shared/types/certs'
import { readDomainsFile } from '../domainsFile'
import { issueCertificate } from '../acmeIssue'
import { isAcmeEnabledForMode } from '../certSettings'
import { appendCertActivity } from '../certActivity'
import { publishCertLive } from '../certLiveBus'
import { buildCertLiveStatus } from '../certLivePublish'
import { buildCertStatus, needsRenewal, readCertMeta } from '../certStatus'
import { clearRateLimitAfterSuccess } from '../acmeLogger'
import { getCertRateLimits, rateLimitForCert } from '../certRateLimit'
import { enrichLetsEncryptDnsError } from '../enrichLeDnsError'
import {
  allocateJobId,
  emitQueue,
  isAbortLike,
  jobCancelledError,
  setPumping,
  setRunning,
  ensureRunningJobTasks,
  beginRunningJobTask,
  finishRunningJobTask,
  trackRunningJobRequest,
  completeRunningJobRequests,
  clearRunningJobTasks,
  type InternalJob,
  type JobSource,
  waiting,
  cancelled,
  pumping,
  running,
} from './state'
import { dnsPreflightForLine, rateLimitSkipMessage } from './preflight'
import { ACME_REQUEST_STEPS } from '../../../shared/utils/acmeIssueSteps'
import { createCertJobTaskPlan } from '../../../shared/utils/certJobTasks'

/** Per-certificate ACME wall clock (production dns-01 can exceed proxy timeouts). */
export const ACME_CERT_TIMEOUT_MS = Number(process.env.ACME_CERT_TIMEOUT_MS || 4 * 60 * 1000)

const QUIET_MESSAGES = new Set([
  'Not due for renewal',
  'No certificate to renew',
  'Up to date',
])

async function emitStatus(mode: LetsEncryptDirectoryMode) {
  publishCertLive({
    type: 'status',
    data: await buildCertLiveStatus(mode),
  })
}

function logApplyResult(
  source: JobSource,
  mode: LetsEncryptDirectoryMode,
  result: CertApplyResult,
) {
  if (QUIET_MESSAGES.has(result.message)) {
    return
  }
  appendCertActivity({
    source,
    mode,
    level: result.ok ? 'info' : 'error',
    certName: result.certName,
    message: result.message,
  })
}

function certIssueSignal(jobAbort: AbortSignal) {
  const timeoutMs = Number.isFinite(ACME_CERT_TIMEOUT_MS) && ACME_CERT_TIMEOUT_MS > 0
    ? ACME_CERT_TIMEOUT_MS
    : 4 * 60 * 1000
  const timeout = AbortSignal.timeout(timeoutMs)
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([jobAbort, timeout])
  }
  return jobAbort
}

export async function executeApplyCertificates(options: {
  mode: LetsEncryptDirectoryMode
  source: JobSource
  certNames?: string[]
  force?: boolean
  renewOnly?: boolean
  jobId: number
  priorResults?: CertApplyResult[]
  abortSignal: AbortSignal
  onProgress: (progress: { certName: string | undefined, taskIndex: number, taskTotal: number }) => void
  shouldCancel: () => boolean
}): Promise<{ results: CertApplyResult[], cancelled: boolean }> {
  const continuing = Boolean(options.priorResults?.length)
  appendCertActivity({
    source: options.source,
    mode: options.mode,
    level: 'info',
    message: continuing
      ? `Job #${options.jobId} continuing — ${options.priorResults!.length} already done`
      : `Job #${options.jobId} started`,
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

  ensureRunningJobTasks(
    wanted.map(line => line.certName),
    completedNames,
  )

  for (let index = 0; index < wanted.length; index += 1) {
    const line = wanted[index]!
    const taskIndex = index + 1

    if (completedNames.has(line.certName)) {
      continue
    }

    if (options.shouldCancel() || options.abortSignal.aborted) {
      appendCertActivity({
        source: options.source,
        mode: options.mode,
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
        const message = meta ? 'Not due for renewal' : 'No certificate to renew'
        results.push({
          certName: line.certName,
          ok: true,
          message,
          notAfter: meta?.notAfter,
        })
        finishRunningJobTask(line.certName, 'skipped', message)
        continue
      }
    }
    else if (!options.force && !missing && !drift) {
      const message = 'Up to date'
      results.push({
        certName: line.certName,
        ok: true,
        message,
        notAfter: meta?.notAfter,
      })
      finishRunningJobTask(line.certName, 'skipped', message)
      continue
    }

    const activeLimit = rateLimitForCert(
      await getCertRateLimits(),
      options.mode,
      line.certName,
    )
    if (activeLimit && !options.force) {
      const result: CertApplyResult = {
        certName: line.certName,
        ok: false,
        message: rateLimitSkipMessage(activeLimit),
        notAfter: meta?.notAfter,
      }
      results.push(result)
      appendCertActivity({
        source: options.source,
        mode: options.mode,
        level: 'warn',
        certName: line.certName,
        message: result.message,
      })
      finishRunningJobTask(line.certName, 'failed', result.message)
      continue
    }

    if (activeLimit && options.force) {
      appendCertActivity({
        source: options.source,
        mode: options.mode,
        level: 'warn',
        certName: line.certName,
        message: `Force Apply — retrying despite rate limit until ${activeLimit.until}`,
      })
    }

    beginRunningJobTask(line.certName)
    trackRunningJobRequest(ACME_REQUEST_STEPS.DNS_PREFLIGHT)
    const preflight = await dnsPreflightForLine(line)
    if (!preflight.ok && !options.force) {
      const result: CertApplyResult = {
        certName: line.certName,
        ok: false,
        message: preflight.message,
        notAfter: meta?.notAfter,
      }
      results.push(result)
      appendCertActivity({
        source: options.source,
        mode: options.mode,
        level: 'warn',
        certName: line.certName,
        message: result.message,
      })
      finishRunningJobTask(line.certName, 'failed', result.message)
      continue
    }
    if (!preflight.ok && options.force) {
      appendCertActivity({
        source: options.source,
        mode: options.mode,
        level: 'warn',
        certName: line.certName,
        message: `Force Apply — bypassing DNS preflight (${preflight.message})`,
      })
    }

    appendCertActivity({
      source: options.source,
      mode: options.mode,
      level: 'info',
      certName: line.certName,
      message: missing ? 'Issuing certificate…' : 'Renewing certificate…',
    })

    try {
      await issueCertificate({
        mode: options.mode,
        certName: line.certName,
        altNames: line.expanded,
        signal: certIssueSignal(options.abortSignal),
        onRequestStep: ({ index, label }) => trackRunningJobRequest(index, label),
      })
      completeRunningJobRequests()
      const after = await readCertMeta(options.mode, line.certName)
      const result: CertApplyResult = {
        certName: line.certName,
        ok: true,
        message: missing ? 'Issued' : drift ? 'Re-issued (SAN change)' : 'Renewed',
        notAfter: after?.notAfter,
      }
      results.push(result)
      finishRunningJobTask(line.certName, 'done')
      logApplyResult(options.source, options.mode, result)
      await clearRateLimitAfterSuccess(options.mode, line.certName)
      await emitStatus(options.mode)
    }
    catch (error) {
      const rateLimited = Boolean(
        error
        && typeof error === 'object'
        && 'rateLimited' in error
        && (error as { rateLimited?: boolean }).rateLimited,
      ) || /rate limit/i.test(error instanceof Error ? error.message : '')

      if (rateLimited) {
        const message = error instanceof Error
          ? error.message
          : 'Let\'s Encrypt rate limit'
        const result: CertApplyResult = {
          certName: line.certName,
          ok: false,
          message,
        }
        results.push(result)
        finishRunningJobTask(line.certName, 'failed', message)
        logApplyResult(options.source, options.mode, result)
        appendCertActivity({
          source: options.source,
          mode: options.mode,
          level: 'warn',
          message: `Job #${options.jobId} skipped ${line.certName} (rate limited); continuing with remaining certs`,
        })
        await emitStatus(options.mode)
        continue
      }

      if (isAbortLike(error) || options.shouldCancel() || options.abortSignal.aborted) {
        const timedOut = !options.shouldCancel()
          && (
            (error instanceof Error && error.name === 'TimeoutError')
            || /timed out/i.test(error instanceof Error ? error.message : '')
          )
        appendCertActivity({
          source: options.source,
          mode: options.mode,
          level: 'warn',
          certName: line.certName,
          message: timedOut
            ? `Job #${options.jobId} ACME timed out on ${line.certName} after ${Math.round(ACME_CERT_TIMEOUT_MS / 1000)}s`
            : `Job #${options.jobId} aborted on ${line.certName}`,
        })
        if (timedOut) {
          const result: CertApplyResult = {
            certName: line.certName,
            ok: false,
            message: `ACME timed out after ${Math.round(ACME_CERT_TIMEOUT_MS / 1000)}s (dns-01 / Let's Encrypt). Check CNAME → auth zone and try again.`,
          }
          results.push(result)
          finishRunningJobTask(line.certName, 'failed', result.message)
          logApplyResult(options.source, options.mode, result)
          continue
        }
        finishRunningJobTask(line.certName, 'failed')
        return { results, cancelled: true }
      }
      const rawMessage = error instanceof Error ? error.message : 'Issue failed'
      const message = await enrichLetsEncryptDnsError(rawMessage, line)
      const result: CertApplyResult = {
        certName: line.certName,
        ok: false,
        message,
      }
      results.push(result)
      finishRunningJobTask(line.certName, 'failed', message)
      logApplyResult(options.source, options.mode, result)
    }
  }

  options.onProgress({ certName: undefined, taskIndex: taskTotal, taskTotal })
  emitQueue()

  const renewed = results.filter(r => r.ok && ['Renewed', 'Issued', 'Re-issued (SAN change)'].includes(r.message))
  const failed = results.filter(r => !r.ok)
  appendCertActivity({
    source: options.source,
    mode: options.mode,
    level: failed.length ? 'warn' : 'info',
    message: options.source === 'renew'
      ? `Job #${options.jobId} complete: ${renewed.length} renewed, ${failed.length} failed`
      : `Job #${options.jobId} complete: ${renewed.length} issued/renewed, ${failed.length} failed`,
  })

  return { results, cancelled: false }
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
    const { results, cancelled: wasCancelled } = await executeApplyCertificates({
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
    if (isAbortLike(error) || job.cancelRequested) {
      finishCancelledJob(job)
    }
    else {
      job.status = 'failed'
      job.error = error instanceof Error ? error.message : 'Job failed'
      job.finishedAt = new Date().toISOString()
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
  if (!isAcmeEnabledForMode(options.mode)) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Production ACME is disabled (CERTS_ACME_DISABLED=true). Staging Apply still works.',
    })
  }

  let taskTotal: number | undefined
  let tasks: InternalJob['tasks']
  try {
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
  catch {
    // queue anyway; executeApplyCertificates will validate
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
