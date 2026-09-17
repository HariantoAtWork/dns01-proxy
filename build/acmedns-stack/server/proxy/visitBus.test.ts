import { describe, expect, test, beforeEach } from 'bun:test'
import {
  publishProxyVisit,
  resetProxyVisitBusForTests,
  subscribeProxyVisits,
  type ProxyVisitEvent,
} from './visitBus'

beforeEach(() => {
  resetProxyVisitBusForTests()
})

describe('proxyVisitBus', () => {
  test('publish is a no-op without listeners', () => {
    expect(() => {
      publishProxyVisit({
        hostId: 'h1',
        domain: 'app.example.com',
        at: new Date().toISOString(),
      })
    }).not.toThrow()
  })

  test('delivers visit events to subscribers', () => {
    const received: ProxyVisitEvent[] = []
    const unsubscribe = subscribeProxyVisits(event => received.push(event))
    publishProxyVisit({
      hostId: 'h1',
      domain: 'app.example.com',
      at: '2026-01-01T00:00:00.000Z',
    })
    unsubscribe()
    expect(received).toEqual([{
      hostId: 'h1',
      domain: 'app.example.com',
      at: '2026-01-01T00:00:00.000Z',
    }])
  })

  test('coalesces bursts for the same hostId:domain within 300ms', () => {
    const received: ProxyVisitEvent[] = []
    subscribeProxyVisits(event => received.push(event))
    publishProxyVisit({
      hostId: 'h1',
      domain: 'app.example.com',
      at: '2026-01-01T00:00:00.000Z',
    })
    publishProxyVisit({
      hostId: 'h1',
      domain: 'app.example.com',
      at: '2026-01-01T00:00:00.100Z',
    })
    publishProxyVisit({
      hostId: 'h1',
      domain: 'other.example.com',
      at: '2026-01-01T00:00:00.100Z',
    })
    expect(received).toHaveLength(2)
    expect(received.map(item => item.domain)).toEqual([
      'app.example.com',
      'other.example.com',
    ])
  })

  test('listener errors do not break publish', () => {
    subscribeProxyVisits(() => {
      throw new Error('boom')
    })
    const received: ProxyVisitEvent[] = []
    subscribeProxyVisits(event => received.push(event))
    expect(() => {
      publishProxyVisit({
        hostId: 'h1',
        domain: 'app.example.com',
        at: '2026-01-01T00:00:00.000Z',
      })
    }).not.toThrow()
    expect(received).toHaveLength(1)
  })
})
