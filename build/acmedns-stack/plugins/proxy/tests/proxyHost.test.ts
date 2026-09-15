import { describe, expect, test } from 'bun:test'
import {
  asForwardPort,
  defaultForwardPort,
  domainPatternMatchesHostname,
  findDuplicateDomainConflicts,
  formatDuplicateDomainWarning,
  hstsHeaderValue,
  normalizeProxyHost,
  parseForwardTargetInput,
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
    expect(httpHost.bearerListId).toBeNull()
    expect(httpHost).not.toHaveProperty('cachingEnabled')
    expect(httpHost).not.toHaveProperty('blockExploits')
    expect(httpHost).not.toHaveProperty('advancedConfig')

    const httpsHost = normalizeProxyHost({
      domainNames: ['a.example.com'],
      forwardHost: 'app',
      forwardScheme: 'https',
      bearerListId: 'list-1',
    })
    expect(httpsHost.forwardPort).toBe(443)
    expect(httpsHost.bearerListId).toBe('list-1')
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

  test('findDuplicateDomainConflicts flags domains already on another host', () => {
    const existing = [
      { id: 'host-a', domainNames: ['app.example.com', 'www.example.com'] },
      { id: 'host-b', domainNames: ['*.apps.example.com'] },
    ]
    expect(findDuplicateDomainConflicts(['App.Example.com'], existing)).toEqual([{
      domain: 'app.example.com',
      hostId: 'host-a',
      hostLabel: 'app.example.com',
    }])
    expect(findDuplicateDomainConflicts(['app.example.com'], existing, 'host-a')).toEqual([])
    expect(findDuplicateDomainConflicts(['*.apps.example.com', 'new.example.com'], existing)).toEqual([{
      domain: '*.apps.example.com',
      hostId: 'host-b',
      hostLabel: '*.apps.example.com',
    }])
    expect(formatDuplicateDomainWarning([
      { domain: 'app.example.com', hostId: 'host-a', hostLabel: 'app.example.com' },
    ])).toMatch(/already used/i)
  })

  test('parseForwardTargetInput splits URLs and host:port', () => {
    expect(parseForwardTargetInput('http://stremio-server:11470')).toEqual({
      scheme: 'http',
      host: 'stremio-server',
      port: 11470,
    })
    expect(parseForwardTargetInput('https://app.example.com/')).toEqual({
      scheme: 'https',
      host: 'app.example.com',
      port: 443,
    })
    expect(parseForwardTargetInput('vaultwarden:8080')).toEqual({
      scheme: 'http',
      host: 'vaultwarden',
      port: 8080,
    })
    expect(parseForwardTargetInput('plain-hostname')).toBeNull()

    const host = normalizeProxyHost({
      domainNames: ['a.example.com'],
      forwardHost: 'http://stremio-server:11470',
      forwardScheme: 'https',
      forwardPort: 443,
    })
    expect(host.forwardScheme).toBe('http')
    expect(host.forwardHost).toBe('stremio-server')
    expect(host.forwardPort).toBe(11470)
  })
})
