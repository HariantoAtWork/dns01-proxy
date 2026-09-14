import { v7 as uuid } from 'uuid'
import type {
  BearerGeneratedToken,
  BearerList,
  BearerListInput,
  BearerListKey,
  BearerListKeyInput,
  BearerListKeyPublic,
  BearerListPublic,
  BearerListsFile,
} from '../types/bearerKey'

/** Browser-safe empty draft for the operator UI. */
export function emptyBearerList(): BearerListInput {
  return {
    name: '',
    keys: [{ token: '' }],
  }
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

export function normalizeBearerListKeyFromDisk(raw: unknown, idFallback?: string): BearerListKey {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const id = String(row.id || idFallback || uuid())
  const createdAt = String(row.createdAt || nowIso())
  const token = String(row.token || '').trim()
  const tokenHash = String(row.tokenHash || '').trim()
  return {
    id,
    tokenHash,
    token,
    prefix: String(row.prefix || '').trim() || (token ? `${token.slice(0, 8)}…` : 'sk_…'),
    createdAt,
    updatedAt: String(row.updatedAt || createdAt),
  }
}

export function normalizeBearerListFromDisk(raw: unknown, idFallback?: string): BearerList {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const id = String(row.id || idFallback || uuid())
  const keys = Array.isArray(row.keys)
    ? row.keys.map(item => normalizeBearerListKeyFromDisk(item))
    : []
  return {
    id,
    name: String(row.name || '').trim(),
    keys,
  }
}

/**
 * Normalize on-disk JSON. Also accepts the legacy flat shape
 * `{ version: 1, keys: [...] }` by wrapping each key as its own list.
 */
export function normalizeBearerListsFile(raw: unknown): BearerListsFile {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

  if (Array.isArray(row.lists)) {
    return {
      version: 1,
      lists: row.lists.map(item => normalizeBearerListFromDisk(item)),
    }
  }

  // Legacy proxy-bearer-keys.json: top-level keys → one list per key.
  if (Array.isArray(row.keys)) {
    const lists = row.keys.map((item) => {
      const key = normalizeBearerListKeyFromDisk(item)
      const legacy = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
      const name = String(legacy.name || legacy.label || '').trim() || 'Bearer list'
      return {
        id: key.id,
        name,
        keys: [key],
      } satisfies BearerList
    })
    return { version: 1, lists }
  }

  return { version: 1, lists: [] }
}

export function validateBearerList(list: BearerList): string | null {
  if (!list.name.trim()) {
    return 'Bearer list name is required'
  }
  if (list.keys.length === 0) {
    return 'Add at least one bearer key'
  }
  for (const key of list.keys) {
    if (!key.tokenHash || key.tokenHash.length !== 64) {
      return 'Each key needs a token (custom or auto-generated)'
    }
  }
  return null
}

export function toBearerListKeyPublic(key: BearerListKey): BearerListKeyPublic {
  return {
    id: key.id,
    prefix: key.prefix,
    token: key.token || '',
    tokenSet: Boolean(key.tokenHash),
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
  }
}

export function toBearerListPublic(list: BearerList): BearerListPublic {
  return {
    id: list.id,
    name: list.name,
    keys: list.keys.map(toBearerListKeyPublic),
  }
}

export type { BearerListKeyInput, BearerGeneratedToken }
