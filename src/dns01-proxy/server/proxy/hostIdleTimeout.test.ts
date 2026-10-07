import { describe, expect, test } from 'bun:test'
import { applyProxyHostIdleTimeout } from './hostIdleTimeout'

describe('applyProxyHostIdleTimeout', () => {
  test('no-ops when idleTimeout is unset or null', () => {
    const calls: number[] = []
    const server = {
      timeout(_req: Request, seconds: number) {
        calls.push(seconds)
      },
    }
    const req = new Request('http://stream.example.com/')

    applyProxyHostIdleTimeout(server, req, {})
    applyProxyHostIdleTimeout(server, req, { idleTimeout: null })
    applyProxyHostIdleTimeout(server, req, { idleTimeout: undefined })
    expect(calls).toEqual([])
  })

  test('calls server.timeout with 0 and positive overrides', () => {
    const calls: number[] = []
    const server = {
      timeout(_req: Request, seconds: number) {
        calls.push(seconds)
      },
    }
    const req = new Request('http://stream.example.com/')

    applyProxyHostIdleTimeout(server, req, { idleTimeout: 0 })
    applyProxyHostIdleTimeout(server, req, { idleTimeout: 120 })
    expect(calls).toEqual([0, 120])
  })
})
