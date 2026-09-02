import type { CertApplyResult } from '#shared/types/certs'
import { appendCertActivity } from '../../../../client/runtime/server/utils/certActivity'
import { dnsPreflightForLine } from '../../../../client/runtime/server/utils/certJobQueue/preflight'
import {
  beginRunningJobTask,
  completeRunningJobRequests,
  ensureRunningJobTasks,
  finishRunningJobTask,
  isAbortLike,
  trackRunningJobRequest,
} from '../../../../client/runtime/server/utils/certJobQueue/state'
import { ACME_CERT_TIMEOUT_MS } from '../../../../client/runtime/server/utils/certJobQueue/executor'
import { LAB_REQUEST_STEPS } from '#lab-shared/utils/labIssueSteps'
import { readLabDomainsFile } from './labDomainsFile'
import { runLabDns01 } from './fakeAcmeIssue'
import { recordLabResult } from './labStatus'
import type { LabExecutorOptions } from '../../../../client/runtime/server/utils/certJobQueue/labRegistry'

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

export async function executeLabDns01(
  options: LabExecutorOptions,
): Promise<{ results: CertApplyResult[], cancelled: boolean }> {
  const continuing = Boolean(options.priorResults?.length)
  appendCertActivity({
    source: 'lab',
    level: 'info',
    message: continuing
      ? `Job #${options.jobId} continuing — ${options.priorResults!.length} already done`
      : `Job #${options.jobId} started (DNS-01 lab)`,
  })

  const domains = await readLabDomainsFile()
  if (!domains.ok) {
    throw createError({
      statusCode: 400,
      statusMessage: 'lab-domains.txt has validation errors. Fix and save first.',
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
        source: 'lab',
        level: 'warn',
        message: `Job #${options.jobId} cancel requested — stopping before ${line.certName}`,
      })
      return { results, cancelled: true }
    }

    options.onProgress({ certName: line.certName, taskIndex, taskTotal })

    beginRunningJobTask(line.certName)
    trackRunningJobRequest(LAB_REQUEST_STEPS.DNS_PREFLIGHT)

    const preflight = await dnsPreflightForLine(line)
    if (!preflight.ok && !options.force) {
      const result: CertApplyResult = {
        certName: line.certName,
        ok: false,
        message: preflight.message,
      }
      results.push(result)
      await recordLabResult(line.certName, false, result.message)
      appendCertActivity({
        source: 'lab',
        level: 'warn',
        certName: line.certName,
        message: result.message,
      })
      finishRunningJobTask(line.certName, 'failed', result.message)
      continue
    }

    if (!preflight.ok && options.force) {
      appendCertActivity({
        source: 'lab',
        level: 'warn',
        certName: line.certName,
        message: `Force run — bypassing DNS preflight (${preflight.message})`,
      })
    }

    appendCertActivity({
      source: 'lab',
      level: 'info',
      certName: line.certName,
      message: 'Running DNS-01 lab…',
    })

    try {
      const labResult = await runLabDns01({
        certName: line.certName,
        altNames: line.expanded,
        signal: certIssueSignal(options.abortSignal),
        onRequestStep: ({ index, label }) => trackRunningJobRequest(
          index,
          label,
          index === LAB_REQUEST_STEPS.ACME_ORDER ? line.expanded : undefined,
        ),
      })
      completeRunningJobRequests()

      const message = `Lab passed — ${labResult.challengeCount} challenge(s); ${labResult.orderDetail}`
      const result: CertApplyResult = {
        certName: line.certName,
        ok: true,
        message,
      }
      results.push(result)
      await recordLabResult(line.certName, true, message)
      finishRunningJobTask(line.certName, 'done')
      appendCertActivity({
        source: 'lab',
        level: 'info',
        certName: line.certName,
        message,
      })
    }
    catch (error) {
      if (isAbortLike(error) || options.shouldCancel() || options.abortSignal.aborted) {
        const timedOut = !options.shouldCancel()
          && (
            (error instanceof Error && error.name === 'TimeoutError')
            || /timed out/i.test(error instanceof Error ? error.message : '')
          )
        appendCertActivity({
          source: 'lab',
          level: 'warn',
          certName: line.certName,
          message: timedOut
            ? `Job #${options.jobId} lab timed out on ${line.certName}`
            : `Job #${options.jobId} aborted on ${line.certName}`,
        })
        if (timedOut) {
          const result: CertApplyResult = {
            certName: line.certName,
            ok: false,
            message: `Lab timed out after ${Math.round(ACME_CERT_TIMEOUT_MS / 1000)}s`,
          }
          results.push(result)
          await recordLabResult(line.certName, false, result.message)
          finishRunningJobTask(line.certName, 'failed', result.message)
          continue
        }
        finishRunningJobTask(line.certName, 'failed')
        return { results, cancelled: true }
      }

      const message = error instanceof Error ? error.message : 'Lab run failed'
      const result: CertApplyResult = {
        certName: line.certName,
        ok: false,
        message,
      }
      results.push(result)
      await recordLabResult(line.certName, false, message)
      finishRunningJobTask(line.certName, 'failed', message)
      appendCertActivity({
        source: 'lab',
        level: 'error',
        certName: line.certName,
        message,
      })
    }
  }

  options.onProgress({ certName: undefined, taskIndex: taskTotal, taskTotal })

  const passed = results.filter(r => r.ok)
  const failed = results.filter(r => !r.ok)
  appendCertActivity({
    source: 'lab',
    level: failed.length ? 'warn' : 'info',
    message: `Job #${options.jobId} complete: ${passed.length} passed, ${failed.length} failed`,
  })

  return { results, cancelled: false }
}
