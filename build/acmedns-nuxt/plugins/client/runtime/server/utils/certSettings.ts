import { dirname, join } from 'node:path'
import { promises as fs } from 'node:fs'
import type { CertSettings, LetsEncryptDirectoryMode } from '#shared/types/certs'
import { getLetsencryptDir, getCertSettingsPath } from '../../../../../server/utils/paths'

const DEFAULT: CertSettings = {
  directoryMode: 'production',
}

export async function readCertSettings(): Promise<CertSettings> {
  const path = getCertSettingsPath()
  try {
    const raw = await fs.readFile(path, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<CertSettings>
    const mode = parsed.directoryMode
    if (mode === 'staging' || mode === 'production') {
      return { directoryMode: mode }
    }
    return { ...DEFAULT }
  }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return { ...DEFAULT }
    }
    throw error
  }
}

export async function writeCertSettings(settings: CertSettings) {
  const path = getCertSettingsPath()
  await fs.mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  await fs.writeFile(tmp, `${JSON.stringify(settings, null, 2)}\n`, 'utf-8')
  await fs.rename(tmp, path)
}

/** False when CERTS_ACME_DISABLED — blocks production issue/renew only. */
export function isProductionAcmeEnabled() {
  const config = useRuntimeConfig()
  const raw = process.env.CERTS_ACME_DISABLED
    ?? process.env.NUXT_CERTS_ACME_DISABLED
    ?? String(config.certsAcmeDisabled ?? 'false')
  return !['1', 'true', 'yes', 'on'].includes(raw.toLowerCase())
}

/** Alias for renew timer / settings: production ACME on/off. */
export function isAcmeEnabled() {
  return isProductionAcmeEnabled()
}

export function isAcmeEnabledForMode(mode: LetsEncryptDirectoryMode) {
  return mode === 'staging' || isProductionAcmeEnabled()
}

export function getLetsEncryptEmail() {
  const config = useRuntimeConfig()
  return process.env.LETSENCRYPT_EMAIL
    || process.env.NUXT_LETSENCRYPT_EMAIL
    || config.letsencryptEmail
    || 'admin@example.com'
}

export function getRenewIntervalHours() {
  const config = useRuntimeConfig()
  const raw = process.env.RENEW_INTERVAL
    || process.env.NUXT_RENEW_INTERVAL
    || config.renewInterval
    || 12
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 12
}

export function assertDirectoryMode(value: unknown): LetsEncryptDirectoryMode {
  if (value === 'staging' || value === 'production') {
    return value
  }
  throw createError({
    statusCode: 400,
    statusMessage: 'directoryMode must be staging or production',
  })
}

export function accountsDir() {
  return join(getLetsencryptDir(), 'accounts')
}
