import { BlockList, isIP } from 'node:net'
import type { IpFamily, PublicIpAddress, VisitIpAddress } from '#shared/types/network'
import type { H3Event } from 'h3'

const PROBE_TIMEOUT_MS = 3500
const CACHE_TTL_MS = 45_000

const IPV4_PROBES = [
  { source: 'ipify', url: 'https://api.ipify.org' },
  { source: 'icanhazip', url: 'https://ipv4.icanhazip.com' },
  { source: 'cloudflare', url: 'https://1.1.1.1/cdn-cgi/trace' },
] as const

const IPV6_PROBES = [
  { source: 'ipify', url: 'https://api6.ipify.org' },
  { source: 'icanhazip', url: 'https://ipv6.icanhazip.com' },
  { source: 'cloudflare', url: 'https://[2606:4700:4700::1111]/cdn-cgi/trace' },
] as const

const privateNets = new BlockList()
privateNets.addSubnet('0.0.0.0', 8, 'ipv4')
privateNets.addSubnet('10.0.0.0', 8, 'ipv4')
privateNets.addSubnet('100.64.0.0', 10, 'ipv4')
privateNets.addSubnet('127.0.0.0', 8, 'ipv4')
privateNets.addSubnet('169.254.0.0', 16, 'ipv4')
privateNets.addSubnet('172.16.0.0', 12, 'ipv4')
privateNets.addSubnet('192.168.0.0', 16, 'ipv4')
privateNets.addSubnet('224.0.0.0', 4, 'ipv4')
privateNets.addSubnet('::1', 128, 'ipv6')
privateNets.addSubnet('fc00::', 7, 'ipv6')
privateNets.addSubnet('fe80::', 10, 'ipv6')

let cachedHost: { expires: number, host: PublicIpAddress[] } | null = null

export function isPublicIp(address: string, family: IpFamily) {
  const kind = family === 4 ? 'ipv4' : 'ipv6'
  return !privateNets.check(address, kind)
}

export function parseEchoBody(body: string): string | null {
  const trimmed = body.trim()
  if (!trimmed) {
    return null
  }

  const trace = trimmed.match(/^ip=(\S+)/m)
  if (trace?.[1]) {
    return trace[1]
  }

  try {
    const parsed = JSON.parse(trimmed) as { ip?: unknown }
    if (typeof parsed.ip === 'string') {
      return parsed.ip.trim()
    }
  }
  catch {
    // Plain-text echo bodies are expected.
  }

  return trimmed.split(/\s+/)[0] ?? null
}

async function probeOne(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    headers: {
      Accept: 'text/plain, application/json',
      'User-Agent': 'acmedns-client/1',
    },
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const address = parseEchoBody(await response.text())
  if (!address || !isIP(address)) {
    throw new Error('Echo body was not an IP address')
  }

  return address
}

function mergeHits(hits: Array<{ address: string, family: IpFamily, source: string }>): PublicIpAddress[] {
  const grouped = new Map<string, PublicIpAddress>()

  for (const hit of hits) {
    const existing = grouped.get(hit.address)
    if (existing) {
      if (!existing.sources.includes(hit.source)) {
        existing.sources.push(hit.source)
      }
      continue
    }

    grouped.set(hit.address, {
      address: hit.address,
      family: hit.family,
      sources: [hit.source],
      origins: ['host'],
    })
  }

  return [...grouped.values()].sort((left, right) => {
    if (left.family !== right.family) {
      return left.family - right.family
    }
    return left.address.localeCompare(right.address)
  })
}

async function probeFamily(
  family: IpFamily,
  probes: readonly { source: string, url: string }[],
): Promise<Array<{ address: string, family: IpFamily, source: string }>> {
  const results = await Promise.allSettled(probes.map(async (probe) => {
    const address = await probeOne(probe.url)
    const foundFamily = isIP(address)
    if (foundFamily !== family) {
      throw new Error(`Expected IPv${family}, got IPv${foundFamily}`)
    }
    if (!isPublicIp(address, family)) {
      throw new Error(`${address} is not a public address`)
    }
    return { address, family, source: probe.source }
  }))

  return results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
}

export async function lookupHostPublicIps(force = false): Promise<PublicIpAddress[]> {
  if (!force && cachedHost && cachedHost.expires > Date.now()) {
    return cachedHost.host
  }

  const [ipv4, ipv6] = await Promise.all([
    probeFamily(4, IPV4_PROBES),
    probeFamily(6, IPV6_PROBES),
  ])

  const host = mergeHits([...ipv4, ...ipv6])
  cachedHost = { expires: Date.now() + CACHE_TTL_MS, host }
  return host
}

function headerIp(event: H3Event, name: string): string | null {
  const raw = getRequestHeader(event, name)
  if (typeof raw !== 'string') {
    return null
  }
  const first = raw.split(',')[0]?.trim()
  return first && isIP(first) ? first : null
}

export function lookupVisitIp(event: H3Event): VisitIpAddress | null {
  const candidates: Array<{ address: string, via: string }> = []

  const cloudflare = headerIp(event, 'cf-connecting-ip')
  if (cloudflare) {
    candidates.push({ address: cloudflare, via: 'CF-Connecting-IP' })
  }

  const realIp = headerIp(event, 'x-real-ip')
  if (realIp) {
    candidates.push({ address: realIp, via: 'X-Real-IP' })
  }

  const forwarded = headerIp(event, 'x-forwarded-for')
  if (forwarded) {
    candidates.push({ address: forwarded, via: 'X-Forwarded-For' })
  }

  const socket = getRequestIP(event)
  if (socket && isIP(socket)) {
    candidates.push({ address: socket, via: 'socket' })
  }

  const chosen = candidates[0]
  if (!chosen) {
    return null
  }

  const family = isIP(chosen.address)
  if (family !== 4 && family !== 6) {
    return null
  }

  return {
    address: chosen.address,
    family,
    public: isPublicIp(chosen.address, family),
    via: chosen.via,
  }
}
