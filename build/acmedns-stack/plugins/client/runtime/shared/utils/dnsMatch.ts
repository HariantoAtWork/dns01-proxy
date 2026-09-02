import type { DnsLookupKind, DnsRecordGroup } from '#shared/types/clientstorage'

export function normaliseDnsName(value: string) {
  return value.trim().replace(/\.$/, '').toLowerCase()
}

/** True when `name` is `zone` or a subdomain of it. */
export function isNameUnderZone(name: string, zone: string) {
  const host = normaliseDnsName(name)
  const apex = normaliseDnsName(zone)
  if (!host || !apex) {
    return false
  }
  return host === apex || host.endsWith(`.${apex}`)
}

export function matchDnsRecord(
  records: DnsRecordGroup[] | undefined,
  name: string,
  matchData: string,
) {
  if (!Array.isArray(records)) {
    return false
  }

  const wantedName = normaliseDnsName(name)
  const wantedTarget = normaliseDnsName(matchData)
  const group = records.find(record => normaliseDnsName(record.name) === wantedName)

  if (!group?.data?.length) {
    return false
  }

  return group.data.some(entry => normaliseDnsName(String(entry)) === wantedTarget)
}

export interface DnsCnameMatchResult {
  status: 'ok' | 'missing' | 'mismatch' | 'error'
  actual?: string
  message: string
  matchedResolver?: string
}

export interface DnsResolverOutcome {
  server: string
  lookup: DnsLookupKind
  records: DnsRecordGroup[]
}

export interface CnameMatchOptions {
  /** Tiny mode: accept any CNAME target under this auth zone (not only the exact expected label). */
  acceptUnderZone?: string
}

function cnameTargetsUnderZone(outcomes: DnsResolverOutcome[], name: string, zone: string) {
  const wantedName = normaliseDnsName(name)
  const matches: string[] = []

  for (const outcome of outcomes) {
    if (outcome.lookup !== 'ok') {
      continue
    }
    for (const group of outcome.records) {
      if (normaliseDnsName(group.name) !== wantedName) {
        continue
      }
      for (const entry of group.data) {
        const target = String(entry)
        if (isNameUnderZone(target, zone)) {
          matches.push(target)
        }
      }
    }
  }

  return [...new Set(matches.map(normaliseDnsName))]
}

type ResolverSource = 'Authoritative' | 'Public'

function evaluateCnameGroup(
  outcomes: DnsResolverOutcome[],
  name: string,
  expected: string,
  source: ResolverSource,
  resolverCount = outcomes.length,
  options?: CnameMatchOptions,
): DnsCnameMatchResult | null {
  if (!outcomes.length) {
    return null
  }

  const matching = outcomes.filter(
    outcome => outcome.lookup === 'ok' && matchDnsRecord(outcome.records, name, expected),
  )

  if (matching.length > 0) {
    const pick = matching[0]!
    const label = pick.server.replace(/^auth:/, '')
    return {
      status: 'ok',
      actual: pick.records.flatMap(group => group.data.map(String)).join(', '),
      message: source === 'Authoritative'
        ? matching.length === 1
          ? `Authoritative CNAME matches (${label})`
          : `Authoritative CNAME matches (${matching.length}/${resolverCount} nameservers)`
        : matching.length === 1
          ? `Public CNAME matches (${pick.server})`
          : `Public CNAME matches (${matching.length}/${resolverCount} resolvers)`,
      matchedResolver: pick.server,
    }
  }

  if (options?.acceptUnderZone) {
    const zoneTargets = cnameTargetsUnderZone(outcomes, name, options.acceptUnderZone)
    if (zoneTargets.length > 0) {
      const matching = outcomes.filter(
        outcome => outcome.lookup === 'ok'
          && outcome.records.some(group =>
            group.data.some(entry => isNameUnderZone(String(entry), options.acceptUnderZone!)),
          ),
      )
      const pick = matching[0] ?? outcomes.find(outcome => outcome.lookup === 'ok')!
      const label = pick.server.replace(/^auth:/, '')
      return {
        status: 'ok',
        actual: zoneTargets.join(', '),
        message: source === 'Authoritative'
          ? `Authoritative CNAME points to auth zone ${options.acceptUnderZone} (${label})`
          : `CNAME points to auth zone ${options.acceptUnderZone}`,
        matchedResolver: pick.server,
      }
    }
  }

  const withData = outcomes.filter(outcome => outcome.lookup === 'ok' && outcome.records.length > 0)
  if (withData.length > 0) {
    const actual = [...new Set(withData.flatMap(outcome =>
      outcome.records.flatMap(group => group.data.map(String)),
    ))].join(', ')
    return {
      status: 'mismatch',
      actual,
      message: `Expected CNAME → ${expected}`,
    }
  }

  if (outcomes.every(outcome => outcome.lookup === 'nxdomain' || outcome.lookup === 'nodata')) {
    return {
      status: 'missing',
      message: outcomes.some(outcome => outcome.lookup === 'nxdomain')
        ? `NXDOMAIN on all ${source.toLowerCase()} ${source === 'Authoritative' ? 'nameservers' : 'resolvers'} — no _acme-challenge name published yet`
        : `No CNAME record on any ${source.toLowerCase()} ${source === 'Authoritative' ? 'nameserver' : 'resolver'}`,
    }
  }

  return {
    status: 'error',
    message: source === 'Authoritative'
      ? 'All authoritative nameserver queries failed or timed out'
      : 'All resolver queries failed or timed out',
  }
}

/** LE-style check: authoritative nameservers only (no public-recursor cache). */
export function evaluateAuthoritativeCnameOutcomes(
  outcomes: DnsResolverOutcome[],
  name: string,
  expected: string,
  options?: CnameMatchOptions,
): DnsCnameMatchResult {
  if (!outcomes.length) {
    return {
      status: 'error',
      message: 'Could not find authoritative nameservers for this challenge name',
    }
  }

  return evaluateCnameGroup(outcomes, name, expected, 'Authoritative', outcomes.length, options) ?? {
    status: 'error',
    message: 'All authoritative nameserver queries failed or timed out',
  }
}

function isAuthoritativeOutcome(outcome: DnsResolverOutcome) {
  return outcome.server.startsWith('auth:')
}

function splitResolverOutcomes(outcomes: DnsResolverOutcome[]) {
  return {
    authoritative: outcomes.filter(isAuthoritativeOutcome),
    public: outcomes.filter(outcome => !isAuthoritativeOutcome(outcome)),
  }
}

export function evaluateCnameResolverOutcomes(
  outcomes: DnsResolverOutcome[],
  name: string,
  expected: string,
  publicResolverCount = outcomes.length,
): DnsCnameMatchResult {
  const { authoritative, public: publicOutcomes } = splitResolverOutcomes(outcomes)

  if (authoritative.length > 0) {
    const authoritativeResult = evaluateCnameGroup(
      authoritative,
      name,
      expected,
      'Authoritative',
      authoritative.length,
    )
    if (authoritativeResult && authoritativeResult.status !== 'error') {
      return authoritativeResult
    }
  }

  const publicResult = evaluateCnameGroup(
    publicOutcomes.length ? publicOutcomes : outcomes,
    name,
    expected,
    'Public',
    publicOutcomes.length ? publicResolverCount : outcomes.length,
  )

  return publicResult ?? {
    status: 'error',
    message: 'All resolver queries failed or timed out',
  }
}
