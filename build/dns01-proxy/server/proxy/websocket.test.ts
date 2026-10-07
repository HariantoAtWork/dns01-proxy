import { describe, expect, test } from 'bun:test'
import { buildUpstreamWsHeaders } from './websocket'
import type { RouteMatch } from './routeTable'
import { normalizeProxyHost } from '../../plugins/proxy/runtime/shared/utils/proxyHost'

describe('proxy websocket headers', () => {
  test('forwards Host Cookie Origin and subprotocol to upstream', () => {
    const match = {
      host: normalizeProxyHost({
        domainNames: ['app.example.com'],
        forwardHost: '10.0.0.1',
        forwardPort: 8123,
        allowWebsocketUpgrade: true,
      }),
      location: null,
    } as RouteMatch
    const req = new Request('http://app.example.com/socket', {
      headers: {
        host: 'app.example.com:443',
        cookie: 'session=abc',
        origin: 'https://app.example.com',
        'sec-websocket-protocol': 'graphql-transport-ws',
        authorization: 'Bearer t',
      },
    })
    const headers = buildUpstreamWsHeaders(req, match)
    expect(headers.Host).toBe('app.example.com')
    expect(headers.Cookie).toBe('session=abc')
    expect(headers.Origin).toBe('https://app.example.com')
    expect(headers['Sec-WebSocket-Protocol']).toBe('graphql-transport-ws')
    expect(headers.Authorization).toBe('Bearer t')
  })
})
