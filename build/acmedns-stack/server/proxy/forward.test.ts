import { afterEach, describe, expect, test } from 'bun:test'
import {
  DEFAULT_PROXY_UPSTREAM_TIMEOUT_MS,
  proxyUpstreamTimeoutMs,
  sanitizeUpstreamResponseHeaders,
} from './forward'

const ENV = 'PROXY_UPSTREAM_TIMEOUT_MS'

afterEach(() => {
  delete process.env[ENV]
})

describe('proxyUpstreamTimeoutMs', () => {
  test('defaults to 60s', () => {
    expect(proxyUpstreamTimeoutMs()).toBe(DEFAULT_PROXY_UPSTREAM_TIMEOUT_MS)
  })

  test('reads env and allows 0 to disable', () => {
    process.env[ENV] = '15000'
    expect(proxyUpstreamTimeoutMs()).toBe(15_000)
    process.env[ENV] = '0'
    expect(proxyUpstreamTimeoutMs()).toBe(0)
  })
})

describe('sanitizeUpstreamResponseHeaders', () => {
  test('strips hop-by-hop headers', () => {
    const headers = new Headers({
      'content-type': 'text/html',
      connection: 'keep-alive',
      'transfer-encoding': 'chunked',
      'x-app': 'ok',
    })
    const out = sanitizeUpstreamResponseHeaders(headers)
    expect(out.get('content-type')).toBe('text/html')
    expect(out.get('x-app')).toBe('ok')
    expect(out.get('connection')).toBeNull()
    expect(out.get('transfer-encoding')).toBeNull()
  })
})
