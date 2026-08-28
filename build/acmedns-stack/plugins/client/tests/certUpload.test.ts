import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createZipStore } from '../runtime/server/utils/zipStore'

const CERT = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n'
const CHAIN = '-----BEGIN CERTIFICATE-----\nCHAIN\n-----END CERTIFICATE-----\n'
const FULLCHAIN = `${CERT}${CHAIN}`
const KEY = '-----BEGIN PRIVATE KEY-----\nKEY\n-----END PRIVATE KEY-----\n'

const ENV_KEYS = ['ACMEDNS_DATA_ROOT', 'ACMEDNS_LETSENCRYPT_DIR', 'NUXT_ACMEDNS_DATA_ROOT', 'NUXT_ACMEDNS_LETSENCRYPT_DIR'] as const

let tempRoot = ''

mock.module('../runtime/server/utils/certLastSaved', () => ({
  snapshotCertToLastSaved: async () => {},
}))

function makeZip(certName = 'example.org') {
  return createZipStore({
    'cert.pem': CERT,
    'chain.pem': CHAIN,
    'fullchain.pem': FULLCHAIN,
    'privkey.pem': KEY,
  })
}

function makeBatchZip(certNames: string[]) {
  const files: Record<string, string> = {}
  for (const certName of certNames) {
    files[`${certName}/cert.pem`] = CERT
    files[`${certName}/chain.pem`] = CHAIN
    files[`${certName}/fullchain.pem`] = FULLCHAIN
    files[`${certName}/privkey.pem`] = KEY
  }
  return createZipStore(files)
}

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'acmedns-cert-upload-'))
  process.env.ACMEDNS_DATA_ROOT = tempRoot
  process.env.ACMEDNS_LETSENCRYPT_DIR = join(tempRoot, 'letsencrypt')
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key]
  }
  rmSync(tempRoot, { recursive: true, force: true })
})

describe('importLiveCertZip', () => {
  test('imports PEMs into live/', async () => {
    const { importLiveCertZip } = await import('../runtime/server/utils/certUpload')
    const { readPem } = await import('../runtime/server/utils/letsencryptFs')

    const result = await importLiveCertZip('example.org', makeZip())
    expect(result).toMatchObject({ success: true })

    const privkey = await readPem(join(tempRoot, 'letsencrypt/live/example.org/privkey.pem'))
    expect(privkey).toBe(KEY)
  })

  test('requires overwrite when live cert already exists', async () => {
    const { importLiveCertZip } = await import('../runtime/server/utils/certUpload')

    await importLiveCertZip('example.org', makeZip())

    const blocked = await importLiveCertZip('example.org', makeZip())
    expect(blocked).toMatchObject({
      success: false,
      needsOverwrite: true,
    })

    const replaced = await importLiveCertZip('example.org', makeZip(), { overwrite: true })
    expect(replaced).toMatchObject({ success: true })
  })

  test('imports multiple cert folders from batch zip', async () => {
    const { importLiveCertsBatchZip } = await import('../runtime/server/utils/certUpload')
    const { readPem } = await import('../runtime/server/utils/letsencryptFs')

    const result = await importLiveCertsBatchZip(makeBatchZip(['example.org', 'other.org']))
    expect(result).toMatchObject({
      success: true,
      imported: ['example.org', 'other.org'],
    })

    const other = await readPem(join(tempRoot, 'letsencrypt/live/other.org/privkey.pem'))
    expect(other).toBe(KEY)
  })

  test('previews conflicts and new certs', async () => {
    const { importLiveCertZip, previewLiveCertsBatchZip } = await import('../runtime/server/utils/certUpload')

    await importLiveCertZip('example.org', makeZip())

    const preview = await previewLiveCertsBatchZip(makeBatchZip(['example.org', 'other.org']))
    expect(preview).toEqual({
      certNames: ['example.org', 'other.org'],
      conflicts: ['example.org'],
      newCerts: ['other.org'],
    })
  })

  test('imports only selected overwrites from batch zip', async () => {
    const { importLiveCertsBatchZip } = await import('../runtime/server/utils/certUpload')
    const { readPem, writeLivePems } = await import('../runtime/server/utils/letsencryptFs')

    await writeLivePems('production', 'example.org', {
      cert: CERT,
      chain: CHAIN,
      fullchain: FULLCHAIN,
      privkey: '-----BEGIN PRIVATE KEY-----\nOLD\n-----END PRIVATE KEY-----\n',
    })
    await writeLivePems('production', 'keep.org', {
      cert: CERT,
      chain: CHAIN,
      fullchain: FULLCHAIN,
      privkey: '-----BEGIN PRIVATE KEY-----\nKEEP\n-----END PRIVATE KEY-----\n',
    })

    const result = await importLiveCertsBatchZip(makeBatchZip(['example.org', 'keep.org', 'other.org']), {
      overwrite: ['example.org'],
    })

    expect(result).toMatchObject({
      success: true,
      imported: ['example.org', 'other.org'],
      skipped: ['keep.org'],
    })

    const kept = await readPem(join(tempRoot, 'letsencrypt/live/keep.org/privkey.pem'))
    expect(kept).toContain('KEEP')
  })
})
