import { describe, expect, test } from 'bun:test'
import {
  normalizeBearerListFromDisk,
  normalizeBearerListsFile,
  parseBearerAuthHeader,
  toBearerListPublic,
  validateBearerList,
} from '../runtime/shared/utils/bearerKey'
import {
  generateBearerToken,
  hashBearerToken,
  normalizeBearerListInput,
  verifyBearerToken,
} from '../runtime/server/utils/bearerKeyCrypto'
import { verifyInboundBearer, reloadBearerLists } from '../../../server/proxy/bearerKeyState'

describe('bearer token helpers', () => {
  test('generate, hash, and verify', () => {
    const token = generateBearerToken('Ciru Halo Agent')
    expect(token).toMatch(/^sk_ciru-halo-agent_[a-f0-9]{16}$/)
    const hash = hashBearerToken(token)
    expect(hash).toHaveLength(64)
    expect(verifyBearerToken(token, hash)).toBe(true)
    expect(verifyBearerToken(`${token}x`, hash)).toBe(false)
  })

  test('slugify falls back for empty names', () => {
    expect(generateBearerToken('')).toMatch(/^sk_key_[a-f0-9]{16}$/)
    expect(generateBearerToken('!!!')).toMatch(/^sk_key_[a-f0-9]{16}$/)
  })

  test('parseBearerAuthHeader', () => {
    expect(parseBearerAuthHeader(null)).toBeNull()
    expect(parseBearerAuthHeader('Basic abc')).toBeNull()
    expect(parseBearerAuthHeader('Bearer secret-token')).toBe('secret-token')
  })
})

describe('bearer list normalize', () => {
  test('auto-generates empty tokens and accepts custom', () => {
    const custom = 'my-custom-secret-token'
    const { list, generatedTokens } = normalizeBearerListInput({
      name: ' AI Clients ',
      keys: [
        {},
        { token: custom },
      ],
    }, null)

    expect(list.name).toBe('AI Clients')
    expect(list.keys).toHaveLength(2)
    expect(generatedTokens).toHaveLength(1)
    expect(generatedTokens[0]!.token).toMatch(/^sk_ai-clients_[a-f0-9]{16}$/)
    expect(list.keys[0]!.token).toBe(generatedTokens[0]!.token)
    expect(list.keys[1]!.token).toBe(custom)
    expect(toBearerListPublic(list).keys[1]!.token).toBe(custom)
    expect(validateBearerList(list)).toBeNull()
  })

  test('keeps hash when token blank on update', () => {
    const token = generateBearerToken()
    const previous = normalizeBearerListInput({
      name: 'old',
      keys: [{ token }],
    }, null).list

    const next = normalizeBearerListInput({
      id: previous.id,
      name: 'new',
      keys: [{ id: previous.keys[0]!.id, token: '' }],
    }, previous)

    expect(next.list.name).toBe('new')
    expect(next.list.keys[0]!.tokenHash).toBe(previous.keys[0]!.tokenHash)
    expect(next.generatedTokens).toHaveLength(0)
  })

  test('legacy flat keys file migrates to lists', () => {
    const file = normalizeBearerListsFile({
      keys: [{
        id: 'k1',
        name: 'one',
        tokenHash: 'a'.repeat(64),
        prefix: 'sk_abcd…',
        createdAt: '2026-01-01T00:00:00.000Z',
      }],
    })
    expect(file.lists).toHaveLength(1)
    expect(file.lists[0]!.name).toBe('one')
    expect(file.lists[0]!.keys[0]!.id).toBe('k1')
    expect(file.lists[0]!.keys[0]).not.toHaveProperty('label')
  })

  test('rejects empty list name', () => {
    const { list } = normalizeBearerListInput({ name: '  ', keys: [{ token: 'x' }] }, null)
    expect(validateBearerList(list)).toMatch(/name/i)
  })

  test('normalizeBearerListFromDisk drops legacy label', () => {
    const list = normalizeBearerListFromDisk({
      id: 'l1',
      name: 'group',
      keys: [{
        id: 'k1',
        label: 'ignored',
        tokenHash: 'b'.repeat(64),
        prefix: 'sk_…',
        token: 'plain',
      }],
    })
    expect(list.keys[0]).not.toHaveProperty('label')
    expect(list.keys[0]!.token).toBe('plain')
  })
})

describe('verifyInboundBearer list', () => {
  test('accepts any key in the bound list', () => {
    const tokenA = generateBearerToken()
    const tokenB = generateBearerToken()
    const { list } = normalizeBearerListInput({
      name: 'group',
      keys: [
        { token: tokenA },
        { token: tokenB },
      ],
    }, null)
    reloadBearerLists([list])
    expect(verifyInboundBearer(list.id, `Bearer ${tokenA}`)).toBe(true)
    expect(verifyInboundBearer(list.id, `Bearer ${tokenB}`)).toBe(true)
    expect(verifyInboundBearer(list.id, 'Bearer wrong')).toBe(false)
    expect(verifyInboundBearer(null, `Bearer ${tokenA}`)).toBe(false)
  })
})
