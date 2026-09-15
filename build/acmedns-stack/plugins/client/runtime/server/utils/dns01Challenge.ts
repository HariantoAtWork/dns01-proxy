import type { CertActivitySource } from '#shared/types/certs'
import { findAccount, apexName } from '#shared/utils/domains'
import { challengeHost } from '#shared/utils/challengeDns'
import { normaliseDnsName } from '#shared/utils/dnsMatch'
import { pickCnameTarget } from '#shared/utils/challengeTxtProbe'
import {
  mergeSharedPublishSubdomains,
  planTinyPublishSlots,
  tinyApexLabel,
  type TinyPublishSlot,
} from '#shared/utils/tinyModeDns'
import { getSharedModeContext } from '../../../../../server/utils/sharedModeBootstrap'
import { ACME_REQUEST_STEPS } from '#shared/utils/acmeIssueSteps'
import { resolveAcmeDnsBase, updateAcmeDnsTxt, isInProcessAcmeDnsPublish } from './acmedns'
import { appendCertActivity } from './certActivity'
import { acmeTxtOnlineTcpFallback, acmeTxtSettleMs, waitForChallengeTxtOnline } from './challengeTxtOnline'
import { queryAuthoritative } from './dnsAuthoritative'
import { logAcmeStep } from './acmeLogger'
import { readStorage } from './storage'

const MAX_SHARED_CNAME_HOPS = 10

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
  /** Primary / first publish key (encoded Tiny label in shared mode). */
  subdomain: string
  /** All TXT store keys to write (encoded + live CNAME labels under auth zone). */
  subdomains: string[]
  /** Tiny: per-slot local vs remote HTTP /update destinations. */
  slots: TinyPublishSlot[]
  txt: string
  certName: string
  domain: string
}

/** Follow public CNAME hops from the challenge host; collect targets under auth zone. */
export async function collectChallengeCnameTargets(
  challengeName: string,
  authZone: string,
): Promise<string[]> {
  const targets: string[] = []
  const visited = new Set<string>()
  let current = normaliseDnsName(challengeName)
  const zone = normaliseDnsName(authZone)
  const transport = { tcpFallback: acmeTxtOnlineTcpFallback() }

  for (let hop = 0; hop < MAX_SHARED_CNAME_HOPS; hop += 1) {
    if (visited.has(current)) {
      break
    }
    visited.add(current)

    const cnameOutcomes = await queryAuthoritative(current, 'CNAME', transport)
    const next = pickCnameTarget(cnameOutcomes)
    if (!next) {
      break
    }
    targets.push(next)
    current = next
    // Stop once we land under this stack's auth zone — remote Tiny targets keep going until NODATA.
    if (current === zone || current.endsWith(`.${zone}`)) {
      break
    }
  }

  return targets
}

export function resolveDns01PublishTarget(options: {
  authzIdentifier: string
  keyAuthorization: string
  certName: string
  preferUrl: string
  shared: ReturnType<typeof getSharedModeContext>
  storage: Awaited<ReturnType<typeof readStorage>>
  /** Extra auth-zone CNAME targets (shared mode dual-publish). */
  cnameTargets?: string[]
}): Dns01PublishTarget {
  const domain = options.authzIdentifier
  const { key: storageKey, account } = options.shared
    ? { key: domain, account: options.shared.account }
    : findAccount(options.storage, domain)
  if (!account || (!options.shared && !storageKey)) {
    throw new Error(`No acme-dns account for ${domain}`)
  }

  const localServerUrl = account.server_url || options.preferUrl
  const slots = options.shared
    ? planTinyPublishSlots({
        certName: options.certName,
        localAuthZone: options.shared.authZone,
        localServerUrl,
        cnameTargets: options.cnameTargets ?? [],
      })
    : account.subdomain
      ? [{
          subdomain: account.subdomain,
          serverUrl: localServerUrl,
          local: isInProcessAcmeDnsPublish(localServerUrl, account.username),
          authZone: '',
        } satisfies TinyPublishSlot]
      : []

  const subdomains = options.shared
    ? (slots.length
        ? [...new Set(slots.map(slot => slot.subdomain))]
        : mergeSharedPublishSubdomains(
            options.certName,
            options.shared.authZone,
            options.cnameTargets ?? [],
          ))
    : account.subdomain
      ? [account.subdomain]
      : []
  const subdomain = subdomains[0] || (options.shared ? tinyApexLabel(options.certName) : account.subdomain)
  if (!subdomain || !subdomains.length) {
    throw new Error(`No acme-dns subdomain for ${domain}`)
  }

  return {
    serverUrl: localServerUrl,
    username: account.username,
    password: account.password,
    subdomain,
    subdomains,
    slots: slots.length
      ? slots
      : subdomains.map(name => ({
          subdomain: name,
          serverUrl: localServerUrl,
          local: true,
          authZone: options.shared?.authZone || '',
        })),
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

  const domain = options.authzIdentifier
  const challengeName = challengeHost(apexName(domain))
  const cnameTargets = options.shared
    ? await collectChallengeCnameTargets(challengeName, options.shared.authZone)
    : []

  const publish = resolveDns01PublishTarget({
    ...options,
    cnameTargets,
  })

  const slotSummary = publish.slots
    .map(slot => `${slot.subdomain}@${slot.local ? 'local' : slot.serverUrl}`)
    .join(', ')
  logDns01Step(
    options.certName,
    options.shared
      ? `dns-01 ${domain}: publishing TXT to shared acme-dns slot(s) ${slotSummary}`
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
    `Publish TXT ${domain} (${publishPlace})`,
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
    `dns-01 ${domain}: acme-dns accepted TXT ${publish.txt} on ${slotSummary}`,
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
