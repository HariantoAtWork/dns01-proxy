import { describe, expect, test } from 'bun:test'
import { InMemoryAliasStore } from '../store/inMemoryAliasStore'

describe('InMemoryAliasStore', () => {
  test('mint sets entry → hop and remint overwrites', () => {
    const store = new InMemoryAliasStore({ ttlSeconds: 3600 })
    store.mint('_mdstn-com_', '11111111-1111-7111-8111-111111111111')
    expect(store.getTarget('_mdstn-com_')).toBe('11111111-1111-7111-8111-111111111111')

    store.mint('_mdstn-com_', '22222222-2222-7222-8222-222222222222')
    expect(store.getTarget('_mdstn-com_')).toBe('22222222-2222-7222-8222-222222222222')
  })

  test('clear removes alias', () => {
    const store = new InMemoryAliasStore({ ttlSeconds: 3600 })
    store.mint('_a_', '33333333-3333-7333-8333-333333333333')
    expect(store.clear('_a_')).toBe(true)
    expect(store.getTarget('_a_')).toBeNull()
  })

  test('purgeExpired drops stale aliases', () => {
    let now = 1_000_000
    const store = new InMemoryAliasStore({
      ttlSeconds: 10,
      now: () => now,
    })
    store.mint('_a_', '44444444-4444-7444-8444-444444444444')
    now += 11_000
    expect(store.purgeExpired()).toBe(1)
    expect(store.getTarget('_a_')).toBeNull()
  })
})
