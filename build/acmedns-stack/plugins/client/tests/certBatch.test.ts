import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CERT = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n'
const CHAIN = '-----BEGIN CERTIFICATE-----\nCHAIN\n-----END CERTIFICATE-----\n'
const FULLCHAIN = `${CERT}${CHAIN}`
const KEY = '-----BEGIN PRIVATE KEY-----\nKEY\n-----END PRIVATE KEY-----\n'

const ENV_KEYS = ['ACMEDNS_DATA_ROOT', 'ACMEDNS_LETSENCRYPT_DIR', 'NUXT_ACMEDNS_DATA_ROOT', 'NUXT_ACMEDNS_LETSENCRYPT_DIR'] as const

let tempRoot = ''

beforeEach(async () => {
  tempRoot = mkdtempSync(join(tmpdir(), 'acmedns-cert-batch-'))
  process.env.ACMEDNS_DATA_ROOT = tempRoot
  process.env.ACMEDNS_LETSENCRYPT_DIR = join(tempRoot, 'letsencrypt')

  const { writeLivePems } = await import('../runtime/server/utils/letsencryptFs')
  await writeLivePems('production', 'example.org', {
    cert: CERT,
    chain: CHAIN,
    fullchain: FULLCHAIN,
    privkey: KEY,
  })
  await writeLivePems('production', 'other.org', {
    cert: CERT,
    chain: CHAIN,
    fullchain: FULLCHAIN,
    privkey: KEY,
  })
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key]
  }
  rmSync(tempRoot, { recursive: true, force: true })
})

describe('buildLiveCertsBatchZip', () => {
  test('exports every live cert as cert folders', async () => {
    const { buildLiveCertsBatchZip } = await import('../runtime/server/utils/certDownload')
    const { groupZipCertFolders, parseZipStorePaths } = await import('../runtime/server/utils/zipStore')

    const { buffer, filename, certNames } = await buildLiveCertsBatchZip()
    expect(filename).toBe('live-certificates.zip')
    expect(certNames).toEqual(['example.org', 'other.org'])

    const folders = groupZipCertFolders(parseZipStorePaths(buffer))
    expect(Object.keys(folders).sort()).toEqual(['example.org', 'other.org'])
    expect(folders['example.org']?.['privkey.pem']?.toString('utf8')).toBe(KEY)
  })
})
