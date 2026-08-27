import { createError } from 'h3'

Object.assign(globalThis, { createError })

import { describe, expect, mock, test } from 'bun:test'
import type { CertRateLimit } from '#shared/types/certs'

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
  rateLimitSkipMessage: (limit: CertRateLimit) =>
    `Skipped — Let's Encrypt rate limited until ${new Date(limit.until).toLocaleString()}`,
  formatDnsPreflightFailure: () => 'DNS preflight failed',
}))

describe('executeApplyCertificates rate limits', () => {
  test('skips rate-limited cert without force', async () => {
    const activeLimit: CertRateLimit = {
      id: 'staging:cert:example.test',
      mode: 'staging',
      scope: 'cert',
      certName: 'example.test',
      until: new Date(Date.now() + 60_000).toISOString(),
      retryAfterSeconds: 60,
      at: new Date().toISOString(),
      detail: 'test rate limit',
    }

    mock.module('../domainsFile', () => ({
      readDomainsFile: async () => domainsOk,
    }))

    mock.module('../certRateLimit', () => ({
      getCertRateLimits: async () => [activeLimit],
      rateLimitForCert: () => activeLimit,
    }))

    mock.module('../acmeIssue', () => ({
      issueCertificate: async () => {
        throw new Error('issueCertificate should not run when rate limited')
      },
    }))

    const { executeApplyCertificates } = await import('./executor')

    const { results, cancelled: wasCancelled } = await executeApplyCertificates({
      mode: 'staging',
      source: 'apply',
      jobId: 42,
      abortSignal: new AbortController().signal,
      onProgress: () => {},
      shouldCancel: () => false,
    })

    expect(wasCancelled).toBe(false)
    expect(results).toHaveLength(1)
    expect(results[0]?.ok).toBe(false)
    expect(results[0]?.message).toContain('rate limited')
  })

  test('continues after ACME rate-limit error on one cert', async () => {
    const lines = [
      SAMPLE_LINE,
      {
        line: 2,
        names: ['other.test'],
        certName: 'other.test',
        expanded: ['other.test'],
        raw: 'other.test',
      },
    ]

    mock.module('../domainsFile', () => ({
      readDomainsFile: async () => ({
        ...domainsOk,
        lines,
        text: 'example.test\nother.test',
      }),
    }))

    mock.module('../certRateLimit', () => ({
      getCertRateLimits: async () => [],
      rateLimitForCert: () => undefined,
    }))

    const issueCertificate = mock(async ({ certName }: { certName: string }) => {
      if (certName === 'example.test') {
        const error = Object.assign(new Error('429 rate limited'), { rateLimited: true })
        throw error
      }
    })

    mock.module('../acmeIssue', () => ({
      issueCertificate,
    }))

    const { executeApplyCertificates } = await import('./executor')

    const { results, cancelled: wasCancelled } = await executeApplyCertificates({
      mode: 'staging',
      source: 'apply',
      jobId: 43,
      abortSignal: new AbortController().signal,
      onProgress: () => {},
      shouldCancel: () => false,
    })

    expect(wasCancelled).toBe(false)
    expect(results).toHaveLength(2)
    expect(results[0]?.ok).toBe(false)
    expect(results[0]?.message).toContain('rate limit')
    expect(results[1]?.ok).toBe(true)
    expect(issueCertificate).toHaveBeenCalledTimes(2)
  })
})
