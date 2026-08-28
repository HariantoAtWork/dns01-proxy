import { describe, expect, test } from 'bun:test'
import type { CertJobQueueItem } from '../runtime/shared/types/certs'
import {
  certBatchSummaryFilename,
  certBatchSummaryHeadline,
  certBatchSummaryStats,
  resolveCertBatchSummaryStatus,
} from '../runtime/shared/utils/certBatchSummary'

describe('certBatchSummary', () => {
  test('builds changelog-style summary filenames', () => {
    expect(certBatchSummaryFilename('2026-08-29T00:49:52.123Z', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'))
      .toBe('2026-08-29T00-49-52.123Z-a1b2c3d4.json')
  })

  test('counts task outcomes', () => {
    expect(certBatchSummaryStats([
      { id: '1', certName: 'a.test', status: 'done' },
      { id: '2', certName: 'b.test', status: 'failed' },
      { id: '3', certName: 'c.test', status: 'skipped' },
    ])).toEqual({
      done: 1,
      failed: 1,
      skipped: 1,
      pending: 0,
      total: 3,
    })
  })

  test('builds a readable headline', () => {
    expect(certBatchSummaryHeadline({
      id: 'summary-1',
      executedAt: '2026-08-29T00:00:00.000Z',
      jobId: 7,
      source: 'apply',
      mode: 'staging',
      status: 'completed',
      tasks: [
        { id: '1', certName: 'a.test', status: 'done' },
        { id: '2', certName: 'b.test', status: 'skipped' },
      ],
    })).toBe('1 ok · 1 skipped')
  })

  test('resolves cancelled and failed batch status', () => {
    const base: CertJobQueueItem = {
      id: 3,
      source: 'apply',
      mode: 'production',
      status: 'running',
      createdAt: '2026-08-29T00:00:00.000Z',
      tasks: [{ id: '1', certName: 'a.test', status: 'failed' }],
    }

    expect(resolveCertBatchSummaryStatus({ ...base, cancelRequested: true }, false)).toBe('cancelled')
    expect(resolveCertBatchSummaryStatus(base, true)).toBe('cancelled')
    expect(resolveCertBatchSummaryStatus(base, false)).toBe('failed')
    expect(resolveCertBatchSummaryStatus({
      ...base,
      tasks: [{ id: '1', certName: 'a.test', status: 'done' }],
    }, false)).toBe('completed')
  })
})
