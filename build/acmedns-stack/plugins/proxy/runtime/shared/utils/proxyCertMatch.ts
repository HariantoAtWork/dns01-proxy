import {
  domainPatternMatchesHostname,
  isWildcardDomainName,
  normalizeDomainName,
  wildcardParentSuffix,
} from './proxyHost'

/** Slim cert row used for proxy SSL matching (leaf SANs from `/live/<name>/`). */
export interface ProxyCertCandidate {
  certName: string
  /** Leaf SANs read from live fullchain.pem — not domains.txt. */
  sans: string[]
  liveOnDisk?: boolean
  notAfter?: string
  status?: string
}

/** Stored on ProxyHost when SSL is on and certs are resolved per domain from live/. */
export const PROXY_SSL_AUTO = 'auto'

/**
 * One-label parent wildcard that covers an exact hostname when present on the cert.
 * `test.admin.harianto.dev` → `*.admin.harianto.dev` (not `*.harianto.dev`).
 */
export function coveringWildcardSanForHostname(
  hostname: string,
  certSans: string[],
): string | null {
  const name = normalizeDomainName(hostname)
  if (!name || isWildcardDomainName(name)) {
    return null
  }
  const labels = name.split('.')
  if (labels.length < 2) {
    return null
  }
  const parentWild = `*.${labels.slice(1).join('.')}`
  return certSans.some(san => normalizeDomainName(san) === parentWild)
    ? parentWild
    : null
}

/** True when the cert has a DNS SAN identical to the wildcard proxy pattern. */
export function certHasWildcardSanForPattern(pattern: string, certSans: string[]): boolean {
  const name = normalizeDomainName(pattern)
  if (!name || !isWildcardDomainName(name)) {
    return false
  }
  return certSans.some(san => normalizeDomainName(san) === name)
}

/**
 * Preferred Bun serverNames for one domain + covering cert (no server-only host scan).
 * Matches the hot path used when building edge SNI.
 */
export function preferredSniServerNamesForDomain(
  domain: string,
  certSans: string[],
): string[] {
  const pattern = normalizeDomainName(domain)
  if (!pattern) {
    return []
  }
  if (!isWildcardDomainName(pattern)) {
    const parentWild = coveringWildcardSanForHostname(pattern, certSans)
    if (parentWild) {
      return [parentWild]
    }
    return [pattern]
  }
  if (!certHasWildcardSanForPattern(pattern, certSans)) {
    return []
  }
  const names = [pattern]
  const apex = wildcardParentSuffix(pattern)
  if (apex && certSans.some(san => normalizeDomainName(san) === apex)) {
    names.push(apex)
  }
  return names
}

export type EdgeSslHostRow = {
  id?: string | null
  enabled?: boolean
  certificateName?: string | null
  domainNames: string[]
}

export type ActiveEdgeSslSummary = {
  /** domain → live cert name already bound on edge via other SSL hosts */
  byDomain: Record<string, string>
  certNames: string[]
  covered: number
  total: number
  fullyCovered: boolean
  uncoveredDomains: string[]
}

/**
 * Which covering leaf is already on :443 for these domains because other
 * SSL-enabled proxy hosts registered that SNI (zone/parent wildcard or exact).
 */
export function activeEdgeSslForDomains(
  domains: string[],
  otherHosts: EdgeSslHostRow[],
  candidates: ProxyCertCandidate[],
  excludeHostId?: string | null,
): ActiveEdgeSslSummary {
  const wanted = domains.map(normalizeDomainName).filter(Boolean)
  const active: Array<{ serverName: string, certName: string }> = []

  for (const host of otherHosts) {
    if (host.enabled === false) {
      continue
    }
    if (!host.certificateName) {
      continue
    }
    if (excludeHostId && host.id && host.id === excludeHostId) {
      continue
    }
    const hostDomains = (host.domainNames || []).map(normalizeDomainName).filter(Boolean)
    for (const domain of hostDomains) {
      const best = pickBestCertificateForDomain(candidates, domain, hostDomains)
      if (!best?.certName || best.liveOnDisk !== true) {
        continue
      }
      for (const serverName of preferredSniServerNamesForDomain(domain, best.sans)) {
        active.push({ serverName, certName: best.certName })
      }
    }
  }

  const byDomain: Record<string, string> = {}
  for (const domain of wanted) {
    const hit = active.find(entry =>
      entry.serverName === domain
      || domainPatternMatchesHostname(entry.serverName, domain),
    )
    if (hit) {
      byDomain[domain] = hit.certName
    }
  }

  const uncoveredDomains = wanted.filter(domain => !(domain in byDomain))
  const certNames = [...new Set(Object.values(byDomain))].sort()
  const covered = wanted.length - uncoveredDomains.length
  return {
    byDomain,
    certNames,
    covered,
    total: wanted.length,
    fullyCovered: wanted.length > 0 && uncoveredDomains.length === 0,
    uncoveredDomains,
  }
}

export type ProxySslAvailability = 'available' | 'some' | 'none'

export interface ProxySslCoverage {
  covered: number
  total: number
  availability: ProxySslAvailability
}

export interface ProxyDomainCertBinding {
  /** domain → live cert directory name */
  byDomain: Record<string, string>
  /** Unique live cert names used, sorted. */
  certNames: string[]
}

/**
 * Whether a certificate SAN covers a proxy domain pattern.
 * Exact domains match via one-label wildcard SANs; wildcard domains need an identical SAN.
 */
export function sanCoversDomain(san: string, domain: string): boolean {
  const s = normalizeDomainName(san)
  const d = normalizeDomainName(domain)
  if (!s || !d) {
    return false
  }
  if (isWildcardDomainName(d)) {
    return s === d
  }
  return domainPatternMatchesHostname(s, d)
}

export function certCoversDomain(sans: string[], domain: string): boolean {
  return sans.some(san => sanCoversDomain(san, domain))
}

export function sslCoverageForDomains(domainNames: string[], sans: string[]): ProxySslCoverage {
  const domains = domainNames.map(normalizeDomainName).filter(Boolean)
  const total = domains.length
  if (!total) {
    return { covered: 0, total: 0, availability: 'none' }
  }
  const covered = domains.filter(domain => certCoversDomain(sans, domain)).length
  if (covered === total) {
    return { covered, total, availability: 'available' }
  }
  if (covered > 0) {
    return { covered, total, availability: 'some' }
  }
  return { covered: 0, total, availability: 'none' }
}

/** Coverage when each domain may be served by a different live certificate. */
export function poolSslCoverage(
  domainNames: string[],
  candidates: ProxyCertCandidate[],
): ProxySslCoverage {
  const domains = domainNames.map(normalizeDomainName).filter(Boolean)
  const total = domains.length
  if (!total) {
    return { covered: 0, total: 0, availability: 'none' }
  }
  const live = candidates.filter(c => c.liveOnDisk === true && c.sans.length > 0)
  const covered = domains.filter(domain =>
    live.some(candidate => certCoversDomain(candidate.sans, domain)),
  ).length
  if (covered === total) {
    return { covered, total, availability: 'available' }
  }
  if (covered > 0) {
    return { covered, total, availability: 'some' }
  }
  return { covered: 0, total, availability: 'none' }
}

export function proxySslAvailabilityLabel(availability: ProxySslAvailability): string {
  switch (availability) {
    case 'available':
      return 'Available'
    case 'some':
      return 'Some available'
    default:
      return 'Not available'
  }
}

/** Traffic-light text class: green / orange / red. */
export function proxySslAvailabilityClass(availability: ProxySslAvailability): string {
  switch (availability) {
    case 'available':
      return 'text-live'
    case 'some':
      return 'text-signal'
    default:
      return 'text-danger'
  }
}

/**
 * SSL availability for a host’s domains against the live cert pool.
 * Independent of whether SSL is enabled on the host.
 */
export function proxyHostSslAvailability(
  _certificateName: string | null | undefined,
  domainNames: string[],
  candidates: ProxyCertCandidate[],
): ProxySslAvailability {
  return poolSslCoverage(domainNames, candidates).availability
}

function notAfterMs(value: string | undefined): number {
  if (!value) {
    return 0
  }
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : 0
}

/** Score a live cert for a single domain (must cover it). */
export function scoreCertForDomain(
  candidate: ProxyCertCandidate,
  domain: string,
  hostDomains: string[] = [],
): number {
  if (candidate.liveOnDisk !== true || !candidate.sans.length) {
    return -1
  }
  const d = normalizeDomainName(domain)
  if (!d || !certCoversDomain(candidate.sans, d)) {
    return -1
  }
  const peers = hostDomains.map(normalizeDomainName).filter(Boolean)
  const hostCovered = peers.length
    ? peers.filter(name => certCoversDomain(candidate.sans, name)).length
    : 1
  let score = hostCovered * 10_000
  if (candidate.status === 'ok') {
    score += 5_000
  }
  else if (candidate.status === 'drift') {
    score += 1_000
  }
  score += Math.min(notAfterMs(candidate.notAfter) / 1_000_000, 50_000)
  score -= Math.min(candidate.sans.length, 200)
  if (normalizeDomainName(candidate.certName) === d) {
    score += 50
  }
  return score
}

/** Best live certificate that covers one domain, or null. */
export function pickBestCertificateForDomain(
  candidates: ProxyCertCandidate[],
  domain: string,
  hostDomains: string[] = [],
): ProxyCertCandidate | null {
  const d = normalizeDomainName(domain)
  if (!d || !candidates.length) {
    return null
  }
  const peers = hostDomains.length ? hostDomains : [d]
  let best: ProxyCertCandidate | null = null
  let bestScore = -1
  for (const candidate of candidates) {
    const score = scoreCertForDomain(candidate, d, peers)
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }
  return bestScore >= 0 ? best : null
}

/**
 * Resolve a live certificate for every domain.
 * Returns null if any domain has no covering live cert (no partial / no domains.txt).
 * Prefers certs that cover more of the host’s domains (so one wildcard wins over a narrow exact).
 */
export function resolveCertificatesForDomains(
  domainNames: string[],
  candidates: ProxyCertCandidate[],
): ProxyDomainCertBinding | null {
  const domains = domainNames.map(normalizeDomainName).filter(Boolean)
  if (!domains.length) {
    return null
  }
  const byDomain: Record<string, string> = {}
  const used = new Set<string>()
  for (const domain of domains) {
    const best = pickBestCertificateForDomain(candidates, domain, domains)
    if (!best) {
      return null
    }
    byDomain[domain] = best.certName
    used.add(best.certName)
  }
  return {
    byDomain,
    certNames: [...used].sort(),
  }
}

/**
 * Single live cert that fully covers every domain, or null.
 * Multi-apex hosts need {@link resolveCertificatesForDomains} instead.
 */
export function pickBestCertificate(
  candidates: ProxyCertCandidate[],
  domainNames: string[],
): ProxyCertCandidate | null {
  const binding = resolveCertificatesForDomains(domainNames, candidates)
  if (!binding || binding.certNames.length !== 1) {
    return null
  }
  const name = binding.certNames[0]!
  return candidates.find(c => c.certName === name && c.liveOnDisk === true) ?? null
}

/** Display which live certs cover the domains (enable state lives in Flags). */
export function proxySslCertLabel(
  certificateName: string | null | undefined,
  domainNames: string[],
  candidates: ProxyCertCandidate[],
): string {
  const binding = resolveCertificatesForDomains(domainNames, candidates)
  if (binding?.certNames.length) {
    return binding.certNames.join(', ')
  }
  if (certificateName?.trim() && certificateName !== PROXY_SSL_AUTO) {
    return certificateName
  }
  return 'None'
}

/** Sort cert names with best match first for a single-domain hint (legacy). */
export function sortCertNamesForDomains(
  candidates: ProxyCertCandidate[],
  domainNames: string[],
): string[] {
  const primary = normalizeDomainName(domainNames[0] || '')
  return [...candidates]
    .map(entry => ({
      entry,
      score: primary ? scoreCertForDomain(entry, primary) : -1,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score
      }
      return a.entry.certName.localeCompare(b.entry.certName)
    })
    .map(item => item.entry.certName)
}
