import dns2 from 'dns2'
import type { DnsLookupKind, DnsRecordGroup } from '#shared/types/clientstorage'

const { UDPClient, Packet } = dns2

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
export async function dnsUdpQuery(
  name: string,
  type: 'CNAME' | 'NS' | 'A',
  serverAddress: string,
  timeoutMs = 2000,
): Promise<DnsUdpOutcome> {
  const resolve = UDPClient({
    dns: serverAddress,
    timeout: timeoutMs,
    retryOverTCP: false,
  })

  try {
    const response = await resolve(name, type)
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

    if (type === 'A') {
      const data = response.answers
        .filter(answer => answer.type === Packet.TYPE.A)
        .map(answer => String((answer as { address?: string }).address ?? ''))
        .filter(Boolean)
      return data.length > 0
        ? { records: [{ name, data }], lookup: 'ok' }
        : { records: [], lookup: 'nodata' }
    }

    return { records: [], lookup: 'timeout' }
  }
  catch {
    return { records: [], lookup: 'timeout' }
  }
}
