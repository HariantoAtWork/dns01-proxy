import type { DnsResolverOutcome } from './dnsMatch'
import { normaliseDnsName } from './dnsMatch'

export type ChallengeTxtProbeStatus = 'ok' | 'pending' | 'mismatch' | 'error'

export interface ChallengeTxtProbeResult {
  status: ChallengeTxtProbeStatus
  message: string
  actual?: string
}

export function normaliseTxtValue(value: string) {
  return value.replace(/^"|"$/g, '').trim()
}

export function collectTxtValues(outcomes: DnsResolverOutcome[]): string[] {
  return outcomes
    .filter(outcome => outcome.lookup === 'ok')
    .flatMap(outcome => outcome.records.flatMap(group => group.data.map(String)))
    .map(normaliseTxtValue)
    .filter(Boolean)
}

export function pickCnameTarget(outcomes: DnsResolverOutcome[]): string | null {
  for (const outcome of outcomes) {
    if (outcome.lookup !== 'ok' || !outcome.records.length) {
      continue
    }
    for (const group of outcome.records) {
      for (const entry of group.data) {
        const target = normaliseDnsName(String(entry))
        if (target) {
          return target
        }
      }
    }
  }
  return null
}

export function evaluateChallengeTxtProbe(
  txtOutcomes: DnsResolverOutcome[],
  cnameOutcomes: DnsResolverOutcome[],
  expectedTxt: string,
): ChallengeTxtProbeResult {
  const expected = normaliseTxtValue(expectedTxt)
  const txtValues = collectTxtValues(txtOutcomes)

  if (txtValues.some(value => value === expected)) {
    return { status: 'ok', message: 'dns-01 TXT visible online', actual: [...new Set(txtValues)].join(', ') }
  }

  if (txtValues.length > 0) {
    return {
      status: 'mismatch',
      actual: [...new Set(txtValues)].join(', '),
      message: `Expected dns-01 TXT ${expected}`,
    }
  }

  const cnameTarget = pickCnameTarget(cnameOutcomes)
  if (cnameTarget) {
    return {
      status: 'pending',
      message: `CNAME present; following to ${cnameTarget}`,
    }
  }

  const lookups = [...txtOutcomes, ...cnameOutcomes].map(outcome => outcome.lookup)
  if (lookups.every(lookup => lookup === 'nxdomain' || lookup === 'nodata')) {
    return {
      status: 'pending',
      message: 'dns-01 TXT not visible on authoritative nameservers yet',
    }
  }

  if (lookups.every(lookup => lookup === 'timeout')) {
    return {
      status: 'error',
      message: 'All authoritative nameserver queries failed or timed out',
    }
  }

  return {
    status: 'pending',
    message: 'dns-01 TXT not visible on authoritative nameservers yet',
  }
}

export function formatDns01TxtList(values: string[]) {
  if (!values.length) {
    return '(none)'
  }
  return [...new Set(values)].join(', ')
}

/** One-line summary for ACME activity logs. */
export function formatDns01ProbeLog(options: {
  challengeName: string
  leToken: string
  publishedToken: string
  hops: Array<{ qname: string, txtValues: string[], cnameTarget?: string }>
  attempt: number
  matched: boolean
}) {
  const hopParts = options.hops.map((hop) => {
    let part = `@ ${hop.qname} TXT ${formatDns01TxtList(hop.txtValues)}`
    if (hop.cnameTarget) {
      part += `; CNAME → ${hop.cnameTarget}`
    }
    return part
  })
  const match = options.matched ? 'match' : 'no match'
  return [
    `dns-01 probe ${options.challengeName} (attempt ${options.attempt}, ${match})`,
    `LE token: ${options.leToken}`,
    `published: ${options.publishedToken}`,
    `authoritative: ${hopParts.join(' | ') || '(no answers)'}`,
  ].join(' · ')
}
