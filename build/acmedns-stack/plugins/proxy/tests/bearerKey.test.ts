import { describe, expect, test } from 'bun:test'
import {
  bearerTokenPrefix,
  generateBearerToken,
  hashBearerToken,
  normalizeBearerKeyFromDisk,
  normalizeBearerKeyInput,
  normalizeBearerKeysFile,
  parseBearerAuthHeader,
  toBearerKeyPublic,
  validateBearerKey,
  verifyBearerToken,
} from '../runtime/shared/utils/bearerKey'
import { verifyInboundBearer, reloadBearerKeys } from '../../../server/proxy/bearerKeyState'

describe('bearer token helpers', () => {
  test('generate, hash, and verify', () => {
    const token = generateBearerToken()
    expect(token.startsWith('sk_')).toBe(true)
    const hash = hashBearerToken(token)
    expect(hash).toHaveLength(64)
    expect(verifyBearerToken(token, hash)).toBe(true)
    expect(verifyBearerToken(`${token}x`, hash)).toBe(false)
    expect(bearerTokenPrefix(token).endsWith('…')).toBe(true)
  })

  test('parseBearerAuthHeader', () => {
    expect(parseBearerAuthHeader(null)).toBeNull()
    expect(parseBearerAuthHeader('Basic abc')).toBeNull()
    expect(parseBearerAuthHeader('Bearer secret-token')).toBe('secret-token')
    expect(parseBearerAuthHeader('  bearer  secret-token  ')).toBe('secret-token')
  })
})

describe('bearer key normalize', () => {
  test('create with token and public shape', () => {
    const token = generateBearerToken()
    const key = normalizeBearerKeyInput({ name: ' agents ' }, null, token)
    expect(key.name).toBe('agents')
    expect(key.tokenHash).toBe(hashBearerToken(token))
    expect(validateBearerKey(key)).toBeNull()
    const pub = toBearerKeyPublic(key)
    expect(pub).not.toHaveProperty('tokenHash')
    expect(pub.prefix).toBe(key.prefix)
  })

  test('update name keeps hash', () => {
    const token = generateBearerToken()
    const previous = normalizeBearerKeyInput({ name: 'old' }, null, token)
    const next = normalizeBearerKeyInput({ id: previous.id, name: 'new' }, previous)
    expect(next.tokenHash).toBe(previous.tokenHash)
    expect(next.name).toBe('new')
  })

  test('file normalize and disk round-trip fields', () => {
    const file = normalizeBearerKeysFile({
      keys: [{
        id: 'k1',
        name: 'one',
        tokenHash: 'a'.repeat(64),
        prefix: 'sk_abcd…',
        createdAt: '2026-01-01T00:00:00.000Z',
      }],
    })
    expect(file.version).toBe(1)
    expect(file.keys).toHaveLength(1)
    const fromDisk = normalizeBearerKeyFromDisk(file.keys[0])
    expect(fromDisk.updatedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  test('rejects empty name', () => {
    const token = generateBearerToken()
    const key = normalizeBearerKeyInput({ name: '  ' }, null, token)
    expect(validateBearerKey(key)).toMatch(/name/i)
  })
})

describe('verifyInboundBearer cache', () => {
  test('matches cached key by id', () => {
    const token = generateBearerToken()
    const key = normalizeBearerKeyInput({ name: 'cached' }, null, token)
    reloadBearerKeys([key])
    expect(verifyInboundBearer(key.id, `Bearer ${token}`)).toBe(true)
    expect(verifyInboundBearer(key.id, 'Bearer wrong')).toBe(false)
    expect(verifyInboundBearer('missing', `Bearer ${token}`)).toBe(false)
    expect(verifyInboundBearer(null, `Bearer ${token}`)).toBe(false)
  })
})
