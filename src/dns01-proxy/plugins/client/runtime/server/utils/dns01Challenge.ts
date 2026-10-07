import type { CertActivitySource } from '#shared/types/certs'
import { apexName } from '#shared/utils/domains'
import { challengeHost } from '#shared/utils/challengeDns'
import { getSharedModeContext } from '../../../../../server/utils/sharedModeBootstrap'
import { ACME_REQUEST_STEPS } from '#shared/utils/acmeIssueSteps'
import { updateAcmeDnsTxt } from './acmedns'
import { abortableDelay, throwIfAborted } from './dns01Abort'
import {
  collectChallengeCnameTargets,
  isAuthHopPublishEnabled,
  resolveDns01AuthHopPublishTarget,
  resolveDns01PublishTarget,
  type Dns01PublishTarget,
} from './dns01PublishTarget'
import { appendCertActivity } from './certActivity'
import { acmeTxtSettleMs, waitForChallengeTxtOnline } from './challengeTxtOnline'
import { logAcmeStep } from './acmeLogger'
import { readStorage } from './storage'

export {
  abortableDelay,
  createChallengeSerialGate,
  throwIfAborted,
} from './dns01Abort'

export {
  collectChallengeCnameTargets,
  resolveDns01PublishTarget,
  type Dns01PublishTarget,
} from './dns01PublishTarget'

export { resolveAcmeDnsBase } from './acmedns'

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

  const domain = options.authzIdentifier
  const challengeName = challengeHost(apexName(domain))
  const cnameTargets = options.shared
    ? await collectChallengeCnameTargets(challengeName, options.shared.authZone)
    : []

  let publish: Dns01PublishTarget
  let authHopCleanup: (() => void) | undefined

  if (isAuthHopPublishEnabled(options.shared) && options.shared) {
    publish = resolveDns01AuthHopPublishTarget({
      authzIdentifier: options.authzIdentifier,
      keyAuthorization: options.keyAuthorization,
      certName: options.certName,
      preferUrl: options.preferUrl,
      shared: options.shared,
      cnameTargets,
    })
    authHopCleanup = publish.authHopCleanup
    logDns01Step(
      options.certName,
      `dns-01 ${domain}: auth hop entry ${publish.authHopEntryFqdn} → ${publish.authHopFqdn} (TXT on hop only)`,
      activitySource,
    )
  }
  else {
    publish = resolveDns01PublishTarget({
      ...options,
      cnameTargets,
    })
  }

  try {
    const hopFqdn = publish.authHopFqdn
    const slotSummary = publish.slots
      .map((slot) => {
        const where = slot.local ? 'local' : slot.serverUrl
        if (hopFqdn && slot.subdomain === publish.subdomain) {
          return `${hopFqdn}@${where}`
        }
        return `${slot.subdomain}@${where}`
      })
      .join(', ')
    logDns01Step(
      options.certName,
      options.shared
        ? `dns-01 ${domain}: publishing TXT to ${slotSummary}`
        : `dns-01 ${domain}: publishing TXT to acme-dns subdomain ${publish.subdomain} (${publish.serverUrl})`,
      activitySource,
    )

    const anyRemote = publish.slots.some(slot => !slot.local)
    const anyLocal = publish.slots.some(slot => slot.local)
    const publishPlace = anyRemote && anyLocal
      ? 'local+remote'
      : anyRemote
        ? 'remote'
        : 'local'
    options.reportStep(
      ACME_REQUEST_STEPS.PUBLISH_TXT,
      hopFqdn
        ? `Publish TXT ${domain} → ${hopFqdn}`
        : `Publish TXT ${domain} (${publishPlace})`,
    )

    for (const slot of publish.slots) {
      await updateAcmeDnsTxt({
        serverUrl: slot.serverUrl,
        username: publish.username,
        password: publish.password,
        subdomain: slot.subdomain,
        txt: publish.txt,
      })
    }

    logDns01Step(
      options.certName,
      hopFqdn
        ? `dns-01 ${domain}: acme-dns accepted TXT ${publish.txt} on ${hopFqdn}`
        : `dns-01 ${domain}: acme-dns accepted TXT ${publish.txt} on ${slotSummary}`,
      activitySource,
    )

    throwIfAborted(options.signal, activitySource === 'lab' ? 'Lab DNS-01 aborted' : 'ACME aborted')

    await waitForChallengeTxtOnline({
      challengeName,
      expectedTxt: publish.txt,
      certName: options.certName,
      signal: options.signal,
      activitySource,
      onProgress: ({ attempt, phase, nextRetryInMs, timeoutRemainingMs }) => {
        const timeoutSeconds = Math.max(0, Math.ceil(timeoutRemainingMs / 1000))
        const hopHint = hopFqdn ? ` via ${hopFqdn}` : ''
        if (phase === 'wait') {
          const nextSeconds = Math.max(0, Math.ceil((nextRetryInMs ?? 0) / 1000))
          options.reportStep(
            ACME_REQUEST_STEPS.TXT_ONLINE,
            `TXT online ${domain}${hopHint} (attempt ${attempt} · ${nextSeconds}s · timeout ${timeoutSeconds}s)`,
          )
          return
        }
        options.reportStep(
          ACME_REQUEST_STEPS.TXT_ONLINE,
          `TXT online ${domain}${hopHint} (attempt ${attempt} · timeout ${timeoutSeconds}s)`,
        )
      },
    })

    const settleMs = acmeTxtSettleMs()
    if (settleMs > 0) {
      const settleSeconds = Math.max(1, Math.ceil(settleMs / 1000))
      if (activitySource !== 'lab') {
        logAcmeStep(
          options.certName,
          hopFqdn
            ? `dns-01 TXT visible for ${domain} at ${hopFqdn}; waiting ${settleSeconds}s before LE validate`
            : `dns-01 TXT visible for ${domain}; waiting ${settleSeconds}s before LE validate`,
        )
      }
      const endsAt = Date.now() + settleMs
      while (true) {
        throwIfAborted(options.signal, activitySource === 'lab' ? 'Lab DNS-01 aborted' : 'ACME aborted')
        const remainingMs = endsAt - Date.now()
        const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
        options.reportStep(
          ACME_REQUEST_STEPS.DNS_SETTLE,
          hopFqdn
            ? `DNS settle ${domain} @ ${hopFqdn} (${remainingSeconds}s)`
            : `DNS settle ${domain} (${remainingSeconds}s)`,
        )
        if (remainingMs <= 0) {
          break
        }
        await abortableDelay(Math.min(1000, remainingMs), options.signal)
      }
    }

    const validateLabel = options.validateStepLabel?.(domain)
      ?? (hopFqdn ? `LE validate ${domain} @ ${hopFqdn}` : `LE validate ${domain}`)
    const readyLog = options.validateReadyLog?.(domain)
      ?? (hopFqdn
        ? `dns-01 TXT ready for ${domain} on ${hopFqdn}; telling Let's Encrypt to validate`
        : `dns-01 TXT ready for ${domain}; telling Let's Encrypt to validate`)
    logDns01Step(options.certName, readyLog, activitySource)

    options.reportStep(ACME_REQUEST_STEPS.VALIDATE_SAVE, validateLabel)

    return publish
  }
  catch (error) {
    authHopCleanup?.()
    throw error
  }
}
