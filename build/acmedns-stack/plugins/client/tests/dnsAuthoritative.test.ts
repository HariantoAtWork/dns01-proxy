import { describe, expect, test } from 'bun:test'
import { isNameUnderZone } from '../runtime/server/utils/dnsAuthoritative'

describe('isNameUnderZone', () => {
  test('matches the zone apex and children', () => {
    expect(isNameUnderZone('auth.mizu.work', 'auth.mizu.work')).toBe(true)
    expect(isNameUnderZone('3ac8b0f4-93de-468a-af13-6657e73a531b.auth.mizu.work', 'auth.mizu.work')).toBe(true)
    expect(isNameUnderZone('_acme-challenge.ulens.me', 'auth.mizu.work')).toBe(false)
    expect(isNameUnderZone('auth.mizu.work.evil.test', 'auth.mizu.work')).toBe(false)
  })
})
