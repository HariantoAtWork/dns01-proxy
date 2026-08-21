import { Resolver } from 'node:dns/promises'
import type { DnsLookupKind, DnsRecordGroup } from '#shared/types/clientstorage'

const RESOLVERS = ['75.2.6.34', '1.1.1.1', '1.0.0.1', '8.8.8.8', '8.8.4.4']
const QUERY_TIMEOUT_MS = 2000

let currentAddressIndex = 0

function nextResolver() {
  const address = RESOLVERS[currentAddressIndex] ?? '1.1.1.1'
  currentAddressIndex = (currentAddressIndex + 1) % RESOLVERS.length
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

export async function dnsQuery(name: string, type = 'CNAME'): Promise<DnsQueryOutcome> {
  const resolver = new Resolver()
  const serverAddress = nextResolver()
  resolver.setServers([serverAddress])

  const recordType = type.toUpperCase()
  const started = Date.now()

  try {
    if (recordType === 'CNAME') {
      const answers = await withTimeout(resolver.resolveCname(name), serverAddress)
      return { records: [{ name, data: answers }], lookup: 'ok' }
    }

    if (recordType === 'TXT') {
      const answers = await withTimeout(resolver.resolveTxt(name), serverAddress)
      return {
        records: [{ name, data: answers.map(chunks => chunks.join('')) }],
        lookup: 'ok',
      }
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
