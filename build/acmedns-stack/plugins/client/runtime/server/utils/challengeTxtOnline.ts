import { normaliseDnsName } from '#shared/utils/dnsMatch'
import {
  evaluateChallengeTxtProbe,
  pickCnameTarget,
  type ChallengeTxtProbeResult,
} from '#shared/utils/challengeTxtProbe'
import { queryAuthoritative } from './dnsAuthoritative'
import { logAcmeStep } from './acmeLogger'

const DEFAULT_POLL_TIMEOUT_MS = 3 * 60 * 1000
const DEFAULT_POLL_INTERVAL_MS = 5 * 1000
const MAX_CNAME_HOPS = 10

export type { ChallengeTxtProbeResult } from '#shared/utils/challengeTxtProbe'
export {
  collectTxtValues,
  evaluateChallengeTxtProbe,
  normaliseTxtValue,
  pickCnameTarget,
} from '#shared/utils/challengeTxtProbe'

export function challengeTxtPollTimeoutMs() {
  const value = Number(process.env.ACME_TXT_POLL_TIMEOUT_MS)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_POLL_TIMEOUT_MS
}

export function challengeTxtPollIntervalMs() {
  const value = Number(process.env.ACME_TXT_POLL_INTERVAL_MS)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_POLL_INTERVAL_MS
}

async function probeChallengeTxtAtName(
  qname: string,
  expectedTxt: string,
): Promise<ChallengeTxtProbeResult & { cnameTarget?: string }> {
  const [txtOutcomes, cnameOutcomes] = await Promise.all([
    queryAuthoritative(qname, 'TXT'),
    queryAuthoritative(qname, 'CNAME'),
  ])

  const evaluated = evaluateChallengeTxtProbe(txtOutcomes, cnameOutcomes, expectedTxt)
  if (evaluated.status !== 'pending') {
    return evaluated
  }

  const cnameTarget = pickCnameTarget(cnameOutcomes)
  if (!cnameTarget) {
    return evaluated
  }

  return { ...evaluated, cnameTarget }
}

export async function probeChallengeTxtOnline(
  challengeName: string,
  expectedTxt: string,
): Promise<ChallengeTxtProbeResult> {
  let current = normaliseDnsName(challengeName)
  const visited = new Set<string>()

  for (let hop = 0; hop < MAX_CNAME_HOPS; hop += 1) {
    if (visited.has(current)) {
      return {
        status: 'error',
        message: `CNAME loop detected while probing ${challengeName}`,
      }
    }
    visited.add(current)

    const step = await probeChallengeTxtAtName(current, expectedTxt)
    if (step.status === 'ok' || step.status === 'mismatch' || step.status === 'error') {
      return step
    }

    if (!step.cnameTarget) {
      return step
    }

    current = step.cnameTarget
  }

  return {
    status: 'error',
    message: `Too many CNAME hops while probing ${challengeName}`,
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

export async function waitForChallengeTxtOnline(options: {
  challengeName: string
  expectedTxt: string
  certName: string
  signal?: AbortSignal
}): Promise<void> {
  const timeoutMs = challengeTxtPollTimeoutMs()
  const intervalMs = challengeTxtPollIntervalMs()
  const started = Date.now()
  let attempts = 0
  let lastMessage = ''

  while (Date.now() - started < timeoutMs) {
    throwIfAborted(options.signal)
    attempts += 1

    const probe = await probeChallengeTxtOnline(options.challengeName, options.expectedTxt)
    if (probe.status === 'ok') {
      logAcmeStep(
        options.certName,
        `dns-01 TXT visible online for ${options.challengeName} (authoritative, attempt ${attempts})`,
      )
      return
    }

    if (probe.status === 'mismatch') {
      throw new Error(
        probe.actual
          ? `${probe.message} (found ${probe.actual})`
          : probe.message,
      )
    }

    if (probe.status === 'error') {
      throw new Error(probe.message)
    }

    if (probe.message !== lastMessage || attempts === 1) {
      logAcmeStep(
        options.certName,
        attempts === 1
          ? `Waiting for dns-01 TXT on ${options.challengeName} — ${probe.message}`
          : `Still waiting for dns-01 TXT on ${options.challengeName} — ${probe.message}`,
      )
      lastMessage = probe.message
    }

    await sleepMs(intervalMs, options.signal)
  }

  throw new Error(
    `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for dns-01 TXT on ${options.challengeName} to appear online`,
  )
}
