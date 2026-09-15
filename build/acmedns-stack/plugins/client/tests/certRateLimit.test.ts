import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  initCertRateLimits,
  recordCertRateLimit,
  resetCertRateLimitsForTests,
} from '../runtime/server/utils/certRateLimit'

const dirs: string[] = []
let savedDataRoot: string | undefined

afterEach(async () => {
  resetCertRateLimitsForTests()
  if (savedDataRoot === undefined) {
    delete process.env.ACMEDNS_DATA_ROOT
  }
  else {
    process.env.ACMEDNS_DATA_ROOT = savedDataRoot
  }
  for (const dir of dirs.splice(0)) {
    await rm(dir, { recursive: true, force: true })
  }
})

async function withClientDataRoot() {
  savedDataRoot = process.env.ACMEDNS_DATA_ROOT
  const root = await mkdtemp(join(tmpdir(), 'acmedns-rate-'))
  dirs.push(root)
  process.env.ACMEDNS_DATA_ROOT = root
  await mkdir(join(root, 'client'), { recursive: true })
  resetCertRateLimitsForTests()
  await initCertRateLimits()
  return root
}

describe('recordCertRateLimit', () => {
  test('keeps the first active cooldown instead of stacking later retries', async () => {
    const root = await withClientDataRoot()

    const first = await recordCertRateLimit({
      mode: 'staging',
      certName: 'mdstn.com',
      retryAfterSeconds: 120,
      endpoint: 'https://example.test/acme/authz/1',
      detail: 'first',
    })
    const second = await recordCertRateLimit({
      mode: 'staging',
      certName: 'mdstn.com',
      retryAfterSeconds: 3600,
      endpoint: 'https://example.test/acme/authz/1',
      detail: 'second should not win',
    })

    expect(second.until).toBe(first.until)
    expect(second.detail).toBe('first')
    expect(second.retryAfterSeconds).toBe(120)

    const path = join(root, 'client', 'cert-rate-limits.json')
    const stored = JSON.parse(await readFile(path, 'utf-8')) as { limits: Array<{ until: string }> }
    expect(stored.limits).toHaveLength(1)
    expect(stored.limits[0]?.until).toBe(first.until)
  })
})
