import { Resolver } from 'node:dns/promises'
import type { DnsLookupKind, DnsRecordGroup } from '#shared/types/clientstorage'
import {
  evaluateCnameResolverOutcomes,
  type DnsCnameMatchResult,
  type DnsResolverOutcome,
} from '#shared/utils/dnsMatch'

export const DNS_RESOLVERS = ['75.2.6.34', '1.1.1.1', '1.0.0.1', '8.8.8.8', '8.8.4.4']
const QUERY_TIMEOUT_MS = 2000

let currentAddressIndex = 0

function nextResolver() {
  const address = DNS_RESOLVERS[currentAddressIndex] ?? '1.1.1.1'
  currentAddressIndex = (currentAddressIndex + 1) % DNS_RESOLVERS.length
  return address
}

function withTimeout<T>(promise: Promise<T>, label: string) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`Timeout in making request (${label})`)), QUERY_TIMEOUT_MS)
    }),
  ])
}

export interface DnsQueryOutcome {
  records: DnsRecordGroup[]
  lookup: DnsLookupKind
}

export type { DnsCnameMatchResult, DnsResolverOutcome }

function classifyEmpty(error: unknown): DnsLookupKind | null {
  const code = (error as NodeJS.ErrnoException).code
  if (code === 'ENOTFOUND') {
    return 'nxdomain'
  }
  if (code === 'ENODATA') {
    return 'nodata'
  }
  if (code === 'ETIMEOUT') {
    return 'timeout'
  }
  return null
}

async function dnsQueryViaServer(name: string, type: string, serverAddress: string): Promise<DnsQueryOutcome> {
  const resolver = new Resolver()
  resolver.setServers([serverAddress])

  const recordType = type.toUpperCase()
  const started = Date.now()

  try {
    if (recordType === 'CNAME') {
      const answers = await withTimeout(resolver.resolveCname(name), serverAddress)
      return { records: [{ name, data: answers }], lookup: 'ok' }
    }

    throw new Error(`Unsupported record type ${recordType}`)
  }
  catch (error) {
    const kind = classifyEmpty(error)
    if (kind) {
      return { records: [], lookup: kind }
    }
    throw error
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
