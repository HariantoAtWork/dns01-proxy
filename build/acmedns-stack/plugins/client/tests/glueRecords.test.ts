import { describe, expect, test } from 'bun:test'
import {
  PLACEHOLDER_PUBLIC_IPV4,
  authZoneGlueRecords,
  formatGlueRecordLog,
  glueRecordsMatchDomain,
  recordsEqual,
  recordsUsePlaceholderIp,
} from '../runtime/shared/utils/glueRecords'

describe('glueRecords', () => {
  test('builds apex A, NS, and SOA glue for auth zone', () => {
    expect(authZoneGlueRecords('auth.uti.email', '203.0.113.10', undefined, 'hostmaster@uti.email')).toEqual([
      'auth.uti.email. SOA auth.uti.email. hostmaster.uti.email. 1 28800 7200 604800 86400',
      'auth.uti.email. A 203.0.113.10',
      'auth.uti.email. NS auth.uti.email.',
    ])
  })

  test('adds AAAA when public IPv6 is available', () => {
    expect(authZoneGlueRecords('auth.uti.email', {
      ipv4: '203.0.113.10',
      ipv6: '2001:db8::1',
    }, undefined, 'admin.uti.email')).toEqual([
      'auth.uti.email. SOA auth.uti.email. admin.uti.email. 1 28800 7200 604800 86400',
      'auth.uti.email. A 203.0.113.10',
      'auth.uti.email. AAAA 2001:db8::1',
      'auth.uti.email. NS auth.uti.email.',
    ])
  })

  test('defaults SOA rname from zone when nsadmin omitted', () => {
    expect(authZoneGlueRecords('auth.uti.email', '203.0.113.10')).toEqual([
      'auth.uti.email. SOA auth.uti.email. hostmaster.auth.uti.email. 1 28800 7200 604800 86400',
      'auth.uti.email. A 203.0.113.10',
      'auth.uti.email. NS auth.uti.email.',
    ])
  })

  test('detects placeholder documentation IP', () => {
    expect(recordsUsePlaceholderIp([
      `auth.example.test. A ${PLACEHOLDER_PUBLIC_IPV4}`,
      'auth.example.test. NS auth.example.test.',
    ])).toBe(true)
  })

  test('glueRecordsMatchDomain requires expected address families and SOA', () => {
    const v4Only = authZoneGlueRecords('auth.uti.email', { ipv4: '203.0.113.10' }, undefined, 'hostmaster@uti.email')
    expect(glueRecordsMatchDomain(
      v4Only,
      'auth.uti.email',
      undefined,
      { ipv4: '203.0.113.10' },
      'hostmaster@uti.email',
    )).toBe(true)
    expect(glueRecordsMatchDomain(v4Only, 'auth.uti.email', undefined, {
      ipv4: '203.0.113.10',
      ipv6: '2001:db8::1',
    }, 'hostmaster@uti.email')).toBe(false)

    const dual = authZoneGlueRecords('auth.uti.email', {
      ipv4: '203.0.113.10',
      ipv6: '2001:db8::1',
    }, undefined, 'hostmaster@uti.email')
    expect(glueRecordsMatchDomain(dual, 'auth.uti.email', undefined, {
      ipv4: '203.0.113.10',
      ipv6: '2001:db8::1',
    }, 'hostmaster@uti.email')).toBe(true)

    const withoutSoa = dual.filter(line => !/\sSOA\s/i.test(line))
    expect(glueRecordsMatchDomain(withoutSoa, 'auth.uti.email', undefined, {
      ipv4: '203.0.113.10',
      ipv6: '2001:db8::1',
    }, 'hostmaster@uti.email')).toBe(false)
  })

  test('recordsEqual compares trimmed lines', () => {
    const left = authZoneGlueRecords('auth.uti.email', '1.2.3.4')
    const right = left.map(line => `  ${line}  `)
    expect(recordsEqual(left, right)).toBe(true)
  })

  test('formatGlueRecordLog lists A, AAAA, NS, and SOA', () => {
    expect(formatGlueRecordLog('auth.uti.email', {
      ipv4: '203.0.113.10',
      ipv6: '2001:db8::1',
    }, 'hostmaster@uti.email')).toBe(
      'auth.uti.email. SOA auth.uti.email. hostmaster.uti.email. ; auth.uti.email. A 203.0.113.10. ; auth.uti.email. AAAA 2001:db8::1. ; auth.uti.email. NS auth.uti.email.',
    )
  })
})
