import type { SettingSource } from '../../../client/runtime/shared/types/appSettings'
import { getAppSettingsSnapshot } from '../../../../core/appSettings'

/** Let's Encrypt names-per-certificate cap; matches acme-dns slot count. */
export const TXT_RECORD_SLOTS = 100

/** Pause after TXT online before LE validate (`ACME_TXT_SETTLE_MS`; 0 disables). */
export const DEFAULT_TXT_SETTLE_MS = 5_000

/**
 * Extra ms to keep a challenge TXT slot after the settle window
 * (`ACME_TXT_HOLD_MS`). Store lifetime = settleMs + holdMs.
 */
export const DEFAULT_TXT_HOLD_MS = 300_000

/** Pause after TXT is visible online, before telling Let's Encrypt to validate. */
export function resolveAcmeTxtSettleMsSource(): { value: number, source: SettingSource } {
  const file = getAppSettingsSnapshot()
  if (typeof file.acmeTxtSettleMs === 'number' && Number.isFinite(file.acmeTxtSettleMs) && file.acmeTxtSettleMs >= 0) {
    return { value: Math.floor(file.acmeTxtSettleMs), source: 'app-settings' }
  }
  const value = Number(process.env.ACME_TXT_SETTLE_MS)
  if (Number.isFinite(value) && value >= 0) {
    return { value, source: 'compose/env' }
  }
  return { value: DEFAULT_TXT_SETTLE_MS, source: 'default' }
}

export function resolveAcmeTxtSettleMs(): number {
  return resolveAcmeTxtSettleMsSource().value
}

/** Extra retention after settle (`ACME_TXT_HOLD_MS`). */
export function resolveAcmeTxtHoldMsSource(): { value: number, source: SettingSource } {
  const file = getAppSettingsSnapshot()
  if (typeof file.acmeTxtHoldMs === 'number' && Number.isFinite(file.acmeTxtHoldMs) && file.acmeTxtHoldMs > 0) {
    return { value: Math.floor(file.acmeTxtHoldMs), source: 'app-settings' }
  }
  const holdMs = Number(process.env.ACME_TXT_HOLD_MS)
  if (Number.isFinite(holdMs) && holdMs > 0) {
    return { value: Math.floor(holdMs), source: 'compose/env' }
  }
  return { value: DEFAULT_TXT_HOLD_MS, source: 'default' }
}

export function resolveAcmeTxtHoldMs(): number {
  return resolveAcmeTxtHoldMsSource().value
}

/**
 * How long a published challenge TXT stays in the store (seconds, for the store API).
 * = ceil((settleMs + holdMs) / 1000) (settle may be 0).
 */
export function resolveTxtTtlSeconds(): number {
  return Math.max(1, Math.ceil((resolveAcmeTxtSettleMs() + resolveAcmeTxtHoldMs()) / 1000))
}
