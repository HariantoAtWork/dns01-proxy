import { describe, expect, test } from 'bun:test'
import {
  apexName,
  challengeZones,
  expandLine,
  findAccount,
  impliedParentWildcards,
  lineApex,
  storageCandidates,
} from '../shared/utils/domains'

const CREDS = {
  username: 'u',
  password: 'p',
  subdomain: 's',
  fulldomain: 's.example.test',
  server_url: 'http://acmedns-server',
}

describe('domains', () => {
  test('implied label parent', () => {
    expect(impliedParentWildcards('*.label.parent.mdstn.com')).toEqual(['*.parent.mdstn.com'])
  })

  test('implied fail label parent', () => {
    expect(impliedParentWildcards('*.fail.label.parent.mdstn.com')).toEqual([
      '*.parent.mdstn.com',
      '*.label.parent.mdstn.com',
    ])
  })

  test('expand dedupes root wildcard', () => {
    expect(expandLine([
      'mdstn.com',
      '*.mdstn.com',
      '*.label.parent.mdstn.com',
    ])).toEqual([
      'mdstn.com',
      '*.mdstn.com',
      '*.parent.mdstn.com',
      '*.label.parent.mdstn.com',
    ])
  })

  test('expand nested fail', () => {
    expect(expandLine([
      'mdstn.com',
      '*.mdstn.com',
      '*.fail.label.parent.mdstn.com',
    ])).toEqual([
      'mdstn.com',
      '*.mdstn.com',
      '*.parent.mdstn.com',
      '*.label.parent.mdstn.com',
      '*.fail.label.parent.mdstn.com',
    ])
  })

  test('storage walk reaches apex', () => {
    const storage = { 'mdstn.com': CREDS }
    const { key, account } = findAccount(storage, '*.admin.mdstn.com')
    expect(key).toBe('mdstn.com')
    expect(account).toEqual(CREDS)
  })

  test('storage walk specific key first', () => {
    const storage = {
      'mdstn.com': { ...CREDS, subdomain: 'root' },
      'admin.mdstn.com': CREDS,
    }
    const { key, account } = findAccount(storage, '*.admin.mdstn.com')
    expect(key).toBe('admin.mdstn.com')
    expect(account).toEqual(CREDS)
  })

  test('storage walk skips public acmedns.io', () => {
    const local = {
      username: 'local',
      password: 'p',
      subdomain: 'uuid-local',
      fulldomain: 'uuid-local.auth.uti.email',
      server_url: 'https://auth.uti.email',
    }
    const pub = {
      username: 'public',
      password: 'p',
      subdomain: 'uuid-public',
      fulldomain: 'uuid-public.auth.acme-dns.io',
      server_url: 'https://auth.acme-dns.io',
    }
    const storage = { 'oib.mdstn.com': pub, 'mdstn.com': local }
    const skipped: string[] = []
    const { key, account } = findAccount(
      storage,
      'oib.mdstn.com',
      'https://auth.uti.email',
      skipped,
    )
    expect(skipped).toEqual(['oib.mdstn.com'])
    expect(key).toBe('mdstn.com')
    expect(account).toEqual(local)
  })

  test('storage candidates order', () => {
    const keys = storageCandidates('*.fail.label.parent.mdstn.com')
    expect(keys[0]).toBe('*.fail.label.parent.mdstn.com')
    expect(keys).toContain('mdstn.com')
    expect(keys).not.toContain('com')
  })

  test('challenge zones unique', () => {
    expect(challengeZones([
      'mdstn.com',
      '*.mdstn.com',
      '*.oib.mdstn.com',
    ])).toEqual(['mdstn.com', 'oib.mdstn.com'])
  })

  test('apex name', () => {
    expect(apexName('*.admin.mdstn.com')).toBe('admin.mdstn.com')
    expect(apexName('mdstn.com')).toBe('mdstn.com')
  })

  test('line apex ignores order', () => {
    expect(lineApex(['*.oib.mdstn.com', '*.admin.mdstn.com', 'mdstn.com'])).toBe('mdstn.com')
    expect(lineApex(['mdstn.com', '*.oib.mdstn.com'])).toBe('mdstn.com')
  })

  test('expand shuffled line is stable', () => {
    const shuffled = ['*.oib.mdstn.com', '*.admin.mdstn.com', 'mdstn.com']
    const written = ['mdstn.com', '*.admin.mdstn.com', '*.oib.mdstn.com']
    expect(expandLine(shuffled)).toEqual(expandLine(written))
    expect(expandLine(shuffled)).toEqual([
      'mdstn.com',
      '*.admin.mdstn.com',
      '*.oib.mdstn.com',
    ])
    expect(lineApex(shuffled)).toBe(lineApex(written))
  })
})
