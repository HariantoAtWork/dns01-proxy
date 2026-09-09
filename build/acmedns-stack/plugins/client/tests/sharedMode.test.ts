import { describe, expect, test } from 'bun:test'
import {
  authZoneTxtLabel,
  mergeSharedPublishSubdomains,
  parseTinyAcceptZones,
  tinyApexFulldomain,
  tinyApexLabel,
  tinyPreflightAcceptZones,
} from '../runtime/shared/utils/tinyModeDns'

describe('tinyApexLabel', () => {
  test('encodes apex with underscores and dashes', () => {
    expect(tinyApexLabel('mdstn.com')).toBe('_mdstn-com_')
    expect(tinyApexLabel('sylo.space')).toBe('_sylo-space_')
    expect(tinyApexLabel('MDSTN.COM.')).toBe('_mdstn-com_')
  })

  test('builds fulldomain under auth zone', () => {
    expect(tinyApexFulldomain('mdstn.com', 'auth.uti.email')).toBe('_mdstn-com_.auth.uti.email')
    expect(tinyApexFulldomain('sylo.space', 'auth.uti.email.')).toBe('_sylo-space_.auth.uti.email')
  })
})

describe('authZoneTxtLabel', () => {
  test('returns first label under auth zone', () => {
    expect(authZoneTxtLabel('uuid-here.auth.mdstn.com', 'auth.mdstn.com')).toBe('uuid-here')
    expect(authZoneTxtLabel('_mdstn-com_.auth.mdstn.com', 'auth.mdstn.com')).toBe('_mdstn-com_')
    expect(authZoneTxtLabel('blabla-random-stuff-here.auth.mdstn.com.', 'auth.mdstn.com')).toBe(
      'blabla-random-stuff-here',
    )
  })

  test('returns zone apex key and rejects foreign names', () => {
    expect(authZoneTxtLabel('auth.mdstn.com', 'auth.mdstn.com')).toBe('auth')
    expect(authZoneTxtLabel('_acme-challenge.mdstn.com', 'auth.mdstn.com')).toBeNull()
    expect(authZoneTxtLabel('uuid.auth.other.com', 'auth.mdstn.com')).toBeNull()
  })
})

describe('mergeSharedPublishSubdomains', () => {
  test('always includes encoded apex and any live auth-zone CNAME labels', () => {
    expect(mergeSharedPublishSubdomains('mdstn.com', 'auth.mdstn.com', [])).toEqual(['_mdstn-com_'])
    expect(mergeSharedPublishSubdomains('mdstn.com', 'auth.mdstn.com', [
      'old-uuid.auth.mdstn.com',
      '_mdstn-com_.auth.mdstn.com',
    ])).toEqual(['_mdstn-com_', 'old-uuid'])
  })
})

describe('tinyPreflightAcceptZones', () => {
  test('includes local zone and parsed remote Tiny auth zones', () => {
    expect(tinyPreflightAcceptZones('auth.uti.email', 'auth.vps.test, auth.nas.test')).toEqual([
      'auth.uti.email',
      'auth.vps.test',
      'auth.nas.test',
    ])
    expect(parseTinyAcceptZones('auth.a.test;auth.b.test')).toEqual([
      'auth.a.test',
      'auth.b.test',
    ])
  })
})
