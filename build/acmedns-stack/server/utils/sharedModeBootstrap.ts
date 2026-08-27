import { compareSync } from 'bcryptjs'
import type { AcmeDnsConfig } from './types'
import { getAcmeConfig } from './config'
import {
  getByUsername,
  getSharedPlaintextPassword,
  upsertSharedAccount,
} from './db'
import { generatePassword } from './validation'
import {
  SHARED_MODE_USERNAME,
  buildSharedCredentials,
  zoneApexTxtSubdomain,
  type SharedModeContext,
} from '../../plugins/client/runtime/shared/utils/tinyModeDns'
import { resolveAcmednsUrl } from '../../plugins/client/runtime/server/utils/appSettings'
import { envAcmednsSharedKey } from '../../core/env'

export function isSharedMode(config?: AcmeDnsConfig): boolean {
  const cfg = config ?? getAcmeConfig()
  return Boolean(cfg.api.shared_mode)
}

export function sharedModeUsername(config?: AcmeDnsConfig): string {
  const cfg = config ?? getAcmeConfig()
  const username = (cfg.api.shared_username || SHARED_MODE_USERNAME).trim()
  return username || SHARED_MODE_USERNAME
}

export function ensureSharedModeAccount(config?: AcmeDnsConfig): {
  username: string
  plaintextPassword: string
  subdomain: string
} {
  const cfg = config ?? getAcmeConfig()
  if (!cfg.api.shared_mode) {
    throw new Error('shared mode is disabled')
  }

  const username = sharedModeUsername(cfg)
  const subdomain = zoneApexTxtSubdomain(cfg.general.domain)
  const configured = (cfg.api.shared_password || envAcmednsSharedKey() || '').trim()
  const stored = getSharedPlaintextPassword()
  const plaintextPassword = configured || stored || generatePassword(40)

  upsertSharedAccount(username, subdomain, plaintextPassword)

  return { username, plaintextPassword, subdomain }
}

export function getSharedModeContext(config?: AcmeDnsConfig): SharedModeContext | null {
  const cfg = config ?? getAcmeConfig()
  if (!cfg.api.shared_mode) {
    return null
  }

  const { username, plaintextPassword } = ensureSharedModeAccount(cfg)
  const authZone = cfg.general.domain.replace(/\.$/, '')
  const serverUrl = resolveAcmednsUrl().value || `https://${authZone}`

  return {
    authZone,
    serverUrl,
    account: buildSharedCredentials({
      authZone,
      serverUrl,
      username,
      password: plaintextPassword,
    }),
  }
}

export function getSharedAccountForAuth(config?: AcmeDnsConfig) {
  const cfg = config ?? getAcmeConfig()
  const username = sharedModeUsername(cfg)
  const account = getByUsername(username)
  if (!account) {
    return null
  }
  return account
}

/** Compare plaintext key against stored bcrypt hash. */
export function sharedPasswordMatches(plaintext: string, config?: AcmeDnsConfig): boolean {
  const account = getSharedAccountForAuth(config)
  if (!account) {
    return false
  }
  try {
    return compareSync(plaintext, account.password)
  }
  catch {
    return false
  }
}
