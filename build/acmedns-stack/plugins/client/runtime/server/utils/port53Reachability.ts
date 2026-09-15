import { getAcmeConfig, parseListenAddress } from '../../../../../server/utils/config'
import { envAcmednsPublicIp, envAcmednsPublicIpv6 } from '../../../../../core/env'
import type { PublicIpAddress } from '#shared/types/network'
import {
  port53ProbeFromLookup,
  summarizePort53Reachability,
  type Port53DelegationCheck,
  type Port53Probe,
  type Port53Reachability,
} from '#shared/utils/port53Reachability'
import { normalizeZoneFqdn } from '#shared/utils/glueRecords'
import { dnsTcpQuery, dnsUdpQuery, type DnsUdpRecordType } from './dnsUdpQuery'
import { lookupHostPublicIps } from './publicIps'

const BOOTSTRAP_RESOLVER = '1.1.1.1'
const PROBE_TIMEOUT_MS = 2500
const AUTH_ZONE_TYPES: DnsUdpRecordType[] = ['NS', 'SOA']

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

function glueAddressesFromConfig(records: string[], authZone: string) {
  const zone = normalizeZoneFqdn(authZone)
  const ipv4: string[] = []
  const ipv6: string[] = []

  for (const raw of records) {
    const parts = raw.trim().split(/\s+/)
    if (parts.length < 3) {
      continue
    }
    const name = normalizeZoneFqdn(parts[0]!)
    const type = parts[1]!.toUpperCase()
    const value = parts.slice(2).join(' ').trim()
    if (name !== zone) {
      continue
    }
    if (type === 'A') {
      ipv4.push(value)
    }
    if (type === 'AAAA') {
      ipv6.push(value)
    }
  }

  return { ipv4, ipv6 }
}

function uniqueTargets(items: Array<{ address: string, label: string }>) {
  const seen = new Set<string>()
  const out: Array<{ address: string, label: string }> = []
  for (const item of items) {
    if (seen.has(item.address)) {
      continue
    }
    seen.add(item.address)
    out.push(item)
  }
  return out
}

async function probeAuthZoneAt(
  serverAddress: string,
  authZone: string,
  label: string,
): Promise<Port53Probe> {
  const zone = normalizeZoneFqdn(authZone)
  let lastLookup: 'ok' | 'nxdomain' | 'nodata' | 'timeout' = 'timeout'
  let transport: 'udp' | 'tcp' = 'udp'

  for (const type of AUTH_ZONE_TYPES) {
    const udp = await dnsUdpQuery(zone, type, serverAddress, PROBE_TIMEOUT_MS)
    lastLookup = udp.lookup
    if (udp.lookup === 'ok') {
      return port53ProbeFromLookup('ok', serverAddress, label, 'udp')
    }
    if (udp.lookup === 'nxdomain') {
      return port53ProbeFromLookup('nxdomain', serverAddress, label, 'udp')
    }
  }

  transport = 'tcp'
  for (const type of AUTH_ZONE_TYPES) {
    const tcp = await dnsTcpQuery(zone, type, serverAddress, PROBE_TIMEOUT_MS)
    lastLookup = tcp.lookup
    if (tcp.lookup === 'ok') {
      return port53ProbeFromLookup('ok', serverAddress, label, 'tcp')
    }
    if (tcp.lookup === 'nxdomain') {
      return port53ProbeFromLookup('nxdomain', serverAddress, label, 'tcp')
    }
  }

  return port53ProbeFromLookup(lastLookup, serverAddress, label, transport)
}

async function resolveNameserverAddresses(nameservers: string[]): Promise<string[]> {
  const addresses = await Promise.all(nameservers.map(async (host) => {
    const ipv4 = await dnsUdpQuery(host, 'A', BOOTSTRAP_RESOLVER, PROBE_TIMEOUT_MS)
    if (ipv4.lookup === 'ok' && ipv4.records[0]?.data[0]) {
      return ipv4.records[0].data[0]
    }
    const ipv6 = await dnsUdpQuery(host, 'AAAA', BOOTSTRAP_RESOLVER, PROBE_TIMEOUT_MS)
    if (ipv6.lookup === 'ok' && ipv6.records[0]?.data[0]) {
      return ipv6.records[0].data[0]
    }
    return null
  }))

  return [...new Set(addresses.filter((item): item is string => Boolean(item)))]
}

async function delegationCheck(
  authZone: string,
  hostIpSet: Set<string>,
): Promise<Port53DelegationCheck | null> {
  const zone = normalizeZoneFqdn(authZone)
  const parentOutcome = await dnsUdpQuery(zone, 'NS', BOOTSTRAP_RESOLVER, PROBE_TIMEOUT_MS)
  if (parentOutcome.lookup !== 'ok' || !parentOutcome.records[0]?.data.length) {
    return null
  }

  const nameservers = parentOutcome.records[0].data.map(item => normalizeZoneFqdn(item))
  const addresses = await resolveNameserverAddresses(nameservers)
  if (!addresses.length) {
    return {
      nameservers,
      addresses: [],
      matchesHostIp: false,
      probes: [],
    }
  }

  const matchesHostIp = addresses.some(address => hostIpSet.has(address))
  const probes = await Promise.all(
    addresses.map(address => probeAuthZoneAt(address, authZone, `delegated ${address}`)),
  )

  return {
    nameservers,
    addresses,
    matchesHostIp,
    probes,
  }
}

export async function lookupPort53Reachability(options?: {
  forcePublicIp?: boolean
  host?: PublicIpAddress[]
}): Promise<Port53Reachability> {
  const config = getAcmeConfig()
  const authZone = normalizeZoneFqdn(config.general.domain)
  const host = options?.host ?? await lookupHostPublicIps(options?.forcePublicIp === true)

  const glue = glueAddressesFromConfig(config.general.records, authZone)
  const pinnedIpv4 = envAcmednsPublicIp()
  const pinnedIpv6 = envAcmednsPublicIpv6()
  const hostAddresses = new Set(host.map(item => item.address))

  const hostPublicTargets = uniqueTargets(
    host.map(item => ({ address: item.address, label: `public ${item.address}` })),
  )

  const configuredTargets = uniqueTargets([
    ...(pinnedIpv4 && !hostAddresses.has(pinnedIpv4)
      ? [{ address: pinnedIpv4, label: `configured ${pinnedIpv4}` }]
      : []),
    ...(pinnedIpv6 && !hostAddresses.has(pinnedIpv6)
      ? [{ address: pinnedIpv6, label: `configured ${pinnedIpv6}` }]
      : []),
    ...glue.ipv4
      .filter(address => !hostAddresses.has(address))
      .map(address => ({ address, label: `glue A ${address}` })),
    ...glue.ipv6
      .filter(address => !hostAddresses.has(address))
      .map(address => ({ address, label: `glue AAAA ${address}` })),
  ])

  const hostIpSet = new Set([
    ...hostPublicTargets.map(item => item.address),
    ...configuredTargets.map(item => item.address),
  ])

  const localTarget = localDnsTarget(config.general.listen)

  const [local, hostPublic, configured, delegation] = await Promise.all([
    probeAuthZoneAt(localTarget, authZone, 'this container'),
    Promise.all(hostPublicTargets.map(item => probeAuthZoneAt(item.address, authZone, item.label))),
    Promise.all(configuredTargets.map(item => probeAuthZoneAt(item.address, authZone, item.label))),
    delegationCheck(authZone, hostIpSet),
  ])

  return summarizePort53Reachability({
    authZone,
    local,
    hostPublic,
    configured,
    delegation,
  })
}
