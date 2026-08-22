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

export function evaluateCnameResolverOutcomes(
  outcomes: DnsResolverOutcome[],
  name: string,
  expected: string,
  resolverCount = outcomes.length,
): DnsCnameMatchResult {
  const matching = outcomes.filter(
    outcome => outcome.lookup === 'ok' && matchDnsRecord(outcome.records, name, expected),
  )

  if (matching.length > 0) {
    const pick = matching[0]!
    return {
      status: 'ok',
      actual: pick.records.flatMap(group => group.data.map(String)).join(', '),
      message: matching.length === 1
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
        ? 'NXDOMAIN on all resolvers — no _acme-challenge name published yet'
        : 'No CNAME record on any resolver',
    }
  }

  return {
    status: 'error',
    message: 'All resolver queries failed or timed out',
  }
}
