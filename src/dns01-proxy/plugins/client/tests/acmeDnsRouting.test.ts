import { describe, expect, test } from 'bun:test'
import {
  identityServerUrl,
  isLocalAcmeDnsBase,
  resolveAcmeDnsBaseUrl,
  shouldUseInProcessUpdate,
  type AcmeDnsRoutingContext,
} from '../runtime/shared/utils/acmeDnsRouting'

const AUTH_ZONE = 'auth.example.test'
const PUBLIC_ACME = 'acme.public.example.test'

function ctx(overrides: Partial<AcmeDnsRoutingContext> = {}): AcmeDnsRoutingContext {
  return {
    authZoneHost: AUTH_ZONE,
    preferredPublicHost: PUBLIC_ACME,
    preferredAcmednsUrl: `https://${PUBLIC_ACME}`,
    authZoneTls: 'cert',
    isInternalHost: host => ['127.0.0.1', 'localhost', '::1'].includes(host),
    ...overrides,
  }
}

describe('isLocalAcmeDnsBase', () => {
  test('treats empty and local:// as in-process', () => {
    const routing = ctx()
    expect(isLocalAcmeDnsBase('', routing)).toBe(true)
    expect(isLocalAcmeDnsBase('local://acmedns', routing)).toBe(true)
  })

  test('treats loopback hosts as in-process', () => {
    const routing = ctx()
    expect(isLocalAcmeDnsBase('http://127.0.0.1', routing)).toBe(true)
    expect(isLocalAcmeDnsBase('http://localhost:8053/', routing)).toBe(true)
  })

  test('treats auth zone host as in-process', () => {
    const routing = ctx()
    expect(isLocalAcmeDnsBase(`https://${AUTH_ZONE}`, routing)).toBe(true)
    expect(isLocalAcmeDnsBase(`http://${AUTH_ZONE}.`, routing)).toBe(true)
  })

  test('treats ACMEDNS_URL public host as in-process', () => {
    const routing = ctx()
    expect(isLocalAcmeDnsBase(`https://${PUBLIC_ACME}`, routing)).toBe(true)
  })

  test('rejects unrelated external hosts', () => {
    const routing = ctx()
    expect(isLocalAcmeDnsBase('https://remote-acme.example.test', routing)).toBe(false)
    expect(isLocalAcmeDnsBase('not-a-url', routing)).toBe(false)
  })
})

describe('identityServerUrl', () => {
  test('keeps a public resolved base', () => {
    const routing = ctx()
    expect(identityServerUrl(`https://${PUBLIC_ACME}/`, routing)).toBe(`https://${PUBLIC_ACME}`)
  })

  test('prefers ACMEDNS_URL over loopback for stored identity', () => {
    const routing = ctx()
    expect(identityServerUrl('http://127.0.0.1', routing)).toBe(`https://${PUBLIC_ACME}`)
  })

  test('falls back to auth zone with TLS when loopback and no public ACMEDNS_URL', () => {
    const routing = ctx({
      preferredPublicHost: '',
      preferredAcmednsUrl: '',
    })
    expect(identityServerUrl('http://127.0.0.1', routing)).toBe(`https://${AUTH_ZONE}`)
  })

  test('uses http auth zone when TLS is not cert', () => {
    const routing = ctx({
      preferredPublicHost: '',
      preferredAcmednsUrl: '',
      authZoneTls: 'none',
    })
    expect(identityServerUrl('http://localhost', routing)).toBe(`http://${AUTH_ZONE}`)
  })

  test('returns cleaned loopback when no public identity exists', () => {
    const routing = ctx({
      authZoneHost: 'localhost',
      preferredPublicHost: '',
      preferredAcmednsUrl: '',
    })
    expect(identityServerUrl('http://127.0.0.1/', routing)).toBe('http://127.0.0.1')
  })
})

describe('resolveAcmeDnsBaseUrl', () => {
  test('prefers requested URL over fallback', () => {
    expect(resolveAcmeDnsBaseUrl('https://requested.example.test/', 'http://127.0.0.1'))
      .toBe('https://requested.example.test')
  })

  test('uses fallback when request is empty', () => {
    expect(resolveAcmeDnsBaseUrl(undefined, 'https://acme.public.example.test/'))
      .toBe('https://acme.public.example.test')
  })
})

describe('shouldUseInProcessUpdate', () => {
  test('uses in-process path for local bases', () => {
    const routing = ctx()
    expect(shouldUseInProcessUpdate('http://127.0.0.1', 'user-1', routing, () => false)).toBe(true)
  })

  test('uses in-process when public ACMEDNS_URL matches and account is local', () => {
    const routing = ctx()
    expect(
      shouldUseInProcessUpdate(
        `https://${PUBLIC_ACME}`,
        'user-1',
        routing,
        username => username === 'user-1',
      ),
    ).toBe(true)
  })

  test('uses in-process when public ACMEDNS_URL matches even without a local account', () => {
    const routing = ctx()
    expect(
      shouldUseInProcessUpdate(
        `https://${PUBLIC_ACME}`,
        'remote-user',
        routing,
        () => false,
      ),
    ).toBe(true)
  })

  test('uses remote update for unrelated external hosts', () => {
    const routing = ctx()
    expect(
      shouldUseInProcessUpdate(
        'https://other-acme.example.test',
        'user-1',
        routing,
        () => true,
      ),
    ).toBe(false)
  })
})
