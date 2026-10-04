import { afterEach, describe, expect, test } from 'bun:test'
import {
  DEFAULT_PROXY_UPSTREAM_TIMEOUT_MS,
  applyHstsHeader,
  formatProxyUpstreamContext,
  proxyUpstreamTimeoutMs,
  sanitizeUpstreamResponseHeaders,
  validateForwardTarget,
} from './forward'
import type { RouteMatch } from './routeTable'
import type { ListenBinding } from '../utils/listen'

const ENV = 'PROXY_UPSTREAM_TIMEOUT_MS'

afterEach(() => {
  delete process.env[ENV]
})

describe('proxyUpstreamTimeoutMs', () => {
  test('defaults to disabled (0)', () => {
    expect(proxyUpstreamTimeoutMs()).toBe(DEFAULT_PROXY_UPSTREAM_TIMEOUT_MS)
    expect(DEFAULT_PROXY_UPSTREAM_TIMEOUT_MS).toBe(0)
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
        allowWebsocketUpgrade: false,
        locations: [],
        sslForced: false,
        http2Support: true,
        hstsEnabled: false,
        hstsSubdomains: false,
        trustForwardedProto: false,
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

describe('applyHstsHeader', () => {
  const tlsBinding: ListenBinding = {
    host: '0.0.0.0',
    port: 443,
    role: 'edge',
    tls: { certPath: '/c', keyPath: '/k' },
  }
  const plainBinding: ListenBinding = {
    host: '0.0.0.0',
    port: 80,
    role: 'edge',
    tls: null,
  }

  test('sets Strict-Transport-Security on HTTPS when enabled', () => {
    const headers = new Headers({ 'content-type': 'text/plain' })
    const req = new Request('https://app.example.com/')
    applyHstsHeader(
      headers,
      { hstsEnabled: true, hstsSubdomains: true, sslForced: false, trustForwardedProto: false },
      req,
      tlsBinding,
    )
    expect(headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains')
  })

  test('skips HSTS on plain HTTP without forced SSL', () => {
    const headers = new Headers()
    const req = new Request('http://app.example.com/')
    applyHstsHeader(
      headers,
      { hstsEnabled: true, hstsSubdomains: false, sslForced: false, trustForwardedProto: false },
      req,
      plainBinding,
    )
    expect(headers.get('Strict-Transport-Security')).toBeNull()
  })

  test('sets HSTS when Force SSL is on even on plain binding', () => {
    const headers = new Headers()
    const req = new Request('http://app.example.com/')
    applyHstsHeader(
      headers,
      { hstsEnabled: true, hstsSubdomains: false, sslForced: true, trustForwardedProto: false },
      req,
      plainBinding,
    )
    expect(headers.get('Strict-Transport-Security')).toBe('max-age=31536000')
  })
})
