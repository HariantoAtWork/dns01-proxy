import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import acme from 'acme-client'
import type { LetsEncryptDirectoryMode } from '#shared/types/certs'
import { getSharedModeContext } from '../../../../../server/utils/sharedModeBootstrap'
import { readStorage } from './storage'
import {
  abortableDelay,
  createChallengeSerialGate,
  runDns01Challenge,
  throwIfAborted,
} from './dns01Challenge'
import { resolveAcmeDnsBase } from './acmedns'
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
            // TXT slots expire via txt-ttl; only release the serial gate here.
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
