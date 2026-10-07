import { describe, expect, test } from 'bun:test'
import { InMemoryTxtStore } from '../runtime/server/store/inMemoryTxtStore'

const TXT = 'abcdefghijklmnopqrstuvwxyz0123456789abcdefg'
const TXT2 = 'bcdefghijklmnopqrstuvwxyz0123456789abcdefgh'

describe('InMemoryTxtStore', () => {
  test('returns live TXT values and hides expired slots', () => {
    let now = 1_000_000
    const store = new InMemoryTxtStore({
      ttlSeconds: 3600,
      now: () => now,
      slotCount: 4,
    })

    store.update('sub-a', TXT)
    expect(store.getValues('sub-a')).toEqual([TXT])

    now += 3600 * 1000 + 1
    expect(store.getValues('sub-a')).toEqual([])
  })

  test('rotates into empty slots before evicting live values', () => {
    const store = new InMemoryTxtStore({ ttlSeconds: 3600, slotCount: 2 })
    store.update('sub-a', TXT)
    store.update('sub-a', TXT2)
    expect(store.getValues('sub-a').sort()).toEqual([TXT, TXT2].sort())
  })

  test('returns newest TXT first and oldest last', () => {
    let now = 1_000_000
    const store = new InMemoryTxtStore({
      ttlSeconds: 3600,
      now: () => now,
      slotCount: 4,
    })

    store.update('sub-a', TXT)
    now += 1_000
    store.update('sub-a', TXT2)
    now += 1_000
    const newest = 'cdefghijklmnopqrstuvwxyz0123456789abcdefi'
    store.update('sub-a', newest)

    expect(store.getValues('sub-a')).toEqual([newest, TXT2, TXT])
  })

  test('clearByValue and clearAll remove stored digests', () => {
    const store = new InMemoryTxtStore({ ttlSeconds: 3600, slotCount: 4 })
    store.update('sub-a', TXT)
    store.update('sub-a', TXT2)

    expect(store.clearByValue('sub-a', TXT)).toBe(1)
    expect(store.getValues('sub-a')).toEqual([TXT2])

    expect(store.clearAll('sub-a')).toBe(1)
    expect(store.getValues('sub-a')).toEqual([])
  })

  test('purgeExpired clears stale slots across subdomains', () => {
    let now = 0
    const store = new InMemoryTxtStore({
      ttlSeconds: 60,
      now: () => now,
      slotCount: 2,
    })

    store.update('a', TXT)
    store.update('b', TXT2)
    now = 61_000

    expect(store.purgeExpired()).toBe(2)
    expect(store.getValues('a')).toEqual([])
    expect(store.getValues('b')).toEqual([])
  })

  test('ttlSeconds getter is used for each update', () => {
    let now = 1_000_000
    let ttlSeconds = 10
    const store = new InMemoryTxtStore({
      ttlSeconds: () => ttlSeconds,
      now: () => now,
      slotCount: 1,
    })

    store.update('sub-a', TXT)
    now += 5_000
    expect(store.getValues('sub-a')).toEqual([TXT])

    ttlSeconds = 1
    store.update('sub-a', TXT2)
    now += 1_500
    expect(store.getValues('sub-a')).toEqual([])
  })
})
