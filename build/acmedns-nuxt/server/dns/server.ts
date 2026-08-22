import dns2 from 'dns2'
import type { AcmeDnsConfig } from '../utils/types'
import { getTXTForDomain } from '../utils/db'
import { parseListenAddress } from '../utils/config'
import { sanitizeDomainQuestion } from '../utils/validation'

const { Packet } = dns2

const RCODE_NOERROR = 0
const RCODE_NXDOMAIN = 3
const RCODE_REFUSED = 5

type DnsAnswer = Record<string, unknown>

interface StaticRecords {
  a: Map<string, string[]>
  aaaa: Map<string, string[]>
  ns: Map<string, string[]>
  cname: Map<string, string[]>
}

function fqdn(name: string): string {
  return name.replace(/\.$/, '').toLowerCase()
}

function endsWithZone(name: string, zone: string): boolean {
  const n = fqdn(name)
  const z = fqdn(zone)
  return n === z || n.endsWith(`.${z}`)
}

function soaSerial(): number {
  const d = new Date()
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  const h = String(d.getUTCHours()).padStart(2, '0')
  return Number(`${y}${m}${day}${h}`)
}

function soaRecord(zone: string, nsname: string, admin: string): DnsAnswer {
  return {
    name: zone,
    type: Packet.TYPE.SOA,
    class: Packet.CLASS.IN,
    ttl: 3600,
    primary: nsname,
    admin,
    serial: soaSerial(),
    refresh: 28800,
    retry: 7200,
    expiration: 604800,
    minimum: 86400,
  }
}

function pushMap(map: Map<string, string[]>, name: string, value: string) {
  const key = fqdn(name)
  const list = map.get(key) ?? []
  list.push(value)
  map.set(key, list)
}

function parseStaticRecords(records: string[]): StaticRecords {
  const out: StaticRecords = {
    a: new Map(),
    aaaa: new Map(),
    ns: new Map(),
    cname: new Map(),
  }

  for (const raw of records) {
    const parts = raw.trim().split(/\s+/)
    if (parts.length < 3) {
      console.warn(`[acmedns] could not parse RR: ${raw}`)
      continue
    }
    const name = parts[0]!
    const type = parts[1]!.toUpperCase()
    const value = parts.slice(2).join(' ').replace(/\.$/, '')

    if (type === 'A') {
      pushMap(out.a, name, value)
    }
    else if (type === 'AAAA') {
      pushMap(out.aaaa, name, value)
    }
    else if (type === 'NS') {
      pushMap(out.ns, name, fqdn(value))
    }
    else if (type === 'CNAME') {
      pushMap(out.cname, name, fqdn(value))
    }
    else {
      console.warn(`[acmedns] unsupported static RR type in config: ${raw}`)
    }
  }

  return out
}

function answeringForDomain(name: string, zone: string, staticRecords: StaticRecords): boolean {
  const n = fqdn(name)
  if (n === fqdn(zone)) {
    return true
  }
  return staticRecords.a.has(n)
    || staticRecords.aaaa.has(n)
    || staticRecords.ns.has(n)
    || staticRecords.cname.has(n)
}

function isAuthoritative(name: string, zone: string, staticRecords: StaticRecords): boolean {
  const n = fqdn(name)
  if (answeringForDomain(n, zone, staticRecords)) {
    return true
  }
  const parts = n.split('.')
  for (let i = 0; i < parts.length; i++) {
    const candidate = parts.slice(i).join('.')
    if (answeringForDomain(candidate, zone, staticRecords) || candidate === fqdn(zone)) {
      return true
    }
  }
  return endsWithZone(n, zone)
}

export function createDnsServer(config: AcmeDnsConfig) {
  const zone = fqdn(config.general.domain)
  const nsname = fqdn(config.general.nsname)
  const admin = fqdn(config.general.nsadmin).replace('@', '.')
  const staticRecords = parseStaticRecords(config.general.records)
  const listen = parseListenAddress(config.general.listen)

  const wantUdp = config.general.protocol.includes('both')
    || config.general.protocol.startsWith('udp')
  const wantTcp = config.general.protocol.includes('both')
    || config.general.protocol.startsWith('tcp')

  const server = dns2.createServer({
    udp: wantUdp,
    tcp: wantTcp,
    handle: (request, send) => {
      const response = Packet.createResponseFromRequest(request)
      response.header.aa = 0
      response.header.rcode = RCODE_NOERROR

      for (const question of request.questions ?? []) {
        const name = fqdn(question.name)
        const type = question.type
        const auth = isAuthoritative(name, zone, staticRecords)
        if (auth) {
          response.header.aa = 1
        }

        const before = response.answers.length

        if (!endsWithZone(name, zone) && !answeringForDomain(name, zone, staticRecords)) {
          if (!auth) {
            response.header.rcode = RCODE_REFUSED
          }
          else {
            response.header.rcode = RCODE_NXDOMAIN
            response.authorities.push(soaRecord(zone, nsname, admin))
          }
          continue
        }

        if (type === Packet.TYPE.SOA || type === Packet.TYPE.ANY) {
          if (name === zone) {
            response.answers.push(soaRecord(zone, nsname, admin))
          }
        }

        if (type === Packet.TYPE.NS || type === Packet.TYPE.ANY) {
          const nsValues = staticRecords.ns.get(name) ?? (name === zone ? [nsname] : [])
          for (const ns of nsValues) {
            response.answers.push({
              name,
              type: Packet.TYPE.NS,
              class: Packet.CLASS.IN,
              ttl: 3600,
              ns,
            })
          }
        }

        if (type === Packet.TYPE.A || type === Packet.TYPE.ANY) {
          for (const address of staticRecords.a.get(name) ?? []) {
            response.answers.push({
              name,
              type: Packet.TYPE.A,
              class: Packet.CLASS.IN,
              ttl: 300,
              address,
            })
          }
        }

        if (type === Packet.TYPE.AAAA || type === Packet.TYPE.ANY) {
          for (const address of staticRecords.aaaa.get(name) ?? []) {
            response.answers.push({
              name,
              type: Packet.TYPE.AAAA,
              class: Packet.CLASS.IN,
              ttl: 300,
              address,
            })
          }
        }

        if (type === Packet.TYPE.CNAME || type === Packet.TYPE.ANY) {
          for (const target of staticRecords.cname.get(name) ?? []) {
            response.answers.push({
              name,
              type: Packet.TYPE.CNAME,
              class: Packet.CLASS.IN,
              ttl: 300,
              domain: target,
            })
          }
        }

        if (type === Packet.TYPE.TXT || type === Packet.TYPE.ANY) {
          const subdomain = sanitizeDomainQuestion(name)
          const values = getTXTForDomain(subdomain)
          for (const data of values) {
            if (!data) {
              continue
            }
            response.answers.push({
              name,
              type: Packet.TYPE.TXT,
              class: Packet.CLASS.IN,
              ttl: 1,
              data,
            })
          }
        }

        const added = response.answers.length > before
        if (added) {
          response.header.rcode = RCODE_NOERROR
        }
        else if (auth) {
          // NODATA vs NXDOMAIN: single label under zone (uuid.auth) is NODATA when empty
          const underZone = name.endsWith(`.${zone}`)
          const relative = underZone ? name.slice(0, -(zone.length + 1)) : ''
          const singleLabel = underZone && relative.length > 0 && !relative.includes('.')
          if (name === zone || singleLabel) {
            response.header.rcode = RCODE_NOERROR
          }
          else {
            response.header.rcode = RCODE_NXDOMAIN
          }
          response.authorities.push(soaRecord(zone, nsname, admin))
        }
      }

      void send(response)
    },
  })

  return {
    listen: {
      host: listen.host,
      port: listen.port,
      udp: wantUdp,
      tcp: wantTcp,
    },
    async start() {
      const opts: { udp?: { port: number, address: string }, tcp?: { port: number, address: string } } = {}
      if (wantUdp) {
        opts.udp = { port: listen.port, address: listen.host }
      }
      if (wantTcp) {
        opts.tcp = { port: listen.port, address: listen.host }
      }
      await server.listen(opts)
      console.info(`[acmedns] listening DNS on ${listen.host}:${listen.port} (udp=${wantUdp} tcp=${wantTcp})`)
    },
    async close() {
      await server.close()
    },
  }
}
