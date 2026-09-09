import { afterEach, describe, expect, test } from 'bun:test'
import {
  DEFAULT_PROXY_UPSTREAM_TIMEOUT_MS,
  formatProxyUpstreamContext,
  proxyUpstreamTimeoutMs,
  sanitizeUpstreamResponseHeaders,
  validateForwardTarget,
} from './forward'
import type { RouteMatch } from './routeTable'

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
  test('strips hop-by-hop and length; keeps content-encoding', () => {
    const headers = new Headers({
      'content-type': 'text/html',
      'content-encoding': 'gzip',
      'content-length': '123',
      connection: 'keep-alive',
      'transfer-encoding': 'chunked',
      'x-app': 'ok',
    })
    const out = sanitizeUpstreamResponseHeaders(headers)
    expect(out.get('content-type')).toBe('text/html')
    expect(out.get('content-encoding')).toBe('gzip')
    expect(out.get('x-app')).toBe('ok')
    expect(out.get('connection')).toBeNull()
    expect(out.get('transfer-encoding')).toBeNull()
    expect(out.get('content-length')).toBeNull()
  })
})

describe('validateForwardTarget', () => {
  test('accepts a normal host', () => {
    expect(validateForwardTarget({ scheme: 'http', host: '10.0.0.5', port: 8080 })).toBeNull()
  })

  test('rejects empty host, scheme-in-host, and bad port', () => {
    expect(validateForwardTarget({ scheme: 'http', host: '', port: 80 })).toBe(
      'forward host is empty',
    )
    expect(validateForwardTarget({ scheme: 'http', host: 'http://10.0.0.5', port: 80 })).toContain(
      'scheme',
    )
    expect(validateForwardTarget({ scheme: 'http', host: 'app', port: 0 })).toContain('port')
  })
})

describe('formatProxyUpstreamContext', () => {
  test('includes id, inbound host, and target fields', () => {
    const match = {
      host: {
        id: 'abc',
        domainNames: ['app.example.com'],
        forwardScheme: 'http',
        forwardHost: '',
        forwardPort: 80,
        cachingEnabled: false,
        blockExploits: false,
        allowWebsocketUpgrade: false,
        locations: [],
        sslForced: false,
        http2Support: false,
        hstsEnabled: false,
        hstsSubdomains: false,
        trustForwardedProto: false,
        advancedConfig: '',
        enabled: true,
      },
      location: null,
    } satisfies RouteMatch
    const req = new Request('https://app.example.com/', {
      headers: { host: 'app.example.com' },
    })
    const line = formatProxyUpstreamContext(
      match,
      req,
      new URL('https://app.example.com/'),
      { scheme: 'http', host: '', port: 80 },
      'http://:80/',
    )
    expect(line).toContain('id=abc')
    expect(line).toContain('inbound=app.example.com')
    expect(line).toContain('host=""')
    expect(line).toContain('→ http://:80/')
  })
})
