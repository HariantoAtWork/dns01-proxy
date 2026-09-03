import { describe, expect, test, beforeEach } from 'bun:test'
import type { ProxyHost } from '../../plugins/proxy/runtime/shared/types/proxyHost'
import { normalizeProxyHost } from '../../plugins/proxy/runtime/shared/utils/proxyHost'
import { matchProxyRoute, reloadRouteTable } from '../proxy/routeTable'
import { buildForwardHeaders, describeTarget, forceSslRedirect } from '../proxy/forward'
import { isControlBinding, isEdgeBinding, type ListenBinding } from '../utils/listen'

function host(partial: Partial<ProxyHost> & { domainNames: string[], forwardHost: string }): ProxyHost {
  return normalizeProxyHost({
    forwardPort: 8080,
    enabled: true,
    ...partial,
  })
}

describe('proxy routeTable', () => {
  beforeEach(() => {
    reloadRouteTable([])
  })

  test('matches hostname and longest location prefix', () => {
    reloadRouteTable([
      host({
        domainNames: ['ha.example.com'],
        forwardHost: '192.168.1.20',
        forwardPort: 8123,
        locations: [
          {
            path: '/api',
            forwardScheme: 'http',
            forwardHost: '192.168.1.20',
            forwardPort: 8124,
          },
          {
            path: '/api/v2',
            forwardScheme: 'http',
            forwardHost: '192.168.1.20',
            forwardPort: 8125,
          },
        ],
      }),
    ])
    const root = matchProxyRoute('ha.example.com', '/dashboard')
    expect(root?.location).toBeNull()
    expect(describeTarget(root!.host, root!.location)).toBe('http://192.168.1.20:8123')

    const api = matchProxyRoute('ha.example.com', '/api/foo')
    expect(api?.location?.forwardPort).toBe(8124)

    const v2 = matchProxyRoute('ha.example.com', '/api/v2/x')
    expect(v2?.location?.forwardPort).toBe(8125)
  })

  test('ignores disabled hosts and strips port from Host header', () => {
    reloadRouteTable([
      host({
        domainNames: ['app.example.com'],
        forwardHost: '10.0.0.1',
        enabled: false,
      }),
      host({
        domainNames: ['ok.example.com'],
        forwardHost: '10.0.0.2',
        forwardPort: 3000,
      }),
    ])
    expect(matchProxyRoute('app.example.com', '/')).toBeNull()
    expect(matchProxyRoute('ok.example.com:443', '/')?.host.forwardHost).toBe('10.0.0.2')
  })

  test('does not match /apiv2 for location /api', () => {
    reloadRouteTable([
      host({
        domainNames: ['app.example.com'],
        forwardHost: '10.0.0.1',
        locations: [{
          path: '/api',
          forwardScheme: 'http',
          forwardHost: '10.0.0.1',
          forwardPort: 9000,
        }],
      }),
    ])
    const match = matchProxyRoute('app.example.com', '/apiv2')
    expect(match?.location).toBeNull()
  })
})

describe('proxy forward headers', () => {
  test('sets X-Forwarded-Proto from binding unless inbound https or sslForced', () => {
    const match = {
      host: host({
        domainNames: ['app.example.com'],
        forwardHost: '10.0.0.1',
        trustForwardedProto: false,
        allowWebsocketUpgrade: true,
      }),
      location: null,
    }
    const binding: ListenBinding = {
      host: '0.0.0.0',
      port: 443,
      role: 'edge',
      tls: { certPath: '/x', keyPath: '/y' },
    }
    const req = new Request('https://app.example.com/', {
      headers: {
        host: 'app.example.com',
        'x-forwarded-proto': 'http',
        upgrade: 'websocket',
        connection: 'Upgrade',
      },
    })
    const headers = buildForwardHeaders(req, match, binding)
    expect(headers.get('X-Forwarded-Proto')).toBe('https')
    expect(headers.get('Upgrade')).toBe('websocket')

    const httpBinding: ListenBinding = { ...binding, port: 80, tls: null }
    const cdnReq = new Request('http://app.example.com/', {
      headers: { host: 'app.example.com', 'x-forwarded-proto': 'https' },
    })
    expect(buildForwardHeaders(cdnReq, match, httpBinding).get('X-Forwarded-Proto')).toBe('https')
  })

  test('Force SSL skips redirect when X-Forwarded-Proto is already https', () => {
    const proxyHost = host({
      domainNames: ['app.example.com'],
      forwardHost: '10.0.0.1',
      sslForced: true,
      certificateName: 'app.example.com',
    })
    const url = new URL('http://app.example.com/dash')
    const plain = new Request('http://app.example.com/dash', { headers: { host: 'app.example.com' } })
    expect(forceSslRedirect(plain, url, proxyHost)?.status).toBe(301)

    const viaCdn = new Request('http://app.example.com/dash', {
      headers: { host: 'app.example.com', 'x-forwarded-proto': 'https' },
    })
    expect(forceSslRedirect(viaCdn, url, proxyHost)).toBeNull()
  })
})

describe('listen roles', () => {
  test('control vs edge helpers', () => {
    const control: ListenBinding = {
      host: '0.0.0.0',
      port: 1080,
      role: 'control',
      tls: null,
    }
    const edge: ListenBinding = {
      host: '0.0.0.0',
      port: 80,
      role: 'edge',
      tls: null,
    }
    expect(isControlBinding(control)).toBe(true)
    expect(isEdgeBinding(control)).toBe(false)
    expect(isEdgeBinding(edge)).toBe(true)
  })
})
