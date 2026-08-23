import type { DnsLookupKind, DnsRecordGroup } from '#shared/types/clientstorage'

export function normaliseDnsName(value: string) {
  return value.trim().replace(/\.$/, '').toLowerCase()
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

function isAuthoritativeOutcome(outcome: DnsResolverOutcome) {
  return outcome.server.startsWith('auth:')
}

function splitResolverOutcomes(outcomes: DnsResolverOutcome[]) {
  return {
    authoritative: outcomes.filter(isAuthoritativeOutcome),
    public: outcomes.filter(outcome => !isAuthoritativeOutcome(outcome)),
  }
}

type ResolverSource = 'Authoritative' | 'Public'

function evaluateCnameGroup(
  outcomes: DnsResolverOutcome[],
  name: string,
  expected: string,
  source: ResolverSource,
  resolverCount = outcomes.length,
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
