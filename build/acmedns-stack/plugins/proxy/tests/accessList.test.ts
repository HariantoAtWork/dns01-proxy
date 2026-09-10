import { describe, expect, test } from 'bun:test'
import type { AccessList } from '../runtime/shared/types/accessList'
import {
  normalizeAccessAddress,
  normalizeAccessListFromDisk,
  normalizeAccessListInput,
  parseBasicAuthHeader,
  toAccessListPublic,
} from '../runtime/shared/utils/accessList'
import {
  evaluateAccessList,
  evaluateIpRules,
} from '../../../server/proxy/accessEvaluate'
import { resolveProxyClientIp } from '../../../server/proxy/clientIp'
import { reloadProxySettings } from '../../../server/proxy/accessListState'

function list(partial: Partial<AccessList> & Pick<AccessList, 'name'>): AccessList {
  return {
    id: partial.id || 'list-1',
    name: partial.name,
    satisfyAny: partial.satisfyAny ?? false,
    passAuthUpstream: partial.passAuthUpstream ?? false,
    users: partial.users ?? [],
    rules: partial.rules ?? [],
  }
}

describe('access address normalize', () => {
  test('expands bare IP and accepts CIDR', () => {
    expect(normalizeAccessAddress('10.0.0.5')).toBe('10.0.0.5/32')
    expect(normalizeAccessAddress('100.64.0.0/10')).toBe('100.64.0.0/10')
    expect(normalizeAccessAddress('not-an-ip')).toBeNull()
  })
})

describe('evaluateIpRules', () => {
  test('implicit deny when rules exist and IP unknown', () => {
    const result = evaluateIpRules(
      [{ directive: 'allow', address: '10.0.0.0/8' }],
      null,
    )
    expect(result.allowed).toBe(false)
  })

  test('allow match and implicit deny', () => {
    const rules = [
      { directive: 'allow' as const, address: '100.64.0.0/10' },
    ]
    expect(evaluateIpRules(rules, '100.64.1.2').allowed).toBe(true)
    expect(evaluateIpRules(rules, '8.8.8.8').allowed).toBe(false)
  })
})

describe('evaluateAccessList', () => {
  test('empty list allows', async () => {
    const result = await evaluateAccessList(list({ name: 'empty' }), '1.2.3.4', null)
    expect(result.ok).toBe(true)
  })

  test('IP allow works; forge headers are irrelevant here', async () => {
    const access = list({
      name: 'tailscale',
      rules: [{ directive: 'allow', address: '100.64.0.0/10' }],
    })
    expect((await evaluateAccessList(access, '100.64.9.1', null)).ok).toBe(true)
    expect((await evaluateAccessList(access, '9.9.9.9', null)).ok).toBe(false)
    if (!(await evaluateAccessList(access, '9.9.9.9', null)).ok) {
      const denied = await evaluateAccessList(access, '9.9.9.9', null)
      expect(denied).toMatchObject({ status: 403 })
    }
  })

  test('basic auth challenge and verify', async () => {
    const hash = await Bun.password.hash('secret')
    const access = list({
      name: 'auth',
      users: [{ username: 'alice', passwordHash: hash }],
    })
    const missing = await evaluateAccessList(access, '1.1.1.1', null)
    expect(missing).toMatchObject({ ok: false, status: 401 })

    const token = btoa('alice:secret')
    const ok = await evaluateAccessList(access, '1.1.1.1', `Basic ${token}`)
    expect(ok.ok).toBe(true)

    const bad = await evaluateAccessList(access, '1.1.1.1', `Basic ${btoa('alice:nope')}`)
    expect(bad).toMatchObject({ ok: false, status: 403 })
  })

  test('satisfyAny passes on IP or auth', async () => {
    const hash = await Bun.password.hash('secret')
    const access = list({
      name: 'any',
      satisfyAny: true,
      rules: [{ directive: 'allow', address: '10.0.0.0/8' }],
      users: [{ username: 'alice', passwordHash: hash }],
    })
    expect((await evaluateAccessList(access, '10.1.2.3', null)).ok).toBe(true)
    expect((await evaluateAccessList(access, '8.8.8.8', `Basic ${btoa('alice:secret')}`)).ok).toBe(true)
    const bothFail = await evaluateAccessList(access, '8.8.8.8', null)
    expect(bothFail).toMatchObject({ ok: false, status: 401 })
  })

  test('public shape never includes passwordHash', async () => {
    const hash = await Bun.password.hash('x')
    const access = await normalizeAccessListInput({
      name: 'safe',
      satisfyAny: false,
      passAuthUpstream: false,
      users: [{ username: 'u', password: 'x' }],
      rules: [],
    })
    expect(access.users[0]?.passwordHash).toBeTruthy()
    const pub = toAccessListPublic(access)
    expect(pub.users[0]).toEqual({ username: 'u', passwordSet: true })
    expect(JSON.stringify(pub)).not.toContain(hash.slice(0, 12))
  })

  test('disk normalize keeps hash', () => {
    const fromDisk = normalizeAccessListFromDisk({
      id: 'a',
      name: 'disk',
      users: [{ username: 'u', passwordHash: '$argon2id$fake' }],
      rules: [{ directive: 'allow', address: '127.0.0.1' }],
    })
    expect(fromDisk.users[0]?.passwordHash).toBe('$argon2id$fake')
    expect(fromDisk.rules[0]?.address).toBe('127.0.0.1/32')
  })
})

describe('resolveProxyClientIp trust setting', () => {
  test('ignores forged headers when trust is off', () => {
    reloadProxySettings({ trustForwardedClientIp: false })
    const req = new Request('http://example.com/', {
      headers: {
        'cf-connecting-ip': '100.64.1.1',
        'x-forwarded-for': '100.64.1.1',
      },
    })
    const resolved = resolveProxyClientIp(req, { trustForwardedClientIp: false })
    expect(resolved.address).toBeNull()
    expect(resolved.source).toBe('unknown')
  })

  test('uses CF then XFF when trust is on', () => {
    const req = new Request('http://example.com/', {
      headers: {
        'cf-connecting-ip': '100.64.1.1',
        'x-forwarded-for': '8.8.8.8',
      },
    })
    const resolved = resolveProxyClientIp(req, { trustForwardedClientIp: true })
    expect(resolved).toEqual({ address: '100.64.1.1', source: 'cf-connecting-ip' })

    const xffOnly = new Request('http://example.com/', {
      headers: { 'x-forwarded-for': '8.8.8.8, 1.1.1.1' },
    })
    expect(resolveProxyClientIp(xffOnly, { trustForwardedClientIp: true })).toEqual({
      address: '8.8.8.8',
      source: 'x-forwarded-for',
    })
  })
})

describe('parseBasicAuthHeader', () => {
  test('parses basic credentials', () => {
    expect(parseBasicAuthHeader(`Basic ${btoa('a:b:c')}`)).toEqual({
      username: 'a',
      password: 'b:c',
    })
    expect(parseBasicAuthHeader(null)).toBeNull()
  })
})
