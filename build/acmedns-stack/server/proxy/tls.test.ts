import { describe, expect, test } from 'bun:test'
import {
  certHasWildcardSanForPattern,
  fingerprintEdgeTls,
  sniHostnamesForDomain,
  type BunTlsEntry,
} from './tls'

describe('sniHostnamesForDomain', () => {
  test('returns exact domain as-is', () => {
    expect(sniHostnamesForDomain('Vault.Example.com.', ['*.example.com'])).toEqual([
      'vault.example.com',
    ])
  })

  test('expands wildcard to exact cert SANs that match', () => {
    expect(
      sniHostnamesForDomain('*.example.com', [
        '*.example.com',
        'app.example.com',
        'www.example.com',
        'other.org',
      ]),
    ).toEqual(['app.example.com', 'www.example.com'])
  })

  test('includes apex when present on a wildcard-only cert', () => {
    expect(
      sniHostnamesForDomain('*.uti.email', ['*.uti.email', 'uti.email']),
    ).toEqual(['uti.email'])
  })

  test('wildcard-only SAN without apex yields no exact SNI names', () => {
    expect(sniHostnamesForDomain('*.example.com', ['*.example.com'])).toEqual([])
  })
})

describe('certHasWildcardSanForPattern', () => {
  test('detects matching wildcard SAN', () => {
    expect(certHasWildcardSanForPattern('*.uti.email', ['*.uti.email', 'uti.email'])).toBe(true)
    expect(certHasWildcardSanForPattern('*.uti.email', ['uti.email'])).toBe(false)
    expect(certHasWildcardSanForPattern('derp.uti.email', ['*.uti.email'])).toBe(false)
  })
})

describe('fingerprintEdgeTls', () => {
  const entry = (serverName: string | undefined, cert: string, key: string): BunTlsEntry => ({
    serverName,
    cert,
    key,
  })

  test('null and empty are empty fingerprint', () => {
    expect(fingerprintEdgeTls(null)).toBe('')
    expect(fingerprintEdgeTls(undefined)).toBe('')
    expect(fingerprintEdgeTls([])).toBe('')
  })

  test('same material yields same fingerprint regardless of order', () => {
    const a = entry('b.example.com', 'cert-b', 'key-b')
    const b = entry('a.example.com', 'cert-a', 'key-a')
    expect(fingerprintEdgeTls([a, b])).toBe(fingerprintEdgeTls([b, a]))
  })

  test('single entry matches one-element array', () => {
    const one = entry(undefined, 'cert', 'key')
    expect(fingerprintEdgeTls(one)).toBe(fingerprintEdgeTls([one]))
  })

  test('cert or key change alters fingerprint', () => {
    const base = entry('app.example.com', 'cert', 'key')
    expect(fingerprintEdgeTls(base)).not.toBe(
      fingerprintEdgeTls(entry('app.example.com', 'cert-2', 'key')),
    )
    expect(fingerprintEdgeTls(base)).not.toBe(
      fingerprintEdgeTls(entry('app.example.com', 'cert', 'key-2')),
    )
  })

  test('serverName change alters fingerprint', () => {
    expect(fingerprintEdgeTls(entry('a.example.com', 'cert', 'key'))).not.toBe(
      fingerprintEdgeTls(entry('b.example.com', 'cert', 'key')),
    )
  })
})
