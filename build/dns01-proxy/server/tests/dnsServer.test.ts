import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import dns2 from 'dns2'
import type { AcmeDnsConfig } from '../utils/types'
import {
  closeAcmeDb,
  initAcmeDb,
  registerAccount,
  updateTXT,
} from '../utils/db'
import { registerTxtStore, resetTxtStore } from '../utils/txtStoreRegistry'
import { registerAliasStore, resetAliasStore, requireAliasStore } from '../utils/aliasStoreRegistry'
import { InMemoryTxtStore } from '../../plugins/txt-ttl/runtime/server/store/inMemoryTxtStore'
import { InMemoryAliasStore } from '../store/inMemoryAliasStore'

const { Packet, UDPClient } = dns2

const TEST_CONFIG: AcmeDnsConfig = {
  general: {
    listen: '127.0.0.1:5353',
    protocol: 'udp',
    domain: 'auth.example.test',
    nsname: 'ns.auth.example.test',
    nsadmin: 'admin@example.test',
    records: [
      'auth.example.test. A 198.51.100.1',
      'auth.example.test. NS ns.auth.example.test.',
      'www.auth.example.test. CNAME auth.example.test.',
    ],
    debug: false,
  },
  database: {
    engine: 'sqlite',
    connection: '',
  },
  api: {
    ip: '127.0.0.1',
    port: '80',
    disable_registration: false,
    shared_mode: false,
    shared_username: '00000000-0000-4000-8000-000000000001',
    shared_password: '',
    auth_hop: false,
    tls: 'none',
    corsorigins: ['*'],
    use_header: false,
    header_name: 'X-Forwarded-For',
  },
  logconfig: {
    loglevel: 'info',
    logtype: 'stdout',
    logformat: 'text',
  },
}

mock.module('../utils/config', () => ({
  getAcmeConfig: () => TEST_CONFIG,
  parseListenAddress: (listen: string) => {
    const trimmed = listen.trim()
    const idx = trimmed.lastIndexOf(':')
    if (idx > 0) {
      return {
        host: trimmed.slice(0, idx),
        port: Number(trimmed.slice(idx + 1)) || 53,
      }
    }
    return { host: trimmed || '127.0.0.1', port: 53 }
  },
}))

async function freePort() {
  const net = await import('node:net')
  return new Promise<number>((resolve) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 53
      server.close(() => resolve(port))
    })
  })
}

async function query(port: number, name: string, type: keyof typeof Packet.TYPE) {
  const client = UDPClient({ dns: '127.0.0.1', port })
  return client(name, type)
}

let port = 0
let tempDir = ''
let dnsServer: Awaited<ReturnType<typeof import('../dns/server').createDnsServer>> | null = null
let txtSubdomain = ''

beforeEach(async () => {
  closeAcmeDb()
  resetTxtStore()
  resetAliasStore()
  registerTxtStore(new InMemoryTxtStore({ ttlSeconds: 86_400 }))
  registerAliasStore(new InMemoryAliasStore({ ttlSeconds: 86_400 }))
  tempDir = mkdtempSync(join(tmpdir(), 'acmedns-dns-test-'))
  TEST_CONFIG.database.connection = join(tempDir, 'acme-dns.db')
  await initAcmeDb(TEST_CONFIG)

  const account = registerAccount()
  txtSubdomain = account.subdomain
  updateTXT({
    subdomain: account.subdomain,
    txt: 'abcdefghijklmnopqrstuvwxyz0123456789abcdefg',
  })

  port = await freePort()
  TEST_CONFIG.general.listen = `127.0.0.1:${port}`
  const { createDnsServer } = await import('../dns/server')
  dnsServer = createDnsServer(TEST_CONFIG)
  await dnsServer.start()
})

afterEach(async () => {
  await dnsServer?.close()
  dnsServer = null
  closeAcmeDb()
  resetTxtStore()
  resetAliasStore()
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true })
    tempDir = ''
  }
})

describe('dnsServer', () => {
  test('answers SOA for zone apex', async () => {
    const response = await query(port, 'auth.example.test', 'SOA')
    expect(response.header.rcode).toBe(Packet.RCODE.NOERROR)
    expect(response.header.aa).toBe(1)
    expect(response.answers.some(a => a.type === Packet.TYPE.SOA)).toBe(true)
  })

  test('answers A record from static config', async () => {
    const response = await query(port, 'auth.example.test', 'A')
    expect(response.header.rcode).toBe(Packet.RCODE.NOERROR)
    const answers = response.answers.filter(a => a.type === Packet.TYPE.A)
    expect(answers.map(a => a.address)).toContain('198.51.100.1')
  })

  test('answers NS for zone apex', async () => {
    const response = await query(port, 'auth.example.test', 'NS')
    expect(response.header.rcode).toBe(Packet.RCODE.NOERROR)
    const answers = response.answers.filter(a => a.type === Packet.TYPE.NS)
    expect(answers.map(a => a.ns)).toContain('ns.auth.example.test')
  })

  test('answers CNAME from static config', async () => {
    const response = await query(port, 'www.auth.example.test', 'CNAME')
    expect(response.header.rcode).toBe(Packet.RCODE.NOERROR)
    const answers = response.answers.filter(a => a.type === Packet.TYPE.CNAME)
    expect(answers.map(a => a.domain)).toContain('auth.example.test')
  })

  test('returns TXT records for acme-dns subdomain', async () => {
    const response = await query(port, `${txtSubdomain}.auth.example.test`, 'TXT')
    expect(response.header.rcode).toBe(Packet.RCODE.NOERROR)
    const answers = response.answers.filter(a => a.type === Packet.TYPE.TXT)
    expect(answers.flatMap(a => a.data as string[])).toContain(
      'abcdefghijklmnopqrstuvwxyz0123456789abcdefg',
    )
  })

  test('returns NODATA for empty single-label subdomain', async () => {
    const response = await query(port, 'missing.auth.example.test', 'TXT')
    expect(response.header.rcode).toBe(Packet.RCODE.NOERROR)
    expect(response.answers.filter(a => a.type === Packet.TYPE.TXT)).toHaveLength(0)
  })

  test('returns NXDOMAIN for unknown deep name under zone', async () => {
    const response = await query(port, 'deep.missing.auth.example.test', 'A')
    expect(response.header.rcode).toBe(Packet.RCODE.NXDOMAIN)
    expect(response.authorities.some(a => a.type === Packet.TYPE.SOA)).toBe(true)
  })

  test('refuses queries outside the auth zone', async () => {
    const response = await query(port, 'example.org', 'A')
    expect(response.header.rcode).toBe(Packet.RCODE.REFUSED)
  })

  test('auth hop: entry label answers CNAME only while alias active', async () => {
    const hop = '018f3a2b-7c4d-7000-8000-0000000000ab'
    updateTXT({
      subdomain: '_harianto-dev_',
      txt: 'abcdefghijklmnopqrstuvwxyz0123456789abcdefg',
    })
    updateTXT({
      subdomain: hop,
      txt: 'zyxwvutsrqponmlkjihgfedcba9876543210zyxwvut',
    })
    requireAliasStore().mint('_harianto-dev_', hop)

    const cname = await query(port, '_harianto-dev_.auth.example.test', 'CNAME')
    expect(cname.header.rcode).toBe(Packet.RCODE.NOERROR)
    expect(cname.answers.filter(a => a.type === Packet.TYPE.CNAME).map(a => a.domain))
      .toContain(`${hop}.auth.example.test`)

    const entryTxt = await query(port, '_harianto-dev_.auth.example.test', 'TXT')
    expect(entryTxt.answers.filter(a => a.type === Packet.TYPE.TXT)).toHaveLength(0)

    const hopTxt = await query(port, `${hop}.auth.example.test`, 'TXT')
    expect(hopTxt.answers.flatMap(a => a.data as string[])).toContain(
      'zyxwvutsrqponmlkjihgfedcba9876543210zyxwvut',
    )

    const hopCname = await query(port, `${hop}.auth.example.test`, 'CNAME')
    expect(hopCname.answers.filter(a => a.type === Packet.TYPE.CNAME)).toHaveLength(0)
  })

  test('auth hop: arbitrary and UUID entry labels can hold the dynamic CNAME', async () => {
    const hopCake = '018f3a2b-7c4d-7111-8111-0000000000cd'
    const hopFromUuid = '018f3a2b-7c4d-7222-8222-0000000000ef'
    const entryUuid = '018f3a2b-7c4d-7333-8333-0000000000aa'

    requireAliasStore().mint('i-eat-cake', hopCake)
    requireAliasStore().mint(entryUuid, hopFromUuid)
    updateTXT({
      subdomain: hopCake,
      txt: 'abcdefghijklmnopqrstuvwxyz0123456789abcdefg',
    })
    updateTXT({
      subdomain: hopFromUuid,
      txt: 'bcdefghijklmnopqrstuvwxyz0123456789abcdefgh',
    })

    const cake = await query(port, 'i-eat-cake.auth.example.test', 'CNAME')
    expect(cake.answers.filter(a => a.type === Packet.TYPE.CNAME).map(a => a.domain))
      .toContain(`${hopCake}.auth.example.test`)

    const fromUuid = await query(port, `${entryUuid}.auth.example.test`, 'CNAME')
    expect(fromUuid.answers.filter(a => a.type === Packet.TYPE.CNAME).map(a => a.domain))
      .toContain(`${hopFromUuid}.auth.example.test`)
    expect(fromUuid.answers.filter(a => a.type === Packet.TYPE.TXT)).toHaveLength(0)
  })
})
