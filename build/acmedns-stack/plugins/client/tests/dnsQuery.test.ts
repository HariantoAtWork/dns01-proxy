import { describe, expect, test } from 'bun:test'
import { evaluateCnameResolverOutcomes } from '../shared/utils/dnsMatch'

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
