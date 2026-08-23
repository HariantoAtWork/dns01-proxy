import { Resolver } from 'node:dns/promises'
import type { DnsLookupKind, DnsRecordGroup } from '#shared/types/clientstorage'
import type { DnsResolverOutcome } from '#shared/utils/dnsMatch'

const BOOTSTRAP_RESOLVER = '1.1.1.1'
const QUERY_TIMEOUT_MS = 2000
const MAX_NAMESERVERS = 4

function stripDot(value: string) {
  return value.replace(/\.$/, '').toLowerCase()
}

function withTimeout<T>(promise: Promise<T>, label: string) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`Timeout (${label})`)), QUERY_TIMEOUT_MS)
    }),
  ])
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

function bootstrapResolver() {
  const resolver = new Resolver()
  resolver.setServers([BOOTSTRAP_RESOLVER])
  return resolver
}

/** Walk labels upward until NS records are found for the zone. */
export async function findZoneNameservers(qname: string): Promise<string[]> {
  const host = stripDot(qname)
  const labels = host.split('.')
  const resolver = bootstrapResolver()

  for (let index = 0; index < labels.length - 1; index += 1) {
    const zone = labels.slice(index).join('.')
    try {
      const nameservers = await withTimeout(resolver.resolveNs(zone), zone)
      if (nameservers.length) {
        return nameservers.map(stripDot).slice(0, MAX_NAMESERVERS)
      }
    }
    catch {
      // try parent zone
    }
  }

  return []
}

async function resolveNameserverAddress(host: string): Promise<string | null> {
  const resolver = bootstrapResolver()
  try {
    const ipv4 = await withTimeout(resolver.resolve4(host), host)
    return ipv4[0] ?? null
  }
  catch {
    return host.includes(':') ? host : null
  }
}

async function queryViaNameserver(
  name: string,
  type: string,
  nameserverHost: string,
  serverAddress: string,
): Promise<DnsResolverOutcome> {
  const resolver = new Resolver()
  resolver.setServers([serverAddress])
  const recordType = type.toUpperCase()
  const label = `auth:${nameserverHost}`

  try {
    if (recordType === 'CNAME') {
      const answers = await withTimeout(resolver.resolveCname(name), label)
      return { server: label, records: [{ name, data: answers }], lookup: 'ok' }
    }

    if (recordType === 'TXT') {
      const answers = await withTimeout(resolver.resolveTxt(name), label)
      return {
        server: label,
        records: [{ name, data: answers.map(chunks => chunks.join('')) }],
        lookup: 'ok',
      }
    }

    throw new Error(`Unsupported record type ${recordType}`)
  }
  catch (error) {
    const kind = classifyEmpty(error)
    if (kind) {
      return { server: label, records: [], lookup: kind }
    }
    return { server: label, records: [] as DnsRecordGroup[], lookup: 'timeout' }
  }
}

/** Query the zone's authoritative nameservers directly (no public-recursor cache). */
export async function queryAuthoritative(name: string, type: string): Promise<DnsResolverOutcome[]> {
  const nameservers = await findZoneNameservers(name)
  if (!nameservers.length) {
    return []
  }

  const targets = await Promise.all(nameservers.map(async (host) => {
    const address = await resolveNameserverAddress(host)
    return address ? { host, address } : null
  }))

  return Promise.all(
    targets
      .filter((target): target is { host: string, address: string } => target !== null)
      .map(target => queryViaNameserver(name, type, target.host, target.address)),
  )
}
