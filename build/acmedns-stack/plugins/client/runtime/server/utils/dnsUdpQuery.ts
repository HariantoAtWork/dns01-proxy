import dns2 from 'dns2'
import type { DnsLookupKind, DnsRecordGroup } from '#shared/types/clientstorage'

const { UDPClient, TCPClient, Packet } = dns2

const RCODE_NOERROR = 0
const RCODE_NXDOMAIN = 3

export interface DnsUdpOutcome {
  records: DnsRecordGroup[]
  lookup: DnsLookupKind
}

/**
 * Query a resolver over UDP with dns2 so NOERROR/NODATA is not confused with
 * NXDOMAIN (Bun's node:dns maps empty answers to ENOTFOUND).
 */
export type DnsUdpRecordType = 'CNAME' | 'NS' | 'SOA' | 'A' | 'TXT'

function parseDnsResponse(
  name: string,
  type: DnsUdpRecordType,
  response: {
    header: { rcode: number }
    answers: Array<Record<string, unknown>>
  },
): DnsUdpOutcome {
  const rcode = response.header.rcode

  if (rcode === RCODE_NXDOMAIN) {
    return { records: [], lookup: 'nxdomain' }
  }

  if (rcode !== RCODE_NOERROR) {
    return { records: [], lookup: 'timeout' }
  }

  if (type === 'CNAME') {
    const data = response.answers
      .filter(answer => answer.type === Packet.TYPE.CNAME)
      .map(answer => String((answer as { domain?: string }).domain ?? '').replace(/\.$/, ''))
      .filter(Boolean)
    return data.length > 0
      ? { records: [{ name, data }], lookup: 'ok' }
      : { records: [], lookup: 'nodata' }
  }

  if (type === 'NS') {
    const data = response.answers
      .filter(answer => answer.type === Packet.TYPE.NS)
      .map(answer => String((answer as { ns?: string }).ns ?? '').replace(/\.$/, '').toLowerCase())
      .filter(Boolean)
    return data.length > 0
      ? { records: [{ name, data }], lookup: 'ok' }
      : { records: [], lookup: 'nodata' }
  }

  if (type === 'SOA') {
    const data = response.answers
      .filter(answer => answer.type === Packet.TYPE.SOA)
      .map(answer => String((answer as { primary?: string }).primary ?? '').replace(/\.$/, '').toLowerCase())
      .filter(Boolean)
    return data.length > 0
      ? { records: [{ name, data }], lookup: 'ok' }
      : { records: [], lookup: 'nodata' }
  }

  if (type === 'A') {
    const data = response.answers
      .filter(answer => answer.type === Packet.TYPE.A)
      .map(answer => String((answer as { address?: string }).address ?? ''))
      .filter(Boolean)
    return data.length > 0
      ? { records: [{ name, data }], lookup: 'ok' }
      : { records: [], lookup: 'nodata' }
  }

  if (type === 'TXT') {
    const data = response.answers
      .filter(answer => answer.type === Packet.TYPE.TXT)
      .flatMap((answer) => {
        const raw = (answer as { data?: string | string[] }).data
        if (Array.isArray(raw)) {
          return raw.map(String).filter(Boolean)
        }
        if (raw) {
          return [String(raw)]
        }
        return []
      })
    return data.length > 0
      ? { records: [{ name, data }], lookup: 'ok' }
      : { records: [], lookup: 'nodata' }
  }

  return { records: [], lookup: 'timeout' }
}

export async function dnsUdpQuery(
  name: string,
  type: DnsUdpRecordType,
  serverAddress: string,
  timeoutMs = 2000,
  options?: { retryOverTcp?: boolean },
): Promise<DnsUdpOutcome> {
  const resolve = UDPClient({
    dns: serverAddress,
    timeout: timeoutMs,
    // Large multi-TXT answers can exceed classic UDP 512B; dns2 can retry over TCP
    // when the response is truncated. Callers that want UDP-only pass retryOverTcp: false.
    retryOverTCP: options?.retryOverTcp ?? type === 'TXT',
  })

  try {
    const response = await resolve(name, type)
    return parseDnsResponse(name, type, response)
  }
  catch {
    return { records: [], lookup: 'timeout' }
  }
}

/** Same query semantics as {@link dnsUdpQuery}, forced over TCP/53. */
export async function dnsTcpQuery(
  name: string,
  type: DnsUdpRecordType,
  serverAddress: string,
  timeoutMs = 2000,
): Promise<DnsUdpOutcome> {
  const resolve = TCPClient({
    dns: serverAddress,
    timeout: timeoutMs,
  })

  try {
    const response = await resolve(name, type)
    return parseDnsResponse(name, type, response)
  }
  catch {
    return { records: [], lookup: 'timeout' }
  }
}
