import { describe, expect, test } from 'bun:test'
import type { ProxyHost } from '../runtime/shared/types/proxyHost'
import { normalizeProxyHost } from '../runtime/shared/utils/proxyHost'
import { reloadBearerKeys } from '../../../server/proxy/bearerKeyState'
import {
  generateBearerToken,
  normalizeBearerKeyInput,
} from '../runtime/shared/utils/bearerKey'
import { respondPublicLiveStatus } from '../../../server/proxy/liveStatus'
import { tryHandleProxy } from '../../../server/proxy/handle'
import { reloadRouteTable } from '../../../server/proxy/routeTable'
import type { ListenBinding } from '../../../server/utils/listen'

function edgeBinding(): ListenBinding {
  return { role: 'edge', host: '0.0.0.0', port: 80, tls: null }
}

function hostWithBearer(bearerKeyId: string | null): ProxyHost {
  return normalizeProxyHost({
    id: 'host-1',
    domainNames: ['ai.example.com'],
    forwardHost: '127.0.0.1',
    forwardPort: 9,
    forwardScheme: 'http',
    bearerKeyId,
    enabled: true,
  })
}

describe('edge bearer + live status', () => {
  test('GET / without bearer returns HTML live status', async () => {
    const token = generateBearerToken()
    const key = normalizeBearerKeyInput({ name: 'edge' }, null, token)
    reloadBearerKeys([key])
    reloadRouteTable([hostWithBearer(key.id)])

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
    const body = await res.text()
    expect(body).toContain('Upstream')
  })

  test('GET / Accept json without bearer returns public status', async () => {
    const token = generateBearerToken()
    const key = normalizeBearerKeyInput({ name: 'edge' }, null, token)
    reloadBearerKeys([key])
    reloadRouteTable([hostWithBearer(key.id)])

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
    expect(json.at).toBeTruthy()
    expect(json).not.toHaveProperty('target')
    expect(json).not.toHaveProperty('error')
  })

  test('non-root without bearer returns 401 Bearer', async () => {
    const token = generateBearerToken()
    const key = normalizeBearerKeyInput({ name: 'edge' }, null, token)
    reloadBearerKeys([key])
    reloadRouteTable([hostWithBearer(key.id)])

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

  test('respondPublicLiveStatus SSE content type', async () => {
    const host = hostWithBearer(null)
    const req = new Request('http://ai.example.com/', {
      headers: { accept: 'text/event-stream' },
    })
    const res = await respondPublicLiveStatus(req, host)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type') || '').toContain('text/event-stream')
    // Abort quickly — do not drain the infinite stream in the test runner.
    await res.body?.cancel()
  })
})
