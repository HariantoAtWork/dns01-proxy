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

function makeZip() {
  return createZipStore({
    'cert.pem': CERT,
    'chain.pem': CHAIN,
    'fullchain.pem': FULLCHAIN,
    'privkey.pem': KEY,
  })
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
})
