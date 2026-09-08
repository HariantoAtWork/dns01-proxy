import type { CertActivitySource } from '#shared/types/certs'
import { findAccount, apexName } from '#shared/utils/domains'
import { challengeHost } from '#shared/utils/challengeDns'
import { tinyApexLabel } from '#shared/utils/tinyModeDns'
import { getSharedModeContext } from '../../../../../server/utils/sharedModeBootstrap'
import { ACME_REQUEST_STEPS } from '#shared/utils/acmeIssueSteps'
import { resolveAcmeDnsBase, updateAcmeDnsTxt, isInProcessAcmeDnsBackend } from './acmedns'
import { appendCertActivity } from './certActivity'
import { acmeTxtSettleMs, waitForChallengeTxtOnline } from './challengeTxtOnline'
import { logAcmeStep } from './acmeLogger'
import { readStorage } from './storage'

export function throwIfAborted(signal?: AbortSignal, message = 'DNS-01 aborted') {
  if (!signal?.aborted) {
    return
  }
  const reason = signal.reason
  if (reason instanceof Error) {
    throw reason
  }
  const err = new Error(typeof reason === 'string' ? reason : message)
  err.name = 'AbortError'
  throw err
}

export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
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

export function createChallengeSerialGate() {
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

function logDns01Step(
  certName: string,
  message: string,
  activitySource: CertActivitySource,
) {
  if (activitySource === 'lab') {
    appendCertActivity({ source: 'lab', level: 'info', certName, message })
    return
  }
  logAcmeStep(certName, message)
}

export interface Dns01PublishTarget {
  serverUrl: string
  username: string
  password: string
  subdomain: string
  txt: string
  certName: string
  domain: string
}

export function resolveDns01PublishTarget(options: {
  authzIdentifier: string
  keyAuthorization: string
  certName: string
  preferUrl: string
  shared: ReturnType<typeof getSharedModeContext>
  storage: Awaited<ReturnType<typeof readStorage>>
}): Dns01PublishTarget {
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

  return {
    serverUrl: account.server_url || options.preferUrl,
    username: account.username,
    password: account.password,
    subdomain,
    txt: options.keyAuthorization,
    certName: options.certName,
    domain,
  }
}

export async function runDns01Challenge(options: {
  authzIdentifier: string
  keyAuthorization: string
  certName: string
  preferUrl: string
  shared: ReturnType<typeof getSharedModeContext>
  storage: Awaited<ReturnType<typeof readStorage>>
  signal?: AbortSignal
  reportStep: (index: number, label?: string) => void
  activitySource?: CertActivitySource
  validateStepLabel?: (domain: string) => string
  validateReadyLog?: (domain: string) => string
}) {
  const activitySource = options.activitySource ?? 'acme'
  throwIfAborted(options.signal, activitySource === 'lab' ? 'Lab DNS-01 aborted' : 'ACME aborted')

  const publish = resolveDns01PublishTarget(options)
  const domain = publish.domain

  logDns01Step(
    options.certName,
    options.shared
      ? `dns-01 ${domain}: publishing TXT to shared acme-dns subdomain ${publish.subdomain} (${publish.serverUrl})`
      : `dns-01 ${domain}: publishing TXT to acme-dns subdomain ${publish.subdomain} (${publish.serverUrl})`,
    activitySource,
  )

  options.reportStep(ACME_REQUEST_STEPS.PUBLISH_TXT, `Publish TXT ${domain}`)

  await updateAcmeDnsTxt({
    serverUrl: publish.serverUrl,
    username: publish.username,
    password: publish.password,
    subdomain: publish.subdomain,
    txt: publish.txt,
  })

  logDns01Step(
    options.certName,
    `dns-01 ${domain}: acme-dns accepted TXT ${publish.txt}`,
    activitySource,
  )

  throwIfAborted(options.signal, activitySource === 'lab' ? 'Lab DNS-01 aborted' : 'ACME aborted')

  const localBackend = isInProcessAcmeDnsBackend(publish.serverUrl, publish.username)

  if (localBackend) {
    // Own auth zone: probe authoritative DNS (local listen under this zone).
    const challengeName = challengeHost(apexName(domain))
    await waitForChallengeTxtOnline({
      challengeName,
      expectedTxt: publish.txt,
      certName: options.certName,
      signal: options.signal,
      activitySource,
      onProgress: ({ attempt, phase, nextRetryInMs, timeoutRemainingMs }) => {
        const timeoutSeconds = Math.max(0, Math.ceil(timeoutRemainingMs / 1000))
        if (phase === 'wait') {
          const nextSeconds = Math.max(0, Math.ceil((nextRetryInMs ?? 0) / 1000))
          options.reportStep(
            ACME_REQUEST_STEPS.TXT_ONLINE,
            `TXT online ${domain} (attempt ${attempt} · ${nextSeconds}s · timeout ${timeoutSeconds}s)`,
          )
          return
        }
        options.reportStep(
          ACME_REQUEST_STEPS.TXT_ONLINE,
          `TXT online ${domain} (attempt ${attempt} · timeout ${timeoutSeconds}s)`,
        )
      },
    })
  }
  else {
    // Remote acme-dns: publish was POST /update — that acceptance is the online gate
    // (no list API; LE will query the remote auth NS itself).
    options.reportStep(
      ACME_REQUEST_STEPS.TXT_ONLINE,
      `TXT online ${domain} (remote /update)`,
    )
    logDns01Step(
      options.certName,
      `dns-01 ${domain}: TXT online via remote acme-dns /update (${resolveAcmeDnsBase(publish.serverUrl)})`,
      activitySource,
    )
  }

  const settleMs = acmeTxtSettleMs()
  if (settleMs > 0) {
    const settleSeconds = Math.max(1, Math.ceil(settleMs / 1000))
    if (activitySource !== 'lab') {
      logAcmeStep(
        options.certName,
        `dns-01 TXT visible for ${domain}; waiting ${settleSeconds}s before LE validate`,
      )
    }
    const endsAt = Date.now() + settleMs
    while (true) {
      throwIfAborted(options.signal, activitySource === 'lab' ? 'Lab DNS-01 aborted' : 'ACME aborted')
      const remainingMs = endsAt - Date.now()
      const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
      options.reportStep(
        ACME_REQUEST_STEPS.DNS_SETTLE,
        `DNS settle ${domain} (${remainingSeconds}s)`,
      )
      if (remainingMs <= 0) {
        break
      }
      await abortableDelay(Math.min(1000, remainingMs), options.signal)
    }
  }

  const validateLabel = options.validateStepLabel?.(domain) ?? `LE validate ${domain}`
  const readyLog = options.validateReadyLog?.(domain)
    ?? `dns-01 TXT ready for ${domain}; telling Let's Encrypt to validate`
  logDns01Step(options.certName, readyLog, activitySource)

  options.reportStep(ACME_REQUEST_STEPS.VALIDATE_SAVE, validateLabel)

  return publish
}

export { resolveAcmeDnsBase }
