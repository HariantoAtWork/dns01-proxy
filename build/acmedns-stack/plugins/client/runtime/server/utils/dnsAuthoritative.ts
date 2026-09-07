import type { DnsRecordGroup } from '#shared/types/clientstorage'
import type { DnsResolverOutcome } from '#shared/utils/dnsMatch'
import { getAcmeConfig, parseListenAddress } from '../../../../../server/utils/config'
import { dnsTcpQuery, dnsUdpQuery, type DnsUdpRecordType } from './dnsUdpQuery'

const BOOTSTRAP_RESOLVER = '1.1.1.1'
const QUERY_TIMEOUT_MS = 2000
const MAX_NAMESERVERS = 4

function stripDot(value: string) {
  return value.replace(/\.$/, '').toLowerCase()
}

/** True when `qname` is the auth zone or a name under it (e.g. uuid.auth.example). */
export function isNameUnderZone(qname: string, zone: string): boolean {
  const name = stripDot(qname)
  const auth = stripDot(zone)
  if (!name || !auth) {
    return false
  }
  return name === auth || name.endsWith(`.${auth}`)
}

function localDnsTarget(listen: string): string {
  const { host } = parseListenAddress(listen)
  if (host === '0.0.0.0' || host === '::' || host === '') {
    return '127.0.0.1'
  }
  if (host === '[::]') {
    return '::1'
  }
  return host
}

function thisStackAuthZone(): string | null {
  try {
    return stripDot(getAcmeConfig().general.domain)
  }
  catch {
    return null
  }
}

function thisStackLocalDnsTarget(): string | null {
  try {
    return localDnsTarget(getAcmeConfig().general.listen)
  }
  catch {
    return null
  }
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

/** One attempt: UDP first, then TCP only if UDP times out. */
export async function dnsQueryUdpThenTcp(
  name: string,
  type: DnsUdpRecordType,
  serverAddress: string,
  timeoutMs = QUERY_TIMEOUT_MS,
) {
  const udp = await dnsUdpQuery(name, type, serverAddress, timeoutMs)
  if (udp.lookup !== 'timeout') {
    return { ...udp, transport: 'udp' as const }
  }
  const tcp = await dnsTcpQuery(name, type, serverAddress, timeoutMs)
  return { ...tcp, transport: 'tcp' as const }
}

async function queryViaNameserver(
  name: string,
  type: string,
  nameserverHost: string,
  serverAddress: string,
): Promise<DnsResolverOutcome> {
  const recordType = type.toUpperCase()
  const label = `auth:${nameserverHost}`

  if (recordType !== 'CNAME' && recordType !== 'TXT') {
    return { server: label, records: [] as DnsRecordGroup[], lookup: 'timeout' }
  }

  const outcome = await dnsQueryUdpThenTcp(
    name,
    recordType as 'CNAME' | 'TXT',
    serverAddress,
  )
  return { server: label, records: outcome.records, lookup: outcome.lookup }
}

/**
 * Query authoritative DNS for a name.
 * Under this stack's auth zone: try local listen first (UDP→TCP), return early on success.
 * Otherwise walk public NS addresses one-by-one (each UDP→TCP), no parallel UDP/TCP pair.
 */
export async function queryAuthoritative(name: string, type: string): Promise<DnsResolverOutcome[]> {
  const authZone = thisStackAuthZone()
  const localTarget = thisStackLocalDnsTarget()

  if (authZone && localTarget && isNameUnderZone(name, authZone)) {
    const local = await queryViaNameserver(name, type, 'local', localTarget)
    if (local.lookup === 'ok') {
      return [local]
    }
    // Keep a failed/empty local result and continue to public NS (still sequential).
    const remotes = await queryRemoteAuthoritative(name, type, localTarget)
    return [local, ...remotes]
  }

  return queryRemoteAuthoritative(name, type, localTarget)
}

async function queryRemoteAuthoritative(
  name: string,
  type: string,
  localTarget: string | null,
): Promise<DnsResolverOutcome[]> {
  const nameservers = await findZoneNameservers(name)
  if (!nameservers.length) {
    return []
  }

  const outcomes: DnsResolverOutcome[] = []

  for (const host of nameservers) {
    const address = await resolveNameserverAddress(host)
    if (!address) {
      continue
    }
    if (localTarget && address === localTarget) {
      continue
    }
    const outcome = await queryViaNameserver(name, type, host, address)
    outcomes.push(outcome)
    if (outcome.lookup === 'ok') {
      break
    }
  }

  return outcomes
}
