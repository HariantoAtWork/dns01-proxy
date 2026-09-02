import type { LabRequestStepProgress } from '#lab-shared/utils/labIssueSteps'
import { findAccount, apexName } from '#shared/utils/domains'
import { challengeHost } from '#shared/utils/challengeDns'
import { tinyApexLabel } from '#shared/utils/tinyModeDns'
import { getSharedModeContext } from '../../../../../server/utils/sharedModeBootstrap'
import { readStorage } from '../../../../client/runtime/server/utils/storage'
import { resolveAcmeDnsBase, updateAcmeDnsTxt } from '../../../../client/runtime/server/utils/acmedns'
import { appendCertActivity } from '../../../../client/runtime/server/utils/certActivity'
import { acmeTxtSettleMs, waitForChallengeTxtOnline } from '../../../../client/runtime/server/utils/challengeTxtOnline'
import {
  LAB_REQUEST_STEPS,
  LAB_REQUEST_STEP_TOTAL,
  labRequestStepLabel,
} from '#lab-shared/utils/labIssueSteps'
import { fakeAcmeOrder, formatFakeAcmeOrderDetail, type FakeAcmeChallenge } from './fakeAcmeOrder'

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) {
    return
  }
  const reason = signal.reason
  if (reason instanceof Error) {
    throw reason
  }
  const err = new Error(typeof reason === 'string' ? reason : 'Lab DNS-01 aborted')
  err.name = 'AbortError'
  throw err
}

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve()
  }
  throwIfAborted(signal)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
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

function createChallengeSerialGate() {
  let gate = Promise.resolve()

  type Turn = {
    markCreateFinished: () => void
    markRemove: () => void
    abort: () => void
  }

  return {
    async enter(): Promise<Turn> {
      const previous = gate
      let releaseGate!: () => void
      gate = previous.then(() => new Promise<void>((resolve) => {
        releaseGate = resolve
      }))
      await previous

      let createFinished = false
      let removeSignalled = false
      let released = false

      const release = () => {
        if (released) {
          return
        }
        released = true
        releaseGate()
      }

      return {
        markCreateFinished() {
          createFinished = true
          if (removeSignalled) {
            release()
          }
        },
        markRemove() {
          removeSignalled = true
          if (createFinished) {
            release()
          }
        },
        abort() {
          release()
        },
      }
    },
  }
}

async function runRealDns01Challenge(options: {
  authzIdentifier: string
  keyAuthorization: string
  certName: string
  preferUrl: string
  shared: ReturnType<typeof getSharedModeContext>
  storage: Awaited<ReturnType<typeof readStorage>>
  signal?: AbortSignal
  reportStep: (index: number, label?: string) => void
}) {
  throwIfAborted(options.signal)
  const domain = options.authzIdentifier
  const { key: storageKey, account } = options.shared
    ? { key: domain, account: options.shared.account }
    : findAccount(options.storage, domain)
  if (!account || (!options.shared && !storageKey)) {
    throw new Error(`No acme-dns account for ${domain}`)
  }

  const subdomain = options.shared
    ? tinyApexLabel(options.certName)
    : account.subdomain
  if (!subdomain) {
    throw new Error(`No acme-dns subdomain for ${domain}`)
  }

  const publishTarget = account.server_url || options.preferUrl

  appendCertActivity({
    source: 'lab',
    level: 'info',
    certName: options.certName,
    message: options.shared
      ? `dns-01 ${domain}: publishing token to shared acme-dns subdomain ${subdomain} (${publishTarget})`
      : `dns-01 ${domain}: publishing token to acme-dns subdomain ${subdomain} (${publishTarget})`,
  })

  options.reportStep(LAB_REQUEST_STEPS.PUBLISH_TXT, `Publish TXT ${domain}`)

  await updateAcmeDnsTxt({
    serverUrl: publishTarget,
    username: account.username,
    password: account.password,
    subdomain,
    txt: options.keyAuthorization,
  })

  appendCertActivity({
    source: 'lab',
    level: 'info',
    certName: options.certName,
    message: `dns-01 ${domain}: acme-dns accepted TXT ${options.keyAuthorization}`,
  })

  throwIfAborted(options.signal)

  options.reportStep(LAB_REQUEST_STEPS.TXT_ONLINE, `TXT online ${domain}`)

  const challengeName = challengeHost(apexName(domain))
  await waitForChallengeTxtOnline({
    challengeName,
    expectedTxt: options.keyAuthorization,
    certName: options.certName,
    signal: options.signal,
    activitySource: 'lab',
  })

  const settleMs = acmeTxtSettleMs()
  if (settleMs > 0) {
    options.reportStep(LAB_REQUEST_STEPS.DNS_SETTLE, `DNS settle ${domain}`)
    await abortableDelay(settleMs, options.signal)
  }

  options.reportStep(LAB_REQUEST_STEPS.VALIDATE_SAVE, `FAKE LE validate ${domain}`)
}

async function runChallengeBatch(options: {
  certName: string
  challenges: FakeAcmeChallenge[]
  preferUrl: string
  shared: ReturnType<typeof getSharedModeContext>
  storage: Awaited<ReturnType<typeof readStorage>>
  signal?: AbortSignal
  reportStep: (index: number, label?: string) => void
}) {
  const challengeSerial = createChallengeSerialGate()

  for (const challenge of options.challenges) {
    throwIfAborted(options.signal)
    const turn = await challengeSerial.enter()
    try {
      await runRealDns01Challenge({
        authzIdentifier: challenge.domain,
        keyAuthorization: challenge.keyAuthorization,
        certName: options.certName,
        preferUrl: options.preferUrl,
        shared: options.shared,
        storage: options.storage,
        signal: options.signal,
        reportStep: options.reportStep,
      })
      turn.markCreateFinished()
    }
    catch (error) {
      turn.abort()
      throw error
    }
    finally {
      turn.markRemove()
    }
  }
}

export async function runLabDns01(options: {
  certName: string
  altNames: string[]
  signal?: AbortSignal
  onRequestStep?: (step: LabRequestStepProgress) => void
}) {
  throwIfAborted(options.signal)

  const reportStep = (index: number, label?: string) => {
    options.onRequestStep?.({
      index,
      total: LAB_REQUEST_STEP_TOTAL,
      label: label ?? labRequestStepLabel(index),
    })
  }

  const preferUrl = resolveAcmeDnsBase()
  const storage = await readStorage()
  const shared = getSharedModeContext()

  reportStep(LAB_REQUEST_STEPS.ACME_ORDER, 'FAKE ACME order')

  const { challenges } = await fakeAcmeOrder(options.altNames)

  await runChallengeBatch({
    certName: options.certName,
    challenges,
    preferUrl,
    shared,
    storage,
    signal: options.signal,
    reportStep,
  })

  return {
    certName: options.certName,
    challengeCount: challenges.length,
    orderDetail: formatFakeAcmeOrderDetail(challenges),
  }
}
