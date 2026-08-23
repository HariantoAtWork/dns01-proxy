import type { DnsRecordGroup } from '#shared/types/clientstorage'
import type { DnsResolverOutcome } from '#shared/utils/dnsMatch'
import { dnsUdpQuery } from './dnsUdpQuery'

const BOOTSTRAP_RESOLVER = '1.1.1.1'
const QUERY_TIMEOUT_MS = 2000
const MAX_NAMESERVERS = 4

function stripDot(value: string) {
  return value.replace(/\.$/, '').toLowerCase()
}

/** Walk labels upward until NS records are found for the zone. */
export async function findZoneNameservers(qname: string): Promise<string[]> {
  const host = stripDot(qname)
  const labels = host.split('.')

  for (let index = 0; index < labels.length - 1; index += 1) {
    const zone = labels.slice(index).join('.')
    const outcome = await dnsUdpQuery(zone, 'NS', BOOTSTRAP_RESOLVER, QUERY_TIMEOUT_MS)
    if (outcome.lookup === 'ok' && outcome.records[0]?.data.length) {
      return outcome.records[0].data.map(stripDot).slice(0, MAX_NAMESERVERS)
    }
  }

  return []
}

async function resolveNameserverAddress(host: string): Promise<string | null> {
  const outcome = await dnsUdpQuery(host, 'A', BOOTSTRAP_RESOLVER, QUERY_TIMEOUT_MS)
  if (outcome.lookup === 'ok' && outcome.records[0]?.data[0]) {
    return outcome.records[0].data[0]
  }
  return host.includes(':') ? host : null
}

async function queryViaNameserver(
  name: string,
  type: string,
  nameserverHost: string,
  serverAddress: string,
): Promise<DnsResolverOutcome> {
  const recordType = type.toUpperCase()
  const label = `auth:${nameserverHost}`

  if (recordType !== 'CNAME') {
    return { server: label, records: [] as DnsRecordGroup[], lookup: 'timeout' }
  }

  const outcome = await dnsUdpQuery(name, 'CNAME', serverAddress, QUERY_TIMEOUT_MS)
  return { server: label, ...outcome }
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
