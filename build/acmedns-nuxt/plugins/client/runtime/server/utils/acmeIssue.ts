import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import acme from 'acme-client'
import type { LetsEncryptDirectoryMode } from '#shared/types/certs'
import { findAccount } from '#shared/utils/domains'
import { readStorage } from './storage'
import { resolveAcmeDnsBase, updateAcmeDnsTxt } from './acmedns'
import { accountsDir, getLetsEncryptEmail } from './certSettings'
import { writeLivePems } from './letsencryptFs'
import { snapshotCertToLastSaved } from './certLastSaved'
import { logAcmeStep, withAcmeLogContext } from './acmeLogger'

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
}) {
  return withAcmeLogContext(
    { certName: options.certName, mode: options.mode },
    async (rateLimitSignal) => {
      const signal = combineSignals(options.signal, rateLimitSignal)
      throwIfAborted(signal)

      const preferUrl = resolveAcmeDnsBase()
      const storage = await readStorage()
      const client = await createAcmeClient(options.mode)
      const email = getLetsEncryptEmail()
      const directory = directoryUrl(options.mode)

      logAcmeStep(
        options.certName,
        `Starting dns-01 (${options.mode}) — ${options.altNames.join(', ')}`,
      )
      logAcmeStep(options.certName, `Let's Encrypt directory: ${directory}`)

      const [key, csr] = await acme.crypto.createCsr({
        commonName: options.altNames.find(n => !n.startsWith('*.')) || options.altNames[0],
        altNames: options.altNames,
      })

      throwIfAborted(signal)

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
            const { key: storageKey, account } = findAccount(storage, domain, preferUrl)
            if (!account || !storageKey) {
              throw new Error(`No acme-dns account for ${domain}`)
            }

            logAcmeStep(
              options.certName,
              `Publishing dns-01 TXT for ${domain} via acme-dns (${account.subdomain})`,
            )

            await updateAcmeDnsTxt({
              serverUrl: account.server_url || preferUrl,
              username: account.username,
              password: account.password,
              subdomain: account.subdomain,
              txt: keyAuthorization,
            })

            throwIfAborted(signal)

            logAcmeStep(
              options.certName,
              `acme-dns TXT published for ${domain}; waiting for Let's Encrypt validation`,
            )
          },
          challengeRemoveFn: async () => {
            // acme-dns keeps a rolling TXT window; no delete API required
          },
        }),
        signal,
      )

      throwIfAborted(signal)

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
