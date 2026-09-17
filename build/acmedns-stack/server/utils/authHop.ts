import { v7 as uuid } from 'uuid'
import { getAppSettingsSnapshot } from '../../core/appSettings'
import { envAcmednsAuthHop } from '../../core/env'
import { getAcmeConfig } from './config'
import { ensureAliasStoreReady, requireAliasStore } from './aliasStoreRegistry'
import { isUuidLabel } from './validation'

/** Opt-in auth hop: app-settings → ACMEDNS_AUTH_HOP → config.cfg api.auth_hop → false. */
export function isAuthHopEnabled(): boolean {
  const file = getAppSettingsSnapshot()
  if (typeof file.authHop === 'boolean') {
    return file.authHop
  }
  const fromEnv = envAcmednsAuthHop()
  if (fromEnv !== undefined) {
    return fromEnv
  }
  try {
    return Boolean(getAcmeConfig().api.auth_hop)
  }
  catch {
    return false
  }
}

export function mintAuthHop(entryLabel: string): string {
  const label = entryLabel.trim().toLowerCase()
  if (!label) {
    throw new Error('auth hop entry label is empty')
  }
  const hopLabel = uuid().toLowerCase()
  ensureAliasStoreReady()
  requireAliasStore().mint(label, hopLabel)
  return hopLabel
}

export function clearAuthHop(entryLabel: string): boolean {
  ensureAliasStoreReady()
  return requireAliasStore().clear(entryLabel.trim().toLowerCase())
}

export function getAliasTarget(entryLabel: string): string | null {
  ensureAliasStoreReady()
  return requireAliasStore().getTarget(entryLabel.trim().toLowerCase())
}

export { isUuidLabel }
