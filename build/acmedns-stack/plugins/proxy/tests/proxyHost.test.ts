import { describe, expect, test } from 'bun:test'
import { buildNginxSnippet } from '../runtime/shared/utils/nginxSnippet'
import {
  domainPatternMatchesHostname,
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
    expect(validateProxyHost(host)).toBeNull()
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
})

describe('nginxSnippet', () => {
  test('includes websocket headers when enabled', () => {
    const snippet = buildNginxSnippet(normalizeProxyHost({
      domainNames: ['ha.example.com'],
      forwardHost: '192.168.1.20',
      forwardPort: 8123,
      allowWebsocketUpgrade: true,
      certificateName: 'ha.example.com',
      sslForced: true,
      trustForwardedProto: true,
    }))
    expect(snippet).toContain('server_name ha.example.com')
    expect(snippet).toContain('proxy_set_header Upgrade')
    expect(snippet).toContain('X-Forwarded-Proto $http_x_forwarded_proto')
    expect(snippet).toContain('return 301 https')
  })
})
