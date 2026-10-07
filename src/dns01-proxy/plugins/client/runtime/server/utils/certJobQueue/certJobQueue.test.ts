import { createError } from 'h3'

Object.assign(globalThis, { createError })

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { CertApplyResult } from '#shared/types/certs'
import {
  cancelCertJob,
  continueCertJob,
  getCertJobQueueSnapshot,
  rerunCertJob,
} from '../certJobQueue'
import {
  allocateJobId,
  cancelled,
  noopReject,
  noopResolve,
  setPumping,
  setRunning,
  type InternalJob,
  waiting,
} from './state'

const SAMPLE_LINE = {
  line: 1,
  names: ['example.test'],
  certName: 'example.test',
  expanded: ['example.test'],
  raw: 'example.test',
}

const domainsOk = {
  ok: true as const,
  text: 'example.test',
  lines: [SAMPLE_LINE],
  errors: [],
}

mock.module('../certActivity', () => ({
  appendCertActivity: () => {},
}))

mock.module('../certLiveBus', () => ({
  publishCertLive: () => {},
}))

mock.module('../certLivePublish', () => ({
  buildCertLiveStatus: async () => ({ certs: [] }),
}))

mock.module('../certSettings', () => ({
  isAcmeEnabledForMode: () => true,
}))

mock.module('../domainsFile', () => ({
  readDomainsFile: async () => domainsOk,
}))

mock.module('../certStatus', () => ({
  readCertMeta: async () => null,
  buildCertStatus: async () => [],
  needsRenewal: () => true,
}))

mock.module('../acmeLogger', () => ({
  clearRateLimitAfterSuccess: async () => {},
}))

mock.module('../enrichLeDnsError', () => ({
  enrichLetsEncryptDnsError: async (message: string) => message,
}))

mock.module('./preflight', () => ({
  dnsPreflightForLine: async () => ({ ok: true, message: '', checks: [] }),
  rateLimitSkipMessage: (limit: { until: string }) =>
    `Skipped — Let's Encrypt rate limited until ${new Date(limit.until).toLocaleString()}`,
  formatDnsPreflightFailure: () => 'DNS preflight failed',
}))

function makeJob(overrides: Partial<InternalJob> = {}): InternalJob {
  return {
    id: allocateJobId(),
    source: 'apply',
    mode: 'staging',
    status: 'queued',
    createdAt: new Date().toISOString(),
    resolve: noopResolve,
    reject: noopReject,
    ...overrides,
  }
}

function expectHttpError(fn: () => unknown, statusCode: number) {
  try {
    fn()
    throw new Error('expected createError')
  }
  catch (error) {
    expect((error as { statusCode?: number }).statusCode).toBe(statusCode)
  }
}

beforeEach(() => {
  waiting.splice(0)
  cancelled.splice(0)
  setRunning(null)
  setPumping(false)
})

afterEach(() => {
  waiting.splice(0)
  cancelled.splice(0)
  setRunning(null)
  setPumping(false)
})

describe('certJobQueue cancel and resume', () => {
  test('cancelCertJob removes queued job into cancelled list', () => {
    const job = makeJob()
    waiting.push(job)

    const publicJob = cancelCertJob(job.id)

    expect(publicJob.status).toBe('cancelled')
    expect(waiting).toHaveLength(0)
    expect(cancelled.map(j => j.id)).toContain(job.id)
  })

  test('cancelCertJob marks running job as cancel requested', () => {
    const abortController = new AbortController()
    const job = makeJob({
      status: 'running',
      abortController,
    })
    setRunning(job)

    const publicJob = cancelCertJob(job.id)

    expect(publicJob.cancelRequested).toBe(true)
    expect(job.cancelRequested).toBe(true)
    expect(abortController.signal.aborted).toBe(true)
  })

  test('cancelCertJob rejects already cancelled job', () => {
    const job = makeJob({ status: 'cancelled' })
    cancelled.push(job)
    expectHttpError(() => cancelCertJob(job.id), 409)
  })

  test('continueCertJob requeues cancelled job and keeps prior results', () => {
    const prior: CertApplyResult[] = [{
      certName: 'example.test',
      ok: true,
      message: 'Issued',
    }]
    const job = makeJob({
      status: 'cancelled',
      finishedAt: new Date().toISOString(),
      results: prior,
    })
    cancelled.push(job)

    const publicJob = continueCertJob(job.id)

    expect(['queued', 'running']).toContain(publicJob.status)
    expect(job.results).toEqual(prior)
    expect(getCertJobQueueSnapshot().cancelled).toHaveLength(0)
  })

  test('continueCertJob rejects when nothing was completed', () => {
    const job = makeJob({ status: 'cancelled', results: [] })
    cancelled.push(job)
    expectHttpError(() => continueCertJob(job.id), 409)
  })

  test('rerunCertJob clears results before requeue', () => {
    const job = makeJob({
      status: 'cancelled',
      results: [{
        certName: 'example.test',
        ok: true,
        message: 'Issued',
      }],
    })
    cancelled.push(job)

    const publicJob = rerunCertJob(job.id)

    expect(['queued', 'running']).toContain(publicJob.status)
    expect(job.results).toBeUndefined()
  })
})
