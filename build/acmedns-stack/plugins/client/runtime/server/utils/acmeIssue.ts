import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import acme from 'acme-client'
import type { LetsEncryptDirectoryMode } from '#shared/types/certs'
import { findAccount, apexName } from '#shared/utils/domains'
import { challengeHost } from '#shared/utils/challengeDns'
import { tinyApexLabel } from '#shared/utils/tinyModeDns'
import { getSharedModeContext } from '../../../../../server/utils/sharedModeBootstrap'
import { readStorage } from './storage'
import { resolveAcmeDnsBase, updateAcmeDnsTxt } from './acmedns'
import { acmeTxtSettleMs, waitForChallengeTxtOnline } from './challengeTxtOnline'
import { accountsDir, getLetsEncryptEmail } from './certSettings'
import { writeLivePems } from './letsencryptFs'
import { snapshotCertToLastSaved } from './certLastSaved'
import { logAcmeStep, withAcmeLogContext } from './acmeLogger'
import {
  ACME_REQUEST_STEPS,
  ACME_REQUEST_STEP_TOTAL,
  acmeRequestStepLabel,
  type AcmeRequestStepProgress,
} from '#shared/utils/acmeIssueSteps'

type AcmeClient = InstanceType<typeof acme.Client>

async function ensureAccountKey(mode: LetsEncryptDirectoryMode) {
  const dir = join(accountsDir(), mode)
  await fs.mkdir(dir, { recursive: true })
  const keyPath = join(dir, 'account.pem')
  try {
    return await fs.readFile(keyPath, 'utf-8')
  }
  catch {
    const key = await acme.crypto.createPrivateKey()
    await fs.writeFile(keyPath, key.toString(), { mode: 0o600 })
    return key.toString()
  }
}

function directoryUrl(mode: LetsEncryptDirectoryMode) {
  return mode === 'staging'
    ? acme.directory.letsencrypt.staging
    : acme.directory.letsencrypt.production
}

export async function createAcmeClient(mode: LetsEncryptDirectoryMode): Promise<AcmeClient> {
  const accountKey = await ensureAccountKey(mode)
  return new acme.Client({
    directoryUrl: directoryUrl(mode),
    accountKey,
  })
}

function splitChain(pemBundle: string) {
  const parts = pemBundle
    .split(/(?=-----BEGIN CERTIFICATE-----)/)
    .map(p => p.trim())
    .filter(p => p.includes('BEGIN CERTIFICATE'))
  const cert = parts[0] || ''
  const chain = parts.slice(1).join('\n')
  const fullchain = parts.join('\n')
  return { cert, chain, fullchain }
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) {
    return
  }
  const reason = signal.reason
  if (reason instanceof Error) {
    throw reason
  }
  const err = new Error(typeof reason === 'string' ? reason : 'ACME aborted')
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

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise
  }
  throwIfAborted(signal)
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      try {
        throwIfAborted(signal)
      }
      catch (error) {
        reject(error)
      }
    }
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
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

async function runDns01Challenge(options: {
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

  logAcmeStep(
    options.certName,
    options.shared
      ? `Publishing dns-01 TXT for ${domain} via shared acme-dns (${subdomain})`
      : `Publishing dns-01 TXT for ${domain} via acme-dns (${subdomain})`,
  )

  options.reportStep(ACME_REQUEST_STEPS.PUBLISH_TXT, `Publish TXT ${domain}`)

  await updateAcmeDnsTxt({
    serverUrl: account.server_url || options.preferUrl,
    username: account.username,
    password: account.password,
    subdomain,
    txt: options.keyAuthorization,
  })

  throwIfAborted(options.signal)

  const challengeName = challengeHost(apexName(domain))
  await waitForChallengeTxtOnline({
    challengeName,
    expectedTxt: options.keyAuthorization,
    certName: options.certName,
    signal: options.signal,
  })

  options.reportStep(ACME_REQUEST_STEPS.TXT_ONLINE, `TXT online ${domain}`)

  const settleMs = acmeTxtSettleMs()
  if (settleMs > 0) {
    const settleSeconds = Math.max(1, Math.round(settleMs / 1000))
    options.reportStep(ACME_REQUEST_STEPS.DNS_SETTLE, `DNS settle ${domain}`)
    logAcmeStep(
      options.certName,
      `dns-01 TXT visible for ${domain}; waiting ${settleSeconds}s before LE validate`,
    )
    await abortableDelay(settleMs, options.signal)
  }

  logAcmeStep(
    options.certName,
    `dns-01 TXT ready for ${domain}; telling Let's Encrypt to validate`,
  )

  options.reportStep(ACME_REQUEST_STEPS.VALIDATE_SAVE, `LE validate ${domain}`)
}

export async function issueCertificate(options: {
  mode: LetsEncryptDirectoryMode
  certName: string
  altNames: string[]
  signal?: AbortSignal
  onRequestStep?: (step: AcmeRequestStepProgress) => void
}) {
  return withAcmeLogContext(
    { certName: options.certName, mode: options.mode },
    async (rateLimitSignal) => {
      const signal = combineSignals(options.signal, rateLimitSignal)
      throwIfAborted(signal)

      const reportStep = (index: number, label?: string) => {
        options.onRequestStep?.({
          index,
          total: ACME_REQUEST_STEP_TOTAL,
          label: label ?? acmeRequestStepLabel(index),
        })
      }

      const preferUrl = resolveAcmeDnsBase()
      const storage = await readStorage()
      const shared = getSharedModeContext()
      const client = await createAcmeClient(options.mode)
      const email = getLetsEncryptEmail()
      const directory = directoryUrl(options.mode)

      logAcmeStep(
        options.certName,
        `Starting dns-01 — ${options.altNames.join(', ')}`,
      )
      logAcmeStep(options.certName, `Let's Encrypt directory: ${directory}`)

      const [key, csr] = await acme.crypto.createCsr({
        commonName: options.altNames.find(n => !n.startsWith('*.')) || options.altNames[0],
        altNames: options.altNames,
      })

      throwIfAborted(signal)

      reportStep(ACME_REQUEST_STEPS.ACME_ORDER)

      const challengeSerial = createChallengeSerialGate()
      let activeChallengeTurn: Awaited<ReturnType<typeof challengeSerial.enter>> | undefined

      const certificate = await abortable(
        client.auto({
          csr,
          email,
          termsOfServiceAgreed: true,
          challengePriority: ['dns-01'],
          skipChallengeVerification: true,
          challengeCreateFn: async (authz, challenge, keyAuthorization) => {
            throwIfAborted(signal)
            if (challenge.type !== 'dns-01') {
              throw new Error(`Unsupported challenge type: ${challenge.type}`)
            }

            const domain = authz.identifier.value
            activeChallengeTurn = await challengeSerial.enter()
            try {
              logAcmeStep(
                options.certName,
                `Starting dns-01 authorization for ${domain} (serial queue)`,
              )
              await runDns01Challenge({
                authzIdentifier: domain,
                keyAuthorization,
                certName: options.certName,
                preferUrl,
                shared,
                storage,
                signal,
                reportStep,
              })
            }
            catch (error) {
              activeChallengeTurn.abort()
              activeChallengeTurn = undefined
              throw error
            }
            activeChallengeTurn.markCreateFinished()
          },
          challengeRemoveFn: async () => {
            activeChallengeTurn?.markRemove()
            activeChallengeTurn = undefined
          },
        }),
        signal,
      )

      throwIfAborted(signal)

      reportStep(ACME_REQUEST_STEPS.VALIDATE_SAVE, 'Save certificate')

      const { cert, chain, fullchain } = splitChain(certificate.toString())
      const tree = options.mode === 'staging' ? 'staging' : 'live'
      await snapshotCertToLastSaved(options.mode, options.certName)
      await writeLivePems(options.mode, options.certName, {
        cert,
        chain,
        fullchain,
        privkey: key.toString(),
      })

      logAcmeStep(
        options.certName,
        `Certificate saved to ${tree}/${options.certName}/fullchain.pem`,
      )

      return { fullchain, certName: options.certName }
    },
  )
}

function combineSignals(...signals: Array<AbortSignal | undefined>) {
  const list = signals.filter((s): s is AbortSignal => Boolean(s))
  if (!list.length) {
    return undefined
  }
  if (list.length === 1) {
    return list[0]
  }
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any(list)
  }
  return list[0]
}
