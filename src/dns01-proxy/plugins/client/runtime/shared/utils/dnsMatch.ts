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
  /** Extra / multiple auth zones (this server + other Tiny Mode servers). */
  acceptUnderZones?: string[]
  /**
   * Accept when the CNAME’s first label matches the expected target’s first label
   * on another zone (e.g. `_mdstn-com_.auth.other` vs `_mdstn-com_.auth.local`).
   */
  acceptSameTinyLabel?: boolean
}

function resolvedAcceptZones(options?: CnameMatchOptions): string[] {
  const zones = [
    ...(options?.acceptUnderZones ?? []),
    ...(options?.acceptUnderZone ? [options.acceptUnderZone] : []),
  ]
    .map(normaliseDnsName)
    .filter(Boolean)
  return [...new Set(zones)]
}

function firstDnsLabel(fqdn: string): string {
  const host = normaliseDnsName(fqdn)
  if (!host) {
    return ''
  }
  return host.split('.')[0] || ''
}

function cnameTargetsUnderZones(outcomes: DnsResolverOutcome[], name: string, zones: string[]) {
  const wantedName = normaliseDnsName(name)
  const matches: string[] = []
  const zoneSet = zones.map(normaliseDnsName).filter(Boolean)

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
        if (zoneSet.some(zone => isNameUnderZone(target, zone))) {
          matches.push(target)
        }
      }
    }
  }

  return [...new Set(matches.map(normaliseDnsName))]
}

function cnameTargetsWithSameLabel(
  outcomes: DnsResolverOutcome[],
  name: string,
  expectedLabel: string,
) {
  const wantedName = normaliseDnsName(name)
  const label = normaliseDnsName(expectedLabel)
  if (!label) {
    return [] as string[]
  }
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
        const target = normaliseDnsName(String(entry))
        if (target && firstDnsLabel(target) === label) {
          matches.push(target)
        }
      }
    }
  }

  return [...new Set(matches)]
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

  const acceptZones = resolvedAcceptZones(options)
  if (acceptZones.length > 0) {
    const zoneTargets = cnameTargetsUnderZones(outcomes, name, acceptZones)
    if (zoneTargets.length > 0) {
      const matchingZones = outcomes.filter(
        outcome => outcome.lookup === 'ok'
          && outcome.records.some(group =>
            group.data.some(entry =>
              acceptZones.some(zone => isNameUnderZone(String(entry), zone)),
            ),
          ),
      )
      const pick = matchingZones[0] ?? outcomes.find(outcome => outcome.lookup === 'ok')!
      const label = pick.server.replace(/^auth:/, '')
      const zoneHint = acceptZones.length === 1
        ? acceptZones[0]
        : `${acceptZones.length} trusted auth zones`
      return {
        status: 'ok',
        actual: zoneTargets.join(', '),
        message: source === 'Authoritative'
          ? `Authoritative CNAME points to ${zoneHint} (${label})`
          : `CNAME points to ${zoneHint}`,
        matchedResolver: pick.server,
      }
    }
  }

  if (options?.acceptSameTinyLabel) {
    const expectedLabel = firstDnsLabel(expected)
    const sameLabelTargets = cnameTargetsWithSameLabel(outcomes, name, expectedLabel)
    if (sameLabelTargets.length > 0) {
      const pick = outcomes.find(outcome =>
        outcome.lookup === 'ok'
        && outcome.records.some(group =>
          group.data.some(entry => firstDnsLabel(String(entry)) === expectedLabel),
        ),
      ) ?? outcomes.find(outcome => outcome.lookup === 'ok')!
      const label = pick.server.replace(/^auth:/, '')
      return {
        status: 'ok',
        actual: sameLabelTargets.join(', '),
        message: source === 'Authoritative'
          ? `Authoritative CNAME shares Tiny label ${expectedLabel} on another auth zone (${label})`
          : `CNAME shares Tiny label ${expectedLabel} on another auth zone`,
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
  options?: CnameMatchOptions,
): DnsCnameMatchResult {
  const { authoritative, public: publicOutcomes } = splitResolverOutcomes(outcomes)

  if (authoritative.length > 0) {
    const authoritativeResult = evaluateCnameGroup(
      authoritative,
      name,
      expected,
      'Authoritative',
      authoritative.length,
      options,
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
    options,
  )

  return publicResult ?? {
    status: 'error',
    message: 'All resolver queries failed or timed out',
  }
}
