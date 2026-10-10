import { describe, expect, test } from 'bun:test'
import type { ProxyHost } from '../runtime/shared/types/proxyHost'
import { normalizeProxyHost } from '../runtime/shared/utils/proxyHost'
import { reloadBearerLists } from '../../../server/proxy/bearerKeyState'
import {
  generateBearerToken,
  normalizeBearerListInput,
} from '../runtime/server/utils/bearerKeyCrypto'
import { respondPublicLiveStatus } from '../../../server/proxy/liveStatus'
import { tryHandleProxy } from '../../../server/proxy/handle'
import { reloadRouteTable } from '../../../server/proxy/routeTable'
import type { ListenBinding } from '../../../server/utils/listen'

function edgeBinding(): ListenBinding {
  return { role: 'edge', host: '0.0.0.0', port: 80, tls: null }
}

function hostWithBearer(bearerListId: string | null): ProxyHost {
  return normalizeProxyHost({
    id: 'host-1',
    domainNames: ['ai.example.com'],
    forwardHost: '127.0.0.1',
    forwardPort: 9,
    forwardScheme: 'http',
    bearerListId,
    enabled: true,
  })
}

describe('edge bearer list + live status', () => {
  test('GET / without bearer returns HTML live status', async () => {
    const token = generateBearerToken()
    const { list } = normalizeBearerListInput({
      name: 'edge',
      keys: [{ token }],
    }, null)
    reloadBearerLists([list])
    reloadRouteTable([hostWithBearer(list.id)])

    const req = new Request('http://ai.example.com/', {
      headers: { host: 'ai.example.com' },
    })
    const res = await tryHandleProxy(
      req,
      edgeBinding(),
      {} as never,
      new URL(req.url),
    )
    expect(res).toBeInstanceOf(Response)
    if (!(res instanceof Response)) {
      return
    }
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type') || '').toContain('text/html')
  })

  test('GET / Accept json without bearer returns public status', async () => {
    const token = generateBearerToken()
    const { list } = normalizeBearerListInput({
      name: 'edge',
      keys: [{ token }],
    }, null)
    reloadBearerLists([list])
    reloadRouteTable([hostWithBearer(list.id)])

    const req = new Request('http://ai.example.com/', {
      headers: {
        host: 'ai.example.com',
        accept: 'application/json',
      },
    })
    const res = await tryHandleProxy(
      req,
      edgeBinding(),
      {} as never,
      new URL(req.url),
    )
    expect(res).toBeInstanceOf(Response)
    if (!(res instanceof Response)) {
      return
    }
    expect(res.status).toBe(200)
    const json = await res.json() as { online: boolean, at: string }
    expect(typeof json.online).toBe('boolean')
    expect(json).not.toHaveProperty('target')
  })

  test('non-root without bearer returns 401 Bearer', async () => {
    const token = generateBearerToken()
    const { list } = normalizeBearerListInput({
      name: 'edge',
      keys: [{ token }],
    }, null)
    reloadBearerLists([list])
    reloadRouteTable([hostWithBearer(list.id)])

    const req = new Request('http://ai.example.com/v1/chat', {
      headers: { host: 'ai.example.com' },
    })
    const res = await tryHandleProxy(
      req,
      edgeBinding(),
      {} as never,
      new URL(req.url),
    )
    expect(res).toBeInstanceOf(Response)
    if (!(res instanceof Response)) {
      return
    }
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate') || '').toMatch(/Bearer/i)
  })

  test('bearerPaths gates only matching prefixes', async () => {
    const token = generateBearerToken()
    const { list } = normalizeBearerListInput({
      name: 'tunnel-register',
      keys: [{ token }],
    }, null)
    reloadBearerLists([list])
    const host = normalizeProxyHost({
      id: 'tunnel-host',
      domainNames: ['tunnel.example.com'],
      forwardHost: '127.0.0.1',
      forwardPort: 9,
      forwardScheme: 'http',
      bearerListId: list.id,
      bearerPaths: ['/tunnel'],
      allowWebsocketUpgrade: true,
      enabled: true,
    })
    expect(host.bearerPaths).toEqual(['/tunnel'])
    reloadRouteTable([host])

    const openFetch = new Request('http://tunnel.example.com/t/session-1/print/cv', {
      headers: { host: 'tunnel.example.com' },
    })
    const openRes = await tryHandleProxy(
      openFetch,
      edgeBinding(),
      {} as never,
      new URL(openFetch.url),
    )
    expect(openRes).toBeInstanceOf(Response)
    if (openRes instanceof Response) {
      // Not gated — may be upstream failure, but never dns01 401 Bearer.
      expect(openRes.status).not.toBe(401)
      expect(openRes.headers.get('www-authenticate') || '').not.toMatch(/Bearer/i)
    }

    const gated = new Request('http://tunnel.example.com/tunnel', {
      headers: { host: 'tunnel.example.com' },
    })
    const gatedRes = await tryHandleProxy(
      gated,
      edgeBinding(),
      {} as never,
      new URL(gated.url),
    )
    expect(gatedRes).toBeInstanceOf(Response)
    if (gatedRes instanceof Response) {
      expect(gatedRes.status).toBe(401)
      expect(gatedRes.headers.get('www-authenticate') || '').toMatch(/Bearer/i)
    }

    const health = new Request('http://tunnel.example.com/health', {
      headers: { host: 'tunnel.example.com' },
    })
    const healthRes = await tryHandleProxy(
      health,
      edgeBinding(),
      {} as never,
      new URL(health.url),
    )
    expect(healthRes).toBeInstanceOf(Response)
    if (healthRes instanceof Response) {
      expect(healthRes.status).not.toBe(401)
    }
  })

  test('legacy bearerKeyId on host still gates', async () => {
    const token = generateBearerToken()
    const { list } = normalizeBearerListInput({
      name: 'legacy',
      keys: [{ token }],
    }, null)
    reloadBearerLists([list])
    const host = normalizeProxyHost({
      id: 'host-legacy',
      domainNames: ['legacy.example.com'],
      forwardHost: '127.0.0.1',
      forwardPort: 9,
      bearerKeyId: list.id,
      enabled: true,
    })
    expect(host.bearerListId).toBe(list.id)
    reloadRouteTable([host])

    const req = new Request('http://legacy.example.com/v1', {
      headers: { host: 'legacy.example.com' },
    })
    const res = await tryHandleProxy(req, edgeBinding(), {} as never, new URL(req.url))
    expect(res).toBeInstanceOf(Response)
    if (res instanceof Response) {
      expect(res.status).toBe(401)
    }
  })

  test('respondPublicLiveStatus SSE content type', async () => {
    const host = hostWithBearer(null)
    const req = new Request('http://ai.example.com/', {
      headers: { accept: 'text/event-stream' },
    })
    const res = await respondPublicLiveStatus(req, host)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type') || '').toContain('text/event-stream')
    await res.body?.cancel()
  })
})
