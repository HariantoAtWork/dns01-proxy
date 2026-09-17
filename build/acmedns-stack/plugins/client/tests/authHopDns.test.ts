import { describe, expect, test } from 'bun:test'
import {
  planAuthHopPublishSlot,
  resolveAuthHopEntryLabel,
} from '../runtime/shared/utils/authHopDns'

describe('authHopDns', () => {
  test('resolveAuthHopEntryLabel falls back to encoded apex', () => {
    expect(resolveAuthHopEntryLabel('harianto.dev', 'auth.mizu.work', [])).toBe('_harianto-dev_')
  })

  test('resolveAuthHopEntryLabel uses last auth-zone CNAME target', () => {
    expect(resolveAuthHopEntryLabel('harianto.dev', 'auth.mizu.work', [
      '_acme-challenge.harianto.dev',
      '_harianto-dev_.auth.mizu.work',
    ])).toBe('_harianto-dev_')

    expect(resolveAuthHopEntryLabel('harianto.dev', 'auth.mizu.work', [
      '018f3a2b-7c4d-7000-8000-0000000000ab.auth.mizu.work',
    ])).toBe('018f3a2b-7c4d-7000-8000-0000000000ab')

    expect(resolveAuthHopEntryLabel('harianto.dev', 'auth.mizu.work', [
      'i-eat-cake.auth.mizu.work',
    ])).toBe('i-eat-cake')

    expect(resolveAuthHopEntryLabel('harianto.dev', 'auth.mizu.work', [
      '_wildcard_.auth.mizu.work',
    ])).toBe('_wildcard_')
  })

  test('planAuthHopPublishSlot returns local hop-only slot', () => {
    expect(planAuthHopPublishSlot({
      hopLabel: '018f3a2b-7c4d-7000-8000-0000000000ab',
      localServerUrl: 'https://auth.mizu.work/',
      authZone: 'auth.mizu.work',
    })).toEqual({
      subdomain: '018f3a2b-7c4d-7000-8000-0000000000ab',
      serverUrl: 'https://auth.mizu.work',
      local: true,
      authZone: 'auth.mizu.work',
    })
  })
})
