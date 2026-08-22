import { compareSync } from 'bcryptjs'
import type { H3Event } from 'h3'
import type { AcmeTxtAccount, AcmeTxtPost } from './types'
import { getByUsername } from './db'
import { getAcmeConfig } from './config'
import { acmeDnsError, isAcmeDnsError } from './errors'
import {
  getValidUsername,
  ipInCidrs,
  validKey,
} from './validation'

/** Dummy bcrypt hash to keep timing closer on unknown users (Go parity). */
const DUMMY_HASH = '$2a$10$8JEFVNYYhLoBysjAxe2yBuXrkDojBQBkVpXEQgyQyjn43SvJ4vL36'

function getIPListFromHeader(header: string): string[] {
  return header
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
}

function clientIp(event: H3Event): string {
  const config = getAcmeConfig()
  if (config.api.use_header) {
    const header = getRequestHeader(event, config.api.header_name) || ''
    const list = getIPListFromHeader(header)
    return list[0] || ''
  }
  return getRequestIP(event, { xForwardedFor: true }) || ''
}

function updateAllowedFromIP(event: H3Event, user: AcmeTxtAccount): boolean {
  const config = getAcmeConfig()
  if (config.api.use_header) {
    const header = getRequestHeader(event, config.api.header_name) || ''
    const list = getIPListFromHeader(header)
    if (list.length === 0) {
      return ipInCidrs('', user.allowfrom)
    }
    return list.some(ip => ipInCidrs(ip, user.allowfrom))
  }
  const ip = clientIp(event)
  return ipInCidrs(ip, user.allowfrom)
}

function getUserFromRequest(event: H3Event): AcmeTxtAccount {
  const uname = getRequestHeader(event, 'X-Api-User') || ''
  const passwd = getRequestHeader(event, 'X-Api-Key') || ''

  let username: string
  try {
    username = getValidUsername(uname)
  }
  catch {
    throw acmeDnsError(401, 'invalid_username')
  }

  if (!validKey(passwd)) {
    throw acmeDnsError(401, 'invalid_api_key')
  }

  const dbuser = getByUsername(username)
  if (!dbuser) {
    compareSync(passwd, DUMMY_HASH)
    throw acmeDnsError(401, 'account_not_found')
  }

  try {
    if (!compareSync(passwd, dbuser.password)) {
      throw acmeDnsError(401, 'forbidden')
    }
  }
  catch (error) {
    if (isAcmeDnsError(error)) {
      throw error
    }
    throw acmeDnsError(401, 'forbidden')
  }

  return dbuser
}

export function authenticateUpdate(event: H3Event, body: { subdomain?: string, txt?: string }): AcmeTxtPost & { account: AcmeTxtAccount } {
  const user = getUserFromRequest(event)

  if (!updateAllowedFromIP(event, user)) {
    console.error('[acmedns] update not allowed from IP')
    throw acmeDnsError(401, 'ip_not_allowed')
  }

  const subdomain = typeof body.subdomain === 'string' ? body.subdomain : ''
  const txt = typeof body.txt === 'string' ? body.txt : ''

  if (user.subdomain !== subdomain) {
    console.error(`[acmedns] subdomain mismatch: got ${subdomain}, expected ${user.subdomain}`)
    throw acmeDnsError(401, 'subdomain_mismatch')
  }

  return {
    subdomain,
    txt,
    account: user,
  }
}
