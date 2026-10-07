import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  CERT_BATCH_SUMMARY_FILE_RE,
  certBatchSummaryFilename,
} from '../runtime/shared/utils/certBatchSummary'
import {
  clearCertJobSummaries,
  deleteCertJobSummary,
  initCertJobSummaries,
  listCertJobSummaries,
  persistCertJobSummary,
  resetCertJobSummariesCache,
} from '../runtime/server/utils/certJobSummaries'
import type { InternalJob } from '../runtime/server/utils/certJobQueue/state'

let tempRoot = ''
let savedDataRoot: string | undefined

function makeJob(overrides: Partial<InternalJob> = {}): InternalJob {
  return {
    id: 7,
    source: 'apply',
    mode: 'staging',
    status: 'completed',
    createdAt: '2026-08-29T00:00:00.000Z',
    finishedAt: '2026-08-29T00:49:52.123Z',
    taskTotal: 1,
    tasks: [{ id: 'task-1', certName: 'a.test', status: 'done' }],
    resolve: () => {},
    reject: () => {},
    ...overrides,
  }
}

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'acmedns-job-summaries-'))
  mkdirSync(join(tempRoot, 'client'), { recursive: true })
  savedDataRoot = process.env.ACMEDNS_DATA_ROOT
  process.env.ACMEDNS_DATA_ROOT = tempRoot
  resetCertJobSummariesCache()
})

afterEach(() => {
  if (savedDataRoot === undefined) {
    delete process.env.ACMEDNS_DATA_ROOT
  }
  else {
    process.env.ACMEDNS_DATA_ROOT = savedDataRoot
  }
  resetCertJobSummariesCache()
  rmSync(tempRoot, { recursive: true, force: true })
})

describe('certJobSummaries', () => {
  test('accepts only changelog-style filenames', () => {
    expect(CERT_BATCH_SUMMARY_FILE_RE.test('2026-08-29T00-49-52.123Z-a1b2c3d4.json')).toBe(true)
    expect(CERT_BATCH_SUMMARY_FILE_RE.test('../secrets.json')).toBe(false)
    expect(CERT_BATCH_SUMMARY_FILE_RE.test('job-1.json')).toBe(false)
  })

  test('persists, lists, deletes, and clears summaries', async () => {
    await persistCertJobSummary(makeJob(), false)
    await initCertJobSummaries()

    const listed = await listCertJobSummaries()
    expect(listed).toHaveLength(1)
    expect(listed[0]?.jobId).toBe(7)
    expect(listed[0]?.filename).toBe(
      certBatchSummaryFilename('2026-08-29T00:49:52.123Z', listed[0]!.id),
    )

    const deleted = await deleteCertJobSummary(listed[0]!.id)
    expect(deleted).toBe(true)
    expect(await listCertJobSummaries()).toHaveLength(0)

    await persistCertJobSummary(makeJob({ id: 8 }), false)
    await persistCertJobSummary(makeJob({ id: 9 }), false)
    expect(await listCertJobSummaries()).toHaveLength(2)

    const removed = await clearCertJobSummaries()
    expect(removed).toBe(2)
    expect(await listCertJobSummaries()).toHaveLength(0)
  })

  test('skips delete-on-cancel jobs', async () => {
    await persistCertJobSummary(makeJob({ deleteOnCancel: true }), true)
    expect(await listCertJobSummaries()).toHaveLength(0)
  })
})
