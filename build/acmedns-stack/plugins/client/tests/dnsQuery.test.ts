import { describe, expect, test } from 'bun:test'
import { evaluateAuthoritativeCnameOutcomes, evaluateCnameResolverOutcomes } from '../runtime/shared/utils/dnsMatch'

describe('evaluateCnameResolverOutcomes', () => {
  const name = '_acme-challenge.example.com'
  const expected = 'uuid.auth.example.test'

  test('accepts when one resolver matches', () => {
    const result = evaluateCnameResolverOutcomes([
      { server: '1.1.1.1', lookup: 'nxdomain', records: [] },
      { server: '8.8.8.8', lookup: 'ok', records: [{ name, data: [expected] }] },
      { server: '8.8.4.4', lookup: 'timeout', records: [] },
    ], name, expected)

    expect(result.status).toBe('ok')
    expect(result.matchedResolver).toBe('8.8.8.8')
  })

  test('reports mismatch when resolvers disagree with expected target', () => {
    const result = evaluateCnameResolverOutcomes([
      { server: '1.1.1.1', lookup: 'ok', records: [{ name, data: ['wrong.target.test'] }] },
      { server: '8.8.8.8', lookup: 'ok', records: [{ name, data: ['other.target.test'] }] },
    ], name, expected)

    expect(result.status).toBe('mismatch')
    expect(result.actual).toContain('wrong.target.test')
  })

  test('reports missing when every resolver is empty', () => {
    const result = evaluateCnameResolverOutcomes([
      { server: '1.1.1.1', lookup: 'nxdomain', records: [] },
      { server: '8.8.8.8', lookup: 'nodata', records: [] },
    ], name, expected)

    expect(result.status).toBe('missing')
  })

  test('prefers authoritative match over stale public cache', () => {
    const result = evaluateCnameResolverOutcomes([
      { server: 'auth:ns1.cloudflare.com', lookup: 'ok', records: [{ name, data: [expected] }] },
      { server: '8.8.8.8', lookup: 'nxdomain', records: [] },
    ], name, expected)

    expect(result.status).toBe('ok')
    expect(result.message).toContain('Authoritative')
  })

  test('prefers authoritative mismatch over stale public cache', () => {
    const result = evaluateCnameResolverOutcomes([
      { server: 'auth:ns1.cloudflare.com', lookup: 'ok', records: [{ name, data: ['new.target.test'] }] },
      { server: '8.8.8.8', lookup: 'ok', records: [{ name, data: [expected] }] },
    ], name, expected)

    expect(result.status).toBe('mismatch')
  })
})

describe('evaluateAuthoritativeCnameOutcomes', () => {
  const name = '_acme-challenge.example.com'
  const expected = 'uuid.auth.example.test'

  test('reports error when no nameservers are found', () => {
    const result = evaluateAuthoritativeCnameOutcomes([], name, expected)
    expect(result.status).toBe('error')
    expect(result.message).toContain('authoritative nameservers')
  })

  test('accepts match from authoritative nameservers only', () => {
    const result = evaluateAuthoritativeCnameOutcomes([
      { server: 'auth:ns1.example.com', lookup: 'ok', records: [{ name, data: [expected] }] },
    ], name, expected)
    expect(result.status).toBe('ok')
    expect(result.message).toContain('Authoritative')
  })

  test('accepts any CNAME under auth zone in Tiny mode preflight', () => {
    const authZone = 'auth.uti.email'
    const alternate = '4181bcdd-8cbb-4477-805d-4c2c6ca0caa3.auth.uti.email'
    const result = evaluateAuthoritativeCnameOutcomes([
      { server: 'auth:ns1.example.com', lookup: 'ok', records: [{ name, data: [alternate] }] },
    ], name, '_sylo-space_.auth.uti.email', { acceptUnderZone: authZone })

    expect(result.status).toBe('ok')
    expect(result.actual).toContain(alternate)
    expect(result.message).toContain('auth zone')
  })

  test('still rejects CNAME outside auth zone in Tiny mode preflight', () => {
    const result = evaluateAuthoritativeCnameOutcomes([
      { server: 'auth:ns1.example.com', lookup: 'ok', records: [{ name, data: ['uuid.auth.acme-dns.io'] }] },
    ], name, '_sylo-space_.auth.uti.email', { acceptUnderZone: 'auth.uti.email' })

    expect(result.status).toBe('mismatch')
  })
})
