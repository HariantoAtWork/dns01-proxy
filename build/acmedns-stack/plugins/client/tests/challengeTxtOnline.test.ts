import { describe, expect, test } from 'bun:test'
import {
  collectTxtValues,
  evaluateChallengeTxtProbe,
  normaliseTxtValue,
  pickCnameTarget,
} from '../runtime/shared/utils/challengeTxtProbe'

describe('challengeTxtOnline', () => {
  const expected = 'abcdefghijklmnopqrstuvwxyz0123456789abcdefg'

  test('normaliseTxtValue strips surrounding quotes', () => {
    expect(normaliseTxtValue('"abc"')).toBe('abc')
  })

  test('accepts matching TXT on authoritative nameservers', () => {
    const result = evaluateChallengeTxtProbe(
      [{ server: 'auth:ns1.example.com', lookup: 'ok', records: [{ name: '_acme-challenge.example.com', data: [expected] }] }],
      [],
      expected,
    )
    expect(result.status).toBe('ok')
  })

  test('reports mismatch when TXT differs', () => {
    const result = evaluateChallengeTxtProbe(
      [{ server: 'auth:ns1.example.com', lookup: 'ok', records: [{ name: 'uuid.auth.example.test', data: ['wrong-value'] }] }],
      [],
      expected,
    )
    expect(result.status).toBe('mismatch')
    expect(result.actual).toBe('wrong-value')
  })

  test('reports pending when only CNAME is present', () => {
    const result = evaluateChallengeTxtProbe(
      [{ server: 'auth:ns1.example.com', lookup: 'nodata', records: [] }],
      [{ server: 'auth:ns1.example.com', lookup: 'ok', records: [{ name: '_acme-challenge.example.com', data: ['uuid.auth.example.test'] }] }],
      expected,
    )
    expect(result.status).toBe('pending')
    expect(result.message).toContain('uuid.auth.example.test')
  })

  test('collectTxtValues flattens multiple TXT strings', () => {
    const values = collectTxtValues([
      { server: 'auth:ns1.example.com', lookup: 'ok', records: [{ name: 'x', data: ['part-a', 'part-b'] }] },
    ])
    expect(values).toEqual(['part-a', 'part-b'])
  })

  test('pickCnameTarget returns first CNAME target', () => {
    const target = pickCnameTarget([
      { server: 'auth:ns1.example.com', lookup: 'ok', records: [{ name: '_acme-challenge.oib.example.com', data: ['_acme-challenge.example.com'] }] },
    ])
    expect(target).toBe('_acme-challenge.example.com')
  })
})
