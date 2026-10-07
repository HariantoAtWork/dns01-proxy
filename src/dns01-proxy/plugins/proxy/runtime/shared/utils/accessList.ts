import { v7 as uuid } from 'uuid'
import type {
  AccessList,
  AccessListInput,
  AccessListPublic,
  AccessListRule,
  AccessListUser,
  AccessListUserInput,
  AccessListsFile,
  AccessRuleDirective,
  ProxySettings,
} from '../types/accessList'

function stripIpBrackets(value: string): string {
  return value.replace(/[\[\]]+/g, '')
}

/** Browser-safe IP family check (avoid node:net in client bundles). */
function ipFamily(value: string): 4 | 6 | 0 {
  const cleaned = stripIpBrackets(value)
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(cleaned)) {
    const parts = cleaned.split('.').map(Number)
    if (parts.length === 4 && parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255)) {
      return 4
    }
    return 0
  }
  // Loose IPv6: at least one colon, hex/colon only (optional zone id stripped).
  const bare = cleaned.split('%')[0] || ''
  if (bare.includes(':') && /^[0-9a-fA-F:.]+$/.test(bare)) {
    return 6
  }
  return 0
}

export const ACCESS_LIST_PRESETS: Array<{ label: string, addresses: string[] }> = [
  { label: 'Tailscale', addresses: ['100.64.0.0/10'] },
  {
    label: 'Private LAN',
    addresses: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'],
  },
  { label: 'Loopback', addresses: ['127.0.0.1/32', '::1/128'] },
]

export function emptyAccessList(): AccessListInput {
  return {
    name: '',
    satisfyAny: false,
    passAuthUpstream: false,
    users: [],
    rules: [],
  }
}

export function defaultProxySettings(): ProxySettings {
  return { trustForwardedClientIp: false }
}

export function normalizeProxySettings(raw: unknown): ProxySettings {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    trustForwardedClientIp: Boolean(row.trustForwardedClientIp),
  }
}

/** Bare IP → /32 or /128; CIDR left as-is after sanitize. */
export function normalizeAccessAddress(raw: string): string | null {
  const trimmed = stripIpBrackets(raw.trim())
  if (!trimmed) {
    return null
  }
  if (trimmed.includes('/')) {
    const slash = trimmed.indexOf('/')
    const base = trimmed.slice(0, slash)
    const prefix = Number(trimmed.slice(slash + 1))
    const family = ipFamily(base)
    if (family === 4 && Number.isInteger(prefix) && prefix >= 0 && prefix <= 32) {
      return `${base}/${prefix}`
    }
    if (family === 6 && Number.isInteger(prefix) && prefix >= 0 && prefix <= 128) {
      return `${base}/${prefix}`
    }
    return null
  }
  const family = ipFamily(trimmed)
  if (family === 4) {
    return `${trimmed}/32`
  }
  if (family === 6) {
    return `${trimmed}/128`
  }
  return null
}

export function validateAccessAddress(raw: string): string | null {
  if (!normalizeAccessAddress(raw)) {
    return `Invalid IP or CIDR: ${raw}`
  }
  return null
}

function asDirective(value: unknown): AccessRuleDirective {
  return value === 'deny' ? 'deny' : 'allow'
}

function asRule(raw: unknown): AccessListRule | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const row = raw as Record<string, unknown>
  const address = normalizeAccessAddress(String(row.address || ''))
  if (!address) {
    return null
  }
  return {
    directive: asDirective(row.directive),
    address,
  }
}

async function hashPassword(plain: string): Promise<string> {
  return Bun.password.hash(plain)
}

function asStoredUser(raw: unknown): AccessListUser | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const row = raw as Record<string, unknown>
  const username = String(row.username || '').trim()
  const passwordHash = String(row.passwordHash || '').trim()
  if (!username || !passwordHash) {
    return null
  }
  return { username, passwordHash }
}

/**
 * Merge user rows: new/changed plaintext passwords are hashed;
 * empty password on an existing username keeps the prior hash.
 */
export async function normalizeAccessListUsers(
  input: AccessListUserInput[],
  previous: AccessListUser[] = [],
): Promise<AccessListUser[]> {
  const prevByName = new Map(previous.map(user => [user.username.toLowerCase(), user]))
  const out: AccessListUser[] = []
  const seen = new Set<string>()

  for (const row of input) {
    const username = String(row.username || '').trim()
    if (!username) {
      continue
    }
    const key = username.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)

    const password = typeof row.password === 'string' ? row.password : ''
    const prev = prevByName.get(key)

    if (password) {
      out.push({ username, passwordHash: await hashPassword(password) })
      continue
    }

    if (prev?.passwordHash) {
      out.push({ username, passwordHash: prev.passwordHash })
    }
  }

  return out
}

/** Load from disk — passwordHash values are kept as-is. */
export function normalizeAccessListFromDisk(raw: unknown, idFallback?: string): AccessList {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const id = String(row.id || idFallback || uuid())
  const name = String(row.name || '').trim()
  const rules = Array.isArray(row.rules)
    ? row.rules.map(asRule).filter((item): item is AccessListRule => Boolean(item))
    : []
  const users = Array.isArray(row.users)
    ? row.users.map(asStoredUser).filter((item): item is AccessListUser => Boolean(item))
    : []

  return {
    id,
    name,
    satisfyAny: Boolean(row.satisfyAny),
    passAuthUpstream: Boolean(row.passAuthUpstream),
    users,
    rules,
  }
}

export function normalizeAccessListsFile(raw: unknown): AccessListsFile {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const lists = Array.isArray(row.lists)
    ? row.lists.map(item => normalizeAccessListFromDisk(item))
    : []
  return { version: 1, lists }
}

/** Normalize API/UI input (hashes new passwords). */
export async function normalizeAccessListInput(
  input: AccessListInput,
  previous?: AccessList | null,
): Promise<AccessList> {
  const id = String(input.id || previous?.id || uuid())
  const users = await normalizeAccessListUsers(input.users || [], previous?.users ?? [])
  const rules = (input.rules || [])
    .map(rule => asRule(rule))
    .filter((item): item is AccessListRule => Boolean(item))

  return {
    id,
    name: String(input.name || '').trim(),
    satisfyAny: Boolean(input.satisfyAny),
    passAuthUpstream: Boolean(input.passAuthUpstream),
    users,
    rules,
  }
}

export function validateAccessList(list: AccessList): string | null {
  if (!list.name.trim()) {
    return 'Access list name is required'
  }
  for (const rule of list.rules) {
    const err = validateAccessAddress(rule.address)
    if (err) {
      return err
    }
  }
  for (const user of list.users) {
    if (!user.username.trim()) {
      return 'Username is required'
    }
    if (!user.passwordHash) {
      return `Password required for user ${user.username}`
    }
  }
  return null
}

export function toAccessListPublic(list: AccessList): AccessListPublic {
  return {
    id: list.id,
    name: list.name,
    satisfyAny: list.satisfyAny,
    passAuthUpstream: list.passAuthUpstream,
    users: list.users.map(user => ({
      username: user.username,
      passwordSet: Boolean(user.passwordHash),
    })),
    rules: list.rules.map(rule => ({ ...rule })),
  }
}

export function parseBasicAuthHeader(header: string | null): { username: string, password: string } | null {
  if (!header) {
    return null
  }
  const match = /^\s*Basic\s+(\S+)\s*$/i.exec(header)
  if (!match) {
    return null
  }
  try {
    const decoded = atob(match[1]!)
    const colon = decoded.indexOf(':')
    if (colon < 0) {
      return null
    }
    return {
      username: decoded.slice(0, colon),
      password: decoded.slice(colon + 1),
    }
  }
  catch {
    return null
  }
}
