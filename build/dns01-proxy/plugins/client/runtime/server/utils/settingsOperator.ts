import type {
  AppSettingsFile,
  AppSettingsPutBody,
} from '#shared/types/appSettings'
import { normalizeTinyDomain } from '#shared/utils/tinyDomain'
import {
  clearAppSettingsFile,
  readAppSettingsFile,
  writeAppSettingsFile,
} from './appSettings'
import { isHttpUrl } from './settingsConfigPatch'

export async function applyOperator(
  patch: NonNullable<AppSettingsPutBody['operator']>,
  clear: boolean,
) {
  if (clear) {
    await clearAppSettingsFile()
    const { syncRenewScheduler } = await import('./certRenewScheduler')
    syncRenewScheduler()
    return
  }

  const current = await readAppSettingsFile()
  const next: AppSettingsFile = { ...current }

  if (patch.acmednsUrl !== undefined) {
    const value = String(patch.acmednsUrl).trim().replace(/\/$/, '')
    if (value && !isHttpUrl(value)) {
      throw createError({ statusCode: 400, statusMessage: 'ACMEDNS_URL must be an http(s) URL' })
    }
    if (value) {
      next.acmednsUrl = value
    }
    else {
      delete next.acmednsUrl
    }
  }
  if (patch.defaultAcmednsUrl !== undefined) {
    const value = String(patch.defaultAcmednsUrl).trim().replace(/\/$/, '')
    if (value && !isHttpUrl(value)) {
      throw createError({ statusCode: 400, statusMessage: 'Default ACMEDNS URL must be an http(s) URL' })
    }
    if (value) {
      next.defaultAcmednsUrl = value
    }
    else {
      delete next.defaultAcmednsUrl
    }
  }
  if (patch.letsencryptEmail !== undefined) {
    const value = String(patch.letsencryptEmail).trim()
    if (value) {
      next.letsencryptEmail = value
    }
    else {
      delete next.letsencryptEmail
    }
  }
  if (patch.renewInterval !== undefined) {
    const n = Number(patch.renewInterval)
    if (!Number.isFinite(n) || n <= 0) {
      throw createError({ statusCode: 400, statusMessage: 'RENEW_INTERVAL must be a positive number' })
    }
    next.renewInterval = n
  }
  if (patch.certsAcmeDisabled !== undefined) {
    next.certsAcmeDisabled = Boolean(patch.certsAcmeDisabled)
  }
  if (patch.certsRenewDisabled !== undefined) {
    next.certsRenewDisabled = Boolean(patch.certsRenewDisabled)
  }
  if (patch.tz !== undefined) {
    const value = String(patch.tz).trim()
    if (value) {
      next.tz = value
    }
    else {
      delete next.tz
    }
  }
  if (patch.administratorPassword !== undefined && patch.administratorPassword !== null) {
    next.administratorPassword = String(patch.administratorPassword)
  }
  if (patch.tinyDomain !== undefined && patch.tinyDomain !== null) {
    const normalised = normalizeTinyDomain(String(patch.tinyDomain))
    if (normalised) {
      next.tinyDomain = normalised
    }
    else {
      delete next.tinyDomain
    }
  }
  if (patch.acmeTxtSettleMs !== undefined) {
    const n = Number(patch.acmeTxtSettleMs)
    if (!Number.isFinite(n) || n < 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'ACME_TXT_SETTLE_MS must be a number ≥ 0 (0 disables settle)',
      })
    }
    next.acmeTxtSettleMs = Math.floor(n)
  }
  if (patch.acmeTxtHoldMs !== undefined) {
    const n = Number(patch.acmeTxtHoldMs)
    if (!Number.isFinite(n) || n <= 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'ACME_TXT_HOLD_MS must be a number > 0',
      })
    }
    next.acmeTxtHoldMs = Math.floor(n)
  }
  if (patch.authHop !== undefined) {
    next.authHop = Boolean(patch.authHop)
  }

  await writeAppSettingsFile(next)

  if (patch.certsRenewDisabled !== undefined) {
    const { syncRenewScheduler } = await import('./certRenewScheduler')
    syncRenewScheduler()
  }
}
