import { describe, expect, test } from 'bun:test'
import {
  PROXY_SSL_AUTO,
  pickBestCertificate,
  poolSslCoverage,
  proxyHostSslAvailability,
  proxySslAvailabilityLabel,
  proxySslCertLabel,
  resolveCertificatesForDomains,
  sanCoversDomain,
  sslCoverageForDomains,
  type ProxyCertCandidate,
} from '../runtime/shared/utils/proxyCertMatch'

const live = (partial: Partial<ProxyCertCandidate> & Pick<ProxyCertCandidate, 'certName' | 'sans'>): ProxyCertCandidate => ({
  liveOnDisk: true,
  status: 'ok',
  notAfter: '2030-01-01T00:00:00.000Z',
  ...partial,
})

describe('sanCoversDomain', () => {
  test('exact and one-label wildcard SANs', () => {
    expect(sanCoversDomain('app.example.com', 'app.example.com')).toBe(true)
    expect(sanCoversDomain('*.example.com', 'app.example.com')).toBe(true)
    expect(sanCoversDomain('*.example.com', 'example.com')).toBe(false)
    expect(sanCoversDomain('*.example.com', '*.example.com')).toBe(true)
    expect(sanCoversDomain('app.example.com', '*.example.com')).toBe(false)
  })
})

describe('sslCoverageForDomains', () => {
  test('available / some / none', () => {
    expect(sslCoverageForDomains(
      ['a.example.com', 'b.example.com'],
      ['*.example.com'],
    ).availability).toBe('available')

    expect(sslCoverageForDomains(
      ['a.example.com', 'other.test'],
      ['*.example.com'],
    ).availability).toBe('some')

    expect(sslCoverageForDomains(
      ['a.example.com'],
      ['other.test'],
    ).availability).toBe('none')
  })
})

describe('resolveCertificatesForDomains', () => {
  test('uses multiple live certs across apexes', () => {
    const candidates = [
      live({ certName: 'harianto.dev', sans: ['harianto.dev', '*.harianto.dev'] }),
      live({ certName: 'mizu.work', sans: ['mizu.work', '*.mizu.work'] }),
    ]
    const domains = ['f.mizu.work', 'h.mizu.work', 'mail.harianto.dev', 'mail.mizu.work']
    expect(poolSslCoverage(domains, candidates).availability).toBe('available')
    const binding = resolveCertificatesForDomains(domains, candidates)
    expect(binding).not.toBeNull()
    expect(binding!.certNames).toEqual(['harianto.dev', 'mizu.work'])
    expect(binding!.byDomain['f.mizu.work']).toBe('mizu.work')
    expect(binding!.byDomain['h.mizu.work']).toBe('mizu.work')
    expect(binding!.byDomain['mail.mizu.work']).toBe('mizu.work')
    expect(binding!.byDomain['mail.harianto.dev']).toBe('harianto.dev')
    expect(proxyHostSslAvailability(PROXY_SSL_AUTO, domains, candidates)).toBe('available')
    expect(proxySslCertLabel(PROXY_SSL_AUTO, domains, candidates)).toBe('harianto.dev, mizu.work')
    // One cert cannot cover both apexes alone.
    expect(pickBestCertificate(candidates, domains)).toBeNull()
  })

  test('prefers full coverage from a single live cert when possible', () => {
    const candidates = [
      live({ certName: 'partial', sans: ['a.example.com'], notAfter: '2035-01-01T00:00:00.000Z' }),
      live({ certName: 'full-wild', sans: ['*.example.com'], notAfter: '2030-01-01T00:00:00.000Z' }),
      live({ certName: 'missing', sans: ['*.example.com'], liveOnDisk: false }),
    ]
    const best = pickBestCertificate(candidates, ['a.example.com', 'b.example.com'])
    expect(best?.certName).toBe('full-wild')
  })

  test('mizu.work + *.mizu.work covers f/h/mail.mizu.work', () => {
    const candidates = [
      live({ certName: 'mizu.work', sans: ['mizu.work', '*.mizu.work'] }),
    ]
    const domains = ['f.mizu.work', 'h.mizu.work', 'mail.mizu.work']
    expect(sslCoverageForDomains(domains, candidates[0]!.sans).availability).toBe('available')
    expect(pickBestCertificate(candidates, domains)?.certName).toBe('mizu.work')
    expect(sanCoversDomain('*.mizu.work', 'mail.mizuwork')).toBe(false)
  })

  test('returns null when any domain is uncovered', () => {
    expect(resolveCertificatesForDomains(
      ['a.example.com', 'b.example.com'],
      [live({ certName: 'partial', sans: ['a.example.com'] })],
    )).toBeNull()
  })
})

describe('proxyHostSslAvailability', () => {
  test('maps pool coverage whether SSL is enabled or not', () => {
    const candidates = [
      live({ certName: 'full', sans: ['*.example.com'] }),
      live({ certName: 'one', sans: ['a.example.com'] }),
    ]
    expect(proxyHostSslAvailability(null, ['a.example.com', 'b.example.com'], candidates)).toBe('available')
    expect(proxyHostSslAvailability(PROXY_SSL_AUTO, ['a.example.com', 'b.example.com'], candidates)).toBe('available')
    expect(proxyHostSslAvailability(null, ['a.example.com', 'other.test'], [candidates[1]!])).toBe('some')
    expect(proxyHostSslAvailability(null, ['missing.test'], candidates)).toBe('none')
  })

  test('labels', () => {
    expect(proxySslAvailabilityLabel('available')).toBe('Available')
    expect(proxySslAvailabilityLabel('some')).toBe('Some available')
    expect(proxySslAvailabilityLabel('none')).toBe('Not available')
  })
})
