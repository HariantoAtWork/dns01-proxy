import type { AccessList, AccessListRule, AccessListUser } from '../../plugins/proxy/runtime/shared/types/accessList'
import {
  normalizeAccessAddress,
  parseBasicAuthHeader,
} from '../../plugins/proxy/runtime/shared/utils/accessList'
import { ipInCidrs, sanitizeIPv6addr } from '../utils/validation'

export function addressMatchesClientIp(clientIp: string, address: string): boolean {
  const cidr = normalizeAccessAddress(address)
  if (!cidr) {
    return false
  }
  return ipInCidrs(sanitizeIPv6addr(clientIp), [cidr])
}

/**
 * First matching rule wins; if ≥1 rule and none match → implicit deny.
 * Unknown / empty client IP never matches an allow (or deny) address.
 */
export function evaluateIpRules(
  rules: AccessListRule[],
  clientIp: string | null,
): { matched: boolean, allowed: boolean } {
  if (rules.length === 0) {
    return { matched: false, allowed: true }
  }
  if (!clientIp) {
    return { matched: true, allowed: false }
  }
  for (const rule of rules) {
    if (!addressMatchesClientIp(clientIp, rule.address)) {
      continue
    }
    return { matched: true, allowed: rule.directive === 'allow' }
  }
  return { matched: true, allowed: false }
}

export async function verifyAccessListBasicAuth(
  users: AccessListUser[],
  header: string | null,
): Promise<boolean> {
  if (users.length === 0) {
    return true
  }
  const creds = parseBasicAuthHeader(header)
  if (!creds) {
    return false
  }
  const user = users.find(item => item.username === creds.username)
  if (!user) {
    return false
  }
  try {
    return await Bun.password.verify(creds.password, user.passwordHash)
  }
  catch {
    return false
  }
}

export type AccessEvalResult =
  | { ok: true, stripAuthorization: boolean }
  | { ok: false, status: 401 | 403, reason: string }

/**
 * Evaluate an Access List for an edge request.
 * Empty rules + empty users → allow-all.
 */
export async function evaluateAccessList(
  list: AccessList,
  clientIp: string | null,
  authorizationHeader: string | null,
): Promise<AccessEvalResult> {
  const hasRules = list.rules.length > 0
  const hasUsers = list.users.length > 0
  if (!hasRules && !hasUsers) {
    return { ok: true, stripAuthorization: !list.passAuthUpstream }
  }

  const ip = evaluateIpRules(list.rules, clientIp)
  const ipPass = !hasRules || ip.allowed
  const authPresented = Boolean(parseBasicAuthHeader(authorizationHeader))
  const authPass = hasUsers
    ? await verifyAccessListBasicAuth(list.users, authorizationHeader)
    : true

  if (list.satisfyAny && hasRules && hasUsers) {
    if (ipPass || authPass) {
      return { ok: true, stripAuthorization: !list.passAuthUpstream }
    }
    if (!authPresented) {
      return { ok: false, status: 401, reason: 'basic-auth-required' }
    }
    return { ok: false, status: 403, reason: 'access-denied' }
  }

  if (hasRules && !ipPass) {
    return { ok: false, status: 403, reason: 'access-denied' }
  }
  if (hasUsers && !authPass) {
    if (!authPresented) {
      return { ok: false, status: 401, reason: 'basic-auth-required' }
    }
    return { ok: false, status: 403, reason: 'access-denied' }
  }

  return { ok: true, stripAuthorization: !list.passAuthUpstream }
}
