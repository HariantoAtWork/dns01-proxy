import { describe, expect, test } from 'bun:test'
import { buildNginxSnippet } from '../runtime/shared/utils/nginxSnippet'
import { normalizeProxyHost, validateProxyHost } from '../runtime/shared/utils/proxyHost'

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
