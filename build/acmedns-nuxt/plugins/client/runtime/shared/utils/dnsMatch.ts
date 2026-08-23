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

export interface DnsTxtExistenceResult {
  status: 'ok' | 'nxdomain' | 'error'
  txtCount: number
  message: string
  matchedResolver?: string
}

/** Treat TXT ok or nodata as the name existing on public DNS. */
function evaluateTxtGroup(
  outcomes: DnsResolverOutcome[],
  source: ResolverSource,
  resolverCount = outcomes.length,
): DnsTxtExistenceResult | null {
  if (!outcomes.length) {
    return null
  }

  const existing = outcomes.filter(outcome => outcome.lookup === 'ok' || outcome.lookup === 'nodata')

  if (existing.length > 0) {
    const pick = existing.find(outcome => outcome.lookup === 'ok') ?? existing[0]!
    const txtCount = pick.records.reduce((count, group) => count + group.data.length, 0)
    const label = pick.server.replace(/^auth:/, '')
    return {
      status: 'ok',
      txtCount,
      message: txtCount > 0
        ? source === 'Authoritative'
          ? existing.length === 1
            ? `Fulldomain exists; authoritative DNS returns ${txtCount} TXT value(s) (${label}).`
            : `Fulldomain exists; authoritative DNS returns ${txtCount} TXT value(s) (${existing.length}/${resolverCount} nameservers).`
          : existing.length === 1
            ? `Fulldomain exists; public resolvers return ${txtCount} TXT value(s) (${pick.server}).`
            : `Fulldomain exists; public resolvers return ${txtCount} TXT value(s) (${existing.length}/${resolverCount} resolvers).`
        : source === 'Authoritative'
          ? existing.length === 1
            ? `Fulldomain exists on authoritative DNS (${label}); no TXT values yet — empty slots are fine.`
            : `Fulldomain exists on authoritative DNS (${existing.length}/${resolverCount} nameservers); no TXT values yet — empty slots are fine.`
          : existing.length === 1
            ? `Fulldomain exists on public DNS (${pick.server}); no TXT values yet — empty slots are fine.`
            : `Fulldomain exists on public DNS (${existing.length}/${resolverCount} resolvers); no TXT values yet — empty slots are fine.`,
      matchedResolver: pick.server,
    }
  }

  if (outcomes.every(outcome => outcome.lookup === 'nxdomain')) {
    return {
      status: 'nxdomain',
      txtCount: 0,
      message: source === 'Authoritative'
        ? 'NXDOMAIN on authoritative nameservers — that UUID is not on your acme-dns server.'
        : 'NXDOMAIN on all resolvers — that UUID is not on your acme-dns server.',
    }
  }

  return {
    status: 'error',
    txtCount: 0,
    message: source === 'Authoritative'
      ? 'All authoritative nameserver queries failed or timed out'
      : 'All resolver queries failed or timed out',
  }
}

export function evaluateTxtResolverOutcomes(
  outcomes: DnsResolverOutcome[],
  publicResolverCount = outcomes.length,
): DnsTxtExistenceResult {
  const { authoritative, public: publicOutcomes } = splitResolverOutcomes(outcomes)

  if (authoritative.length > 0) {
    const authoritativeResult = evaluateTxtGroup(authoritative, 'Authoritative', authoritative.length)
    if (authoritativeResult && authoritativeResult.status !== 'error') {
      return authoritativeResult
    }
  }

  const publicResult = evaluateTxtGroup(
    publicOutcomes.length ? publicOutcomes : outcomes,
    'Public',
    publicOutcomes.length ? publicResolverCount : outcomes.length,
  )

  return publicResult ?? {
    status: 'error',
    txtCount: 0,
    message: 'All resolver queries failed or timed out',
  }
}
