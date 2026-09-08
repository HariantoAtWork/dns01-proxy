import type { CertActivitySource } from '#shared/types/certs'
import { normaliseDnsName } from '#shared/utils/dnsMatch'
import {
  collectTxtValues,
  evaluateChallengeTxtProbe,
  formatDns01ProbeLog,
  pickCnameTarget,
  type ChallengeTxtProbeResult,
} from '#shared/utils/challengeTxtProbe'
import { queryAuthoritative } from './dnsAuthoritative'
import { appendCertActivity } from './certActivity'
import { logAcmeStep } from './acmeLogger'
import { resolveAcmeTxtSettleMs } from '../../../../txt-ttl/runtime/shared/txtTtlConstants'
import { acmeTxtOnlineTcpFallback } from '../../shared/utils/challengeTxtOnlineEnv'

export { acmeTxtOnlineTcpFallback } from '../../shared/utils/challengeTxtOnlineEnv'

const DEFAULT_POLL_TIMEOUT_MS = 3 * 60 * 1000
const DEFAULT_POLL_INTERVAL_MS = 5 * 1000
const MAX_CNAME_HOPS = 10

export type { ChallengeTxtProbeResult } from '#shared/utils/challengeTxtProbe'
export {
  collectTxtValues,
  evaluateChallengeTxtProbe,
  formatDns01ProbeLog,
  formatDns01TxtList,
  normaliseTxtValue,
  pickCnameTarget,
} from '#shared/utils/challengeTxtProbe'

export interface ChallengeTxtProbeHop {
  qname: string
  txtValues: string[]
  cnameTarget?: string
}

export interface ChallengeTxtProbeDetails extends ChallengeTxtProbeResult {
  hops: ChallengeTxtProbeHop[]
}

export function challengeTxtPollTimeoutMs() {
  const value = Number(process.env.ACME_TXT_POLL_TIMEOUT_MS)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_POLL_TIMEOUT_MS
}

export function challengeTxtPollIntervalMs() {
  const value = Number(process.env.ACME_TXT_POLL_INTERVAL_MS)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_POLL_INTERVAL_MS
}

/** Pause after TXT online before telling LE to validate (`ACME_TXT_SETTLE_MS`, default 5s; 0 disables). */
export function acmeTxtSettleMs() {
  return resolveAcmeTxtSettleMs()
}

async function probeChallengeTxtAtName(
  qname: string,
  expectedTxt: string,
): Promise<ChallengeTxtProbeResult & ChallengeTxtProbeHop> {
  const transport = { tcpFallback: acmeTxtOnlineTcpFallback() }
  const [txtOutcomes, cnameOutcomes] = [
    await queryAuthoritative(qname, 'TXT', transport),
    await queryAuthoritative(qname, 'CNAME', transport),
  ]

  const txtValues = collectTxtValues(txtOutcomes)
  const cnameTarget = pickCnameTarget(cnameOutcomes) ?? undefined
  const evaluated = evaluateChallengeTxtProbe(txtOutcomes, cnameOutcomes, expectedTxt)

  return {
    ...evaluated,
    qname,
    txtValues,
    cnameTarget,
  }
}

export async function probeChallengeTxtOnline(
  challengeName: string,
  expectedTxt: string,
): Promise<ChallengeTxtProbeDetails> {
  let current = normaliseDnsName(challengeName)
  const visited = new Set<string>()
  const hops: ChallengeTxtProbeHop[] = []

  for (let hop = 0; hop < MAX_CNAME_HOPS; hop += 1) {
    if (visited.has(current)) {
      return {
        status: 'error',
        message: `CNAME loop detected while probing ${challengeName}`,
        hops,
      }
    }
    visited.add(current)

    const step = await probeChallengeTxtAtName(current, expectedTxt)
    hops.push({
      qname: step.qname,
      txtValues: step.txtValues,
      cnameTarget: step.cnameTarget,
    })

    if (step.status === 'ok') {
      return { status: 'ok', message: step.message, actual: step.actual, hops }
    }

    if (step.status === 'error') {
      return { status: 'error', message: step.message, hops }
    }

    if (step.cnameTarget) {
      current = step.cnameTarget
      continue
    }

    if (step.status === 'mismatch') {
      return {
        status: 'mismatch',
        message: step.message,
        actual: step.actual,
        hops,
      }
    }

    return { status: step.status, message: step.message, hops }
  }

  return {
    status: 'error',
    message: `Too many CNAME hops while probing ${challengeName}`,
    hops,
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) {
    return
  }
  const reason = signal.reason
  if (reason instanceof Error) {
    throw reason
  }
  throw new Error(typeof reason === 'string' ? reason : 'ACME aborted')
}

async function sleepMs(ms: number, signal?: AbortSignal) {
  throwIfAborted(signal)
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      try {
        throwIfAborted(signal)
      }
      catch (error) {
        reject(error)
      }
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function logDns01Probe(
  certName: string,
  challengeName: string,
  leToken: string,
  probe: ChallengeTxtProbeDetails,
  attempt: number,
  activitySource: CertActivitySource = 'acme',
) {
  const message = formatDns01ProbeLog({
    challengeName,
    leToken,
    publishedToken: leToken,
    hops: probe.hops,
    attempt,
    matched: probe.status === 'ok',
  })
  const level = probe.status === 'ok' ? 'info' : 'warn'
  if (activitySource === 'acme') {
    logAcmeStep(certName, message, level)
    return
  }
  appendCertActivity({
    source: activitySource,
    level,
    certName,
    message,
  })
}

export type ChallengeTxtOnlineProgress = {
  /** 1-based attempt about to run (probe) or next attempt after the wait. */
  attempt: number
  phase: 'probe' | 'wait'
  /** Milliseconds until the next probe when `phase` is `wait`. */
  nextRetryInMs?: number
  /** Milliseconds left before the TXT online poll timeout. */
  timeoutRemainingMs: number
}

export async function waitForChallengeTxtOnline(options: {
  challengeName: string
  expectedTxt: string
  certName: string
  signal?: AbortSignal
  activitySource?: CertActivitySource
  onProgress?: (progress: ChallengeTxtOnlineProgress) => void
}): Promise<void> {
  const activitySource = options.activitySource ?? 'acme'
  const timeoutMs = challengeTxtPollTimeoutMs()
  const intervalMs = challengeTxtPollIntervalMs()
  const started = Date.now()
  const deadline = started + timeoutMs
  let attempts = 0
  let lastProbeSignature = ''

  const timeoutRemainingMs = () => Math.max(0, deadline - Date.now())

  while (Date.now() < deadline) {
    throwIfAborted(options.signal)
    attempts += 1
    options.onProgress?.({
      attempt: attempts,
      phase: 'probe',
      timeoutRemainingMs: timeoutRemainingMs(),
    })

    const probe = await probeChallengeTxtOnline(options.challengeName, options.expectedTxt)
    const probeSignature = probe.hops
      .map(hop => `${hop.qname}:${hop.txtValues.join('|')}:${hop.cnameTarget ?? ''}`)
      .join(';')

    if (probe.status === 'ok') {
      logDns01Probe(options.certName, options.challengeName, options.expectedTxt, probe, attempts, activitySource)
      const successMessage = `dns-01 TXT visible online for ${options.challengeName} (authoritative, attempt ${attempts})`
      if (activitySource === 'acme') {
        logAcmeStep(options.certName, successMessage)
      }
      else {
        appendCertActivity({
          source: activitySource,
          level: 'info',
          certName: options.certName,
          message: successMessage,
        })
      }
      return
    }

    if (probe.status === 'error') {
      logDns01Probe(options.certName, options.challengeName, options.expectedTxt, probe, attempts, activitySource)
      throw new Error(probe.message)
    }

    if (probeSignature !== lastProbeSignature || attempts === 1) {
      logDns01Probe(options.certName, options.challengeName, options.expectedTxt, probe, attempts, activitySource)
      lastProbeSignature = probeSignature
    }

    const waitEndsAt = Math.min(Date.now() + intervalMs, deadline)
    const nextAttempt = attempts + 1
    while (true) {
      throwIfAborted(options.signal)
      const remainingMs = waitEndsAt - Date.now()
      options.onProgress?.({
        attempt: nextAttempt,
        phase: 'wait',
        nextRetryInMs: Math.max(0, remainingMs),
        timeoutRemainingMs: timeoutRemainingMs(),
      })
      if (remainingMs <= 0) {
        break
      }
      await sleepMs(Math.min(1000, remainingMs), options.signal)
    }
  }

  throw new Error(
    `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for dns-01 TXT on ${options.challengeName}`
      + ` (LE token ${options.expectedTxt}; last authoritative answers logged above)`,
  )
}
