import { v7 as uuid } from 'uuid'
import type {
  BearerGeneratedToken,
  BearerList,
  BearerListInput,
  BearerListKey,
  BearerListKeyInput,
} from '../../shared/types/bearerKey'

const PREFIX_VISIBLE = 8
/** Hex chars from the entropy hash used in auto-generated tokens. */
const TOKEN_HASH_SUFFIX_LEN = 16

/** Lowercase kebab slug for token prefixes; falls back to `key`. */
export function slugifyBearerListName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'key'
}

/**
 * Auto-generated gateway token:
 * `sk_{slugified-list-name}_{short-sha256-hex}`
 */
export function generateBearerToken(listName = ''): string {
  const slug = slugifyBearerListName(listName)
  const entropy = `${uuid().replace(/-/g, '')}${uuid().replace(/-/g, '')}`
  const tokenHash = hashBearerToken(entropy).slice(0, TOKEN_HASH_SUFFIX_LEN)
  return `sk_${slug}_${tokenHash}`
}

export function hashBearerToken(token: string): string {
  return new Bun.CryptoHasher('sha256').update(token).digest('hex')
}

export function bearerTokenPrefix(token: string): string {
  const visible = token.slice(0, PREFIX_VISIBLE)
  return `${visible}…`
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

export function verifyBearerToken(token: string, tokenHash: string): boolean {
  if (!token || !tokenHash) {
    return false
  }
  return timingSafeEqualString(hashBearerToken(token), tokenHash)
}

function normalizeOneKey(
  input: BearerListKeyInput,
  previous: BearerListKey | null | undefined,
  listName: string,
): { key: BearerListKey, generatedToken?: string } {
  const id = String(input.id || previous?.id || uuid())
  const stamp = new Date().toISOString()
  const token = typeof input.token === 'string' ? input.token.trim() : ''

  if (token) {
    return {
      key: {
        id,
        token,
        tokenHash: hashBearerToken(token),
        prefix: bearerTokenPrefix(token),
        createdAt: previous?.createdAt || stamp,
        updatedAt: stamp,
      },
    }
  }

  if (previous?.tokenHash) {
    return {
      key: {
        id,
        token: previous.token || '',
        tokenHash: previous.tokenHash,
        prefix: previous.prefix,
        createdAt: previous.createdAt,
        updatedAt: stamp,
      },
    }
  }

  const generated = generateBearerToken(listName)
  return {
    key: {
      id,
      token: generated,
      tokenHash: hashBearerToken(generated),
      prefix: bearerTokenPrefix(generated),
      createdAt: stamp,
      updatedAt: stamp,
    },
    generatedToken: generated,
  }
}

/**
 * Build a stored list from UI/API input.
 * Empty token on a new key → auto-generate; empty on existing → keep hash.
 */
export function normalizeBearerListInput(
  input: BearerListInput,
  previous: BearerList | null | undefined,
): { list: BearerList, generatedTokens: BearerGeneratedToken[] } {
  const id = String(input.id || previous?.id || uuid())
  const name = String(input.name || '').trim()
  const prevById = new Map((previous?.keys ?? []).map(key => [key.id, key]))
  const generatedTokens: BearerGeneratedToken[] = []
  const keys: BearerListKey[] = []

  for (const row of input.keys || []) {
    const prev = row.id ? prevById.get(row.id) ?? null : null
    const { key, generatedToken } = normalizeOneKey(row, prev, name)
    keys.push(key)
    if (generatedToken) {
      generatedTokens.push({
        keyId: key.id,
        token: generatedToken,
      })
    }
  }

  return {
    list: {
      id,
      name,
      keys,
    },
    generatedTokens,
  }
}
