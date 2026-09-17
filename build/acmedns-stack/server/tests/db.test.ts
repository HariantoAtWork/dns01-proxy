import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { compareSync } from 'bcryptjs'
import type { AcmeDnsConfig } from '../utils/types'
import {
  TXT_RECORD_SLOTS,
  closeAcmeDb,
  ensureTXTSlotsForSubdomain,
  getByUsername,
  getSharedPlaintextPassword,
  getTXTForDomain,
  initAcmeDb,
  registerAccount,
  updateTXT,
  upsertSharedAccount,
} from '../utils/db'
import { registerTxtStore, resetTxtStore } from '../utils/txtStoreRegistry'
import { InMemoryTxtStore } from '../../plugins/txt-ttl/runtime/server/store/inMemoryTxtStore'
import { validTXT } from '../utils/validation'

const BASE_CONFIG: AcmeDnsConfig = {
  general: {
    listen: '127.0.0.1:53',
    protocol: 'udp',
    domain: 'auth.example.test',
    nsname: 'auth.example.test',
    nsadmin: 'admin.example.test',
    records: [],
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

function validChallengeTxt() {
  return 'abcdefghijklmnopqrstuvwxyz0123456789abcdefg'
}

let tempDir = ''

beforeEach(async () => {
  closeAcmeDb()
  resetTxtStore()
  registerTxtStore(new InMemoryTxtStore({ ttlSeconds: 86_400 }))
  tempDir = mkdtempSync(join(tmpdir(), 'acmedns-db-test-'))
  await initAcmeDb({
    ...BASE_CONFIG,
    database: {
      engine: 'sqlite',
      connection: join(tempDir, 'acme-dns.db'),
    },
  })
})

afterEach(() => {
  closeAcmeDb()
  resetTxtStore()
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true })
    tempDir = ''
  }
})

describe('db', () => {
  test('registerAccount creates account with TXT slots and allowfrom', () => {
    const account = registerAccount(['192.168.1.0/24'])
    expect(account.username).toMatch(/^[0-9a-f-]{36}$/i)
    expect(account.subdomain).toMatch(/^[0-9a-f-]{36}$/i)
    expect(account.plaintextPassword).toHaveLength(40)
    expect(account.allowfrom).toEqual(['192.168.1.0/24'])

    const loaded = getByUsername(account.username)
    expect(loaded?.subdomain).toBe(account.subdomain)
    expect(compareSync(account.plaintextPassword, loaded!.password)).toBe(true)
    expect(getTXTForDomain(account.subdomain)).toEqual([])
  })

  test('updateTXT stores challenge value in oldest slot', () => {
    const account = registerAccount()
    const txt = validChallengeTxt()
    expect(validTXT(txt)).toBe(true)

    const updated = updateTXT({ subdomain: account.subdomain, txt })
    expect(updated).toBe(true)

    const values = getTXTForDomain(account.subdomain).filter(Boolean)
    expect(values).toContain(txt)
  })

  test('updateTXT pads missing TXT slots for legacy subdomain', () => {
    const subdomain = 'legacy-subdomain-key'
    ensureTXTSlotsForSubdomain(subdomain)

    const txt = validChallengeTxt()
    expect(updateTXT({ subdomain, txt })).toBe(true)
    expect(getTXTForDomain(subdomain).filter(Boolean)).toContain(txt)
  })

  test('upsertSharedAccount stores plaintext password in meta', () => {
    const password = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd'
    const returned = upsertSharedAccount('shared-user', 'shared-sub', password)
    expect(returned).toBe(password)
    expect(getSharedPlaintextPassword()).toBe(password)

    const loaded = getByUsername('shared-user')
    expect(loaded?.subdomain).toBe('shared-sub')
    expect(compareSync(password, loaded!.password)).toBe(true)
  })

  test('getByUsername returns null for unknown user', () => {
    expect(getByUsername('missing-user')).toBeNull()
  })
})
