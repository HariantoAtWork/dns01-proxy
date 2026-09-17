import type { SettingSource } from '../types/appSettings'
import { getAppSettingsSnapshot } from '../../../../../core/appSettings'
import { envAcmednsAuthHop } from '../../../../../core/env'

/**
 * Auth hop enabled from app-settings or ACMEDNS_AUTH_HOP.
 * config.cfg api.auth_hop is checked on the server via isAuthHopEnabled().
 */
export function resolveAuthHopEnabledSource(): { value: boolean, source: SettingSource } {
  const file = getAppSettingsSnapshot()
  if (typeof file.authHop === 'boolean') {
    return { value: file.authHop, source: 'app-settings' }
  }
  const fromEnv = envAcmednsAuthHop()
  if (fromEnv !== undefined) {
    return { value: fromEnv, source: 'compose/env' }
  }
  return { value: false, source: 'default' }
}

export function resolveAuthHopEnabled(): boolean {
  return resolveAuthHopEnabledSource().value
}
