import { describe, expect, test } from 'bun:test'
import {
  asForwardPort,
  defaultForwardPort,
  domainPatternMatchesHostname,
  hstsHeaderValue,
  normalizeProxyHost,
  validateDomainName,
  validateProxyHost,
} from '../runtime/shared/utils/proxyHost'

describe('proxyHost normalize', () => {
  test('fills defaults and sorts domains', () => {
    const host = normalizeProxyHost({
      domainNames: ['B.example.com', 'a.example.com'],
      forwardHost: '192.168.1.20',
      forwardPort: '8123',
      allowWebsocketUpgrade: 1,
    })
    expect(host.domainNames).toEqual(['a.example.com', 'b.example.com'])
    expect(host.forwardScheme).toBe('http')
    expect(host.forwardPort).toBe(8123)
    expect(host.allowWebsocketUpgrade).toBe(true)
    expect(host.http2Support).toBe(true)
    expect(validateProxyHost(host)).toBeNull()
  })

  test('defaults empty port by scheme and strips legacy keys', () => {
    const httpHost = normalizeProxyHost({
      domainNames: ['a.example.com'],
      forwardHost: 'app',
      forwardScheme: 'http',
      forwardPort: '',
      cachingEnabled: true,
      blockExploits: true,
      advancedConfig: 'return 444;',
    })
    expect(httpHost.forwardPort).toBe(80)
    expect(httpHost).not.toHaveProperty('cachingEnabled')
    expect(httpHost).not.toHaveProperty('blockExploits')
    expect(httpHost).not.toHaveProperty('advancedConfig')

    const httpsHost = normalizeProxyHost({
      domainNames: ['a.example.com'],
      forwardHost: 'app',
      forwardScheme: 'https',
    })
    expect(httpsHost.forwardPort).toBe(443)
    expect(defaultForwardPort('https')).toBe(443)
    expect(asForwardPort(0, 'http')).toBe(80)
  })

  test('rejects empty domains', () => {
    const host = normalizeProxyHost({ forwardHost: 'x' })
    expect(validateProxyHost(host)).toMatch(/domain/i)
  })

  test('accepts DNS-style wildcards and rejects bad patterns', () => {
    expect(validateDomainName('*.example.com')).toBeNull()
    expect(validateDomainName('*')).not.toBeNull()
    expect(validateDomainName('foo.*.com')).not.toBeNull()
    expect(validateDomainName('*.com')).not.toBeNull()

    const host = normalizeProxyHost({
      domainNames: ['*.Apps.Example.com'],
      forwardHost: '10.0.0.1',
    })
    expect(host.domainNames).toEqual(['*.apps.example.com'])
    expect(validateProxyHost(host)).toBeNull()

    expect(domainPatternMatchesHostname('*.example.com', 'foo.example.com')).toBe(true)
    expect(domainPatternMatchesHostname('*.example.com', 'example.com')).toBe(false)
    expect(domainPatternMatchesHostname('*.example.com', 'a.b.example.com')).toBe(false)
  })

  test('hstsHeaderValue', () => {
    expect(hstsHeaderValue({ hstsEnabled: false, hstsSubdomains: true })).toBeNull()
    expect(hstsHeaderValue({ hstsEnabled: true, hstsSubdomains: false }))
      .toBe('max-age=31536000')
    expect(hstsHeaderValue({ hstsEnabled: true, hstsSubdomains: true }))
      .toBe('max-age=31536000; includeSubDomains')
  })
})
