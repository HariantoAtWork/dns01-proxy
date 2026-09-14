import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { v7 as uuid } from 'uuid'
import type {
  BearerKey,
  BearerKeyInput,
  BearerKeyPublic,
  BearerKeysFile,
} from '../types/bearerKey'

const TOKEN_BYTES = 32
const PREFIX_VISIBLE = 8

export function emptyBearerKey(): BearerKeyInput {
  return { name: '' }
}

/** URL-safe token with `sk_` prefix. */
export function generateBearerToken(): string {
  const raw = randomBytes(TOKEN_BYTES).toString('base64url')
  return `sk_${raw}`
}

export function hashBearerToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function bearerTokenPrefix(token: string): string {
  const visible = token.slice(0, PREFIX_VISIBLE)
  return `${visible}…`
}

/**
 * Constant-time compare of a plaintext token against a stored SHA-256 hex hash.
 */
export function verifyBearerToken(token: string, tokenHash: string): boolean {
  if (!token || !tokenHash) {
    return false
  }
  const actual = Buffer.from(hashBearerToken(token), 'utf8')
  const expected = Buffer.from(tokenHash, 'utf8')
  if (actual.length !== expected.length) {
    return false
  }
  return timingSafeEqual(actual, expected)
}

export function parseBearerAuthHeader(header: string | null): string | null {
  if (!header) {
    return null
  }
  const match = /^\s*Bearer\s+(\S+)\s*$/i.exec(header)
  if (!match) {
    return null
  }
  return match[1] || null
}

function nowIso(): string {
  return new Date().toISOString()
}

/** Load from disk — tokenHash kept as-is. */
export function normalizeBearerKeyFromDisk(raw: unknown, idFallback?: string): BearerKey {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const id = String(row.id || idFallback || uuid())
  const createdAt = String(row.createdAt || nowIso())
  return {
    id,
    name: String(row.name || '').trim(),
    tokenHash: String(row.tokenHash || '').trim(),
    prefix: String(row.prefix || '').trim() || 'sk_…',
    createdAt,
    updatedAt: String(row.updatedAt || createdAt),
  }
}

export function normalizeBearerKeysFile(raw: unknown): BearerKeysFile {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const keys = Array.isArray(row.keys)
    ? row.keys.map(item => normalizeBearerKeyFromDisk(item))
    : []
  return { version: 1, keys }
}

/**
 * Create or update metadata. When `token` is provided, replaces hash/prefix.
 * Callers must pass a freshly generated token on create and rotate.
 */
export function normalizeBearerKeyInput(
  input: BearerKeyInput,
  previous: BearerKey | null | undefined,
  token?: string,
): BearerKey {
  const id = String(input.id || previous?.id || uuid())
  const stamp = nowIso()
  const name = String(input.name || '').trim()

  if (token) {
    return {
      id,
      name,
      tokenHash: hashBearerToken(token),
      prefix: bearerTokenPrefix(token),
      createdAt: previous?.createdAt || stamp,
      updatedAt: stamp,
    }
  }

  if (!previous?.tokenHash) {
    throw new Error('Bearer token is required when creating a key')
  }

  return {
    id,
    name,
    tokenHash: previous.tokenHash,
    prefix: previous.prefix,
    createdAt: previous.createdAt,
    updatedAt: stamp,
  }
}

export function validateBearerKey(key: BearerKey): string | null {
  if (!key.name.trim()) {
    return 'Bearer key name is required'
  }
  if (!key.tokenHash || key.tokenHash.length !== 64) {
    return 'Bearer token hash is invalid'
  }
  return null
}

export function toBearerKeyPublic(key: BearerKey): BearerKeyPublic {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
  }
}
