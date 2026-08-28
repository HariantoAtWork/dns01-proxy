import type { DnsLookupKind, DnsRecordGroup } from '#shared/types/clientstorage'
import {
  evaluateAuthoritativeCnameOutcomes,
  evaluateCnameResolverOutcomes,
  type DnsCnameMatchResult,
  type DnsResolverOutcome,
} from '#shared/utils/dnsMatch'
import { queryAuthoritative } from './dnsAuthoritative'
import { dnsUdpQuery } from './dnsUdpQuery'

/** Public recursors for UI recheck / propagation hints (not used for Apply preflight). */
export const DNS_RESOLVERS = ['1.1.1.1', '1.0.0.1', '8.8.8.8', '8.8.4.4']
const QUERY_TIMEOUT_MS = 2000

let currentAddressIndex = 0

function nextResolver() {
  const address = DNS_RESOLVERS[currentAddressIndex] ?? '1.1.1.1'
  currentAddressIndex = (currentAddressIndex + 1) % DNS_RESOLVERS.length
  return address
}

export type DnsCnameCheckMode = 'authoritative' | 'public' | 'any'

export interface DnsQueryOutcome {
  records: DnsRecordGroup[]
  lookup: DnsLookupKind
}

export type { DnsCnameMatchResult, DnsResolverOutcome }

async function dnsQueryViaServer(name: string, type: string, serverAddress: string): Promise<DnsQueryOutcome> {
  const recordType = type.toUpperCase()
  const started = Date.now()

  try {
    if (recordType === 'CNAME') {
      return await dnsUdpQuery(name, 'CNAME', serverAddress, QUERY_TIMEOUT_MS)
    }

    throw new Error(`Unsupported record type ${recordType}`)
  }
  finally {
    console.log(`Finished DNS ${recordType} via ${serverAddress}: ${Date.now() - started}ms`)
  }
}

async function queryAllResolvers(name: string, type: string): Promise<DnsResolverOutcome[]> {
  return Promise.all(
    DNS_RESOLVERS.map(async (server) => {
      try {
        const outcome = await dnsQueryViaServer(name, type, server)
        return { server, ...outcome }
      }
      catch {
        return {
          server,
          records: [] as DnsRecordGroup[],
          lookup: 'timeout' as DnsLookupKind,
        }
      }
    }),
  )
}

export async function dnsQueryCnameMatch(
  name: string,
  expected: string,
  mode: DnsCnameCheckMode = 'any',
): Promise<DnsCnameMatchResult> {
  if (mode === 'authoritative') {
    const authoritative = await queryAuthoritative(name, 'CNAME')
    return evaluateAuthoritativeCnameOutcomes(authoritative, name, expected)
  }

  const publicOutcomes = await queryAllResolvers(name, 'CNAME')

  if (mode === 'public') {
    const publicResult = evaluateCnameResolverOutcomes(publicOutcomes, name, expected, DNS_RESOLVERS.length)
    return publicResult
  }

  const authoritative = await queryAuthoritative(name, 'CNAME')
  return evaluateCnameResolverOutcomes(
    [...authoritative, ...publicOutcomes],
    name,
    expected,
    DNS_RESOLVERS.length,
  )
}

/** UI / save recheck — authoritative first, then public resolvers. */
export async function dnsQueryCnameAnyMatch(name: string, expected: string): Promise<DnsCnameMatchResult> {
  return dnsQueryCnameMatch(name, expected, 'any')
}

/** Apply preflight — authoritative NS only (same path Let's Encrypt uses for dns-01). */
export async function dnsQueryCnameAuthoritativeMatch(name: string, expected: string): Promise<DnsCnameMatchResult> {
  return dnsQueryCnameMatch(name, expected, 'authoritative')
}

export async function dnsQuery(name: string, type = 'CNAME'): Promise<DnsQueryOutcome> {
  return dnsQueryViaServer(name, type, nextResolver())
}
