import type { DnsLookupKind, DnsRecordGroup } from '#shared/types/clientstorage'
import {
  evaluateCnameResolverOutcomes,
  type DnsCnameMatchResult,
  type DnsResolverOutcome,
} from '#shared/utils/dnsMatch'
import { dnsUdpQuery } from './dnsUdpQuery'

export const DNS_RESOLVERS = ['75.2.6.34', '1.1.1.1', '1.0.0.1', '8.8.8.8', '8.8.4.4']
const QUERY_TIMEOUT_MS = 2000

let currentAddressIndex = 0

function nextResolver() {
  const address = DNS_RESOLVERS[currentAddressIndex] ?? '1.1.1.1'
  currentAddressIndex = (currentAddressIndex + 1) % DNS_RESOLVERS.length
  return address
}

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

export async function dnsQueryCnameAnyMatch(name: string, expected: string): Promise<DnsCnameMatchResult> {
  const [authoritative, publicOutcomes] = await Promise.all([
    queryAuthoritative(name, 'CNAME'),
    queryAllResolvers(name, 'CNAME'),
  ])

  return evaluateCnameResolverOutcomes(
    [...authoritative, ...publicOutcomes],
    name,
    expected,
    DNS_RESOLVERS.length,
  )
}

export async function dnsQuery(name: string, type = 'CNAME'): Promise<DnsQueryOutcome> {
  return dnsQueryViaServer(name, type, nextResolver())
}
