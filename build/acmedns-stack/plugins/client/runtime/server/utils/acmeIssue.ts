import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import acme from 'acme-client'
import type { LetsEncryptDirectoryMode } from '#shared/types/certs'
import { getSharedModeContext } from '../../../../../server/utils/sharedModeBootstrap'
import { readStorage } from './storage'
import {
  createChallengeSerialGate,
  runDns01Challenge,
  throwIfAborted,
} from './dns01Challenge'
import { resolveAcmeDnsBase } from './acmedns'
import { accountsDir, getLetsEncryptEmail } from './certSettings'
import { writeLivePems } from './letsencryptFs'
import { snapshotCertToLastSaved } from './certLastSaved'
import { logAcmeStep, withAcmeLogContext, configureAcmeHttpRetries } from './acmeLogger'
import { canonicalSans } from '#shared/utils/domains'
import {
  ACME_REQUEST_STEPS,
  ACME_REQUEST_STEP_TOTAL,
  acmeRequestStepLabel,
  type AcmeOrderToken,
  type AcmeRequestStepProgress,
} from '#shared/utils/acmeIssueSteps'

type AcmeClient = InstanceType<typeof acme.Client>
type AcmeAuthorization = Awaited<ReturnType<AcmeClient['getAuthorizations']>>[number]
type AcmeChallenge = AcmeAuthorization['challenges'][number]

interface PendingDns01 {
  domain: string
  token: string
  authz: AcmeAuthorization
  challenge: AcmeChallenge
}

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
  configureAcmeHttpRetries()
  const accountKey = await ensureAccountKey(mode)
  // Challenge / order status polling — keep short so Cancel isn't stuck in backoff.
  const backoffAttempts = (() => {
    const raw = Number(process.env.ACME_BACKOFF_ATTEMPTS ?? 3)
    if (!Number.isFinite(raw)) {
      return 3
    }
    return Math.max(1, Math.min(20, Math.floor(raw)))
  })()
  return new acme.Client({
    directoryUrl: directoryUrl(mode),
    accountKey,
    backoffAttempts,
  })
}

async function ensureAcmeAccount(client: AcmeClient, email: string) {
  try {
    client.getAccountUrl()
  }
  catch {
    await client.createAccount({
      termsOfServiceAgreed: true,
      ...(email ? { contact: [`mailto:${email}`] } : {}),
    })
  }
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
  return new Promise((resolve, reject) => {
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

async function collectPendingDns01(
  client: AcmeClient,
  authorizations: AcmeAuthorization[],
): Promise<PendingDns01[]> {
  const pending: PendingDns01[] = []

  for (const authz of authorizations) {
    const domain = authz.identifier.value
    if (authz.status === 'valid') {
      continue
    }

    const challenge = authz.challenges.find(item => item.type === 'dns-01')
    if (!challenge) {
      throw new Error(`No dns-01 challenge for ${domain}`)
    }

    const token = await client.getChallengeKeyAuthorization(challenge)
    pending.push({ domain, token, authz, challenge })
  }

  pending.sort((a, b) => {
    const order = canonicalSans([a.domain, b.domain])
    return order.indexOf(a.domain) - order.indexOf(b.domain)
  })

  return pending
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

      const reportStep = (
        index: number,
        label?: string,
        orderTokens?: AcmeOrderToken[],
      ) => {
        options.onRequestStep?.({
          index,
          total: ACME_REQUEST_STEP_TOTAL,
          label: label ?? acmeRequestStepLabel(index),
          ...(orderTokens?.length ? { orderTokens } : {}),
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

      await abortable(ensureAcmeAccount(client, email), signal)

      const [key, csr] = await acme.crypto.createCsr({
        commonName: options.altNames.find(n => !n.startsWith('*.')) || options.altNames[0],
        altNames: options.altNames,
      })

      throwIfAborted(signal)

      reportStep(ACME_REQUEST_STEPS.ACME_ORDER)

      const sans = canonicalSans(options.altNames)
      const order = await abortable(
        client.createOrder({
          identifiers: sans.map(value => ({ type: 'dns', value })),
        }),
        signal,
      )
      const authorizations = await abortable(client.getAuthorizations(order), signal)
      const pending = await abortable(collectPendingDns01(client, authorizations), signal)

      const orderTokens: AcmeOrderToken[] = pending.map(item => ({
        domain: item.domain,
        token: item.token,
      }))

      logAcmeStep(
        options.certName,
        `ACME order placed — ${orderTokens.length} dns-01 token(s): ${
          orderTokens.map(item => `${item.domain}→${item.token.slice(0, 12)}…`).join(', ')
          || 'none (already valid)'
        }`,
      )

      reportStep(ACME_REQUEST_STEPS.ACME_ORDER, 'ACME order', orderTokens)

      const challengeSerial = createChallengeSerialGate()

      for (const item of pending) {
        throwIfAborted(signal)
        const turn = await challengeSerial.enter()
        try {
          logAcmeStep(
            options.certName,
            `Starting dns-01 authorization for ${item.domain} (serial queue)`,
          )
          await runDns01Challenge({
            authzIdentifier: item.domain,
            keyAuthorization: item.token,
            certName: options.certName,
            preferUrl,
            shared,
            storage,
            signal,
            reportStep,
          })
          await abortable(client.completeChallenge(item.challenge), signal)
          await abortable(client.waitForValidStatus(item.challenge), signal)
          turn.markCreateFinished()
        }
        catch (error) {
          turn.abort()
          try {
            await client.deactivateAuthorization(item.authz)
          }
          catch {
            // Suppress deactivation errors; rethrow the original failure.
          }
          throw error
        }
        finally {
          // TXT slots expire via txt-ttl; only release the serial gate here.
          turn.markRemove()
        }
      }

      throwIfAborted(signal)

      reportStep(ACME_REQUEST_STEPS.VALIDATE_SAVE, 'Save certificate')

      const finalized = await abortable(client.finalizeOrder(order, csr), signal)
      const certificate = await abortable(client.getCertificate(finalized), signal)

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
