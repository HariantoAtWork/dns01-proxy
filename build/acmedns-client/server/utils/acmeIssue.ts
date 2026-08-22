import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import acme from 'acme-client'
import type { LetsEncryptDirectoryMode } from '#shared/types/certs'
import { findAccount } from '#shared/utils/domains'
import { readStorage } from './storage'
import { resolveAcmeDnsBase, updateAcmeDnsTxt } from './acmedns'
import { accountsDir, getLetsEncryptEmail } from './certSettings'
import { writeLivePems } from './letsencryptFs'

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

export async function issueCertificate(options: {
  mode: LetsEncryptDirectoryMode
  certName: string
  altNames: string[]
}) {
  const preferUrl = resolveAcmeDnsBase()
  const storage = await readStorage()
  const client = await createAcmeClient(options.mode)
  const email = getLetsEncryptEmail()

  const [key, csr] = await acme.crypto.createCsr({
    commonName: options.altNames.find(n => !n.startsWith('*.')) || options.altNames[0],
    altNames: options.altNames,
  })

  const certificate = await client.auto({
    csr,
    email,
    termsOfServiceAgreed: true,
    challengePriority: ['dns-01'],
    skipChallengeVerification: true,
    challengeCreateFn: async (authz, challenge, keyAuthorization) => {
      if (challenge.type !== 'dns-01') {
        throw new Error(`Unsupported challenge type: ${challenge.type}`)
      }
      const domain = authz.identifier.value
      const { key: storageKey, account } = findAccount(storage, domain, preferUrl)
      if (!account || !storageKey) {
        throw new Error(`No acme-dns account for ${domain}`)
      }
      await updateAcmeDnsTxt({
        serverUrl: account.server_url || preferUrl,
        username: account.username,
        password: account.password,
        subdomain: account.subdomain,
        txt: keyAuthorization,
      })
    },
    challengeRemoveFn: async () => {
      // acme-dns keeps a rolling TXT window; no delete API required
    },
  })

  const { cert, chain, fullchain } = splitChain(certificate.toString())
  await writeLivePems(options.mode, options.certName, {
    cert,
    chain,
    fullchain,
    privkey: key.toString(),
  })

  return { fullchain, certName: options.certName }
}
