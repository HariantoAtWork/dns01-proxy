import { dirname, join, resolve } from 'node:path'
import { promises as fs } from 'node:fs'
import type { CertSettings, LetsEncryptDirectoryMode } from '#shared/types/certs'
import { getCertbotConfigDir } from './letsencryptFs'

const DEFAULT: CertSettings = {
  directoryMode: 'production',
}

export function getCertSettingsPath() {
  const config = useRuntimeConfig()
  const envPath = process.env.CERT_SETTINGS_FILE
    || process.env.NUXT_CERT_SETTINGS_FILE
    || config.certSettingsFile
    || 'config/cert-settings.json'

  if (envPath.startsWith('/')) {
    return envPath
  }
  return resolve(process.cwd(), envPath)
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

export function isAcmeEnabled() {
  const config = useRuntimeConfig()
  const raw = process.env.CERTS_ACME_ENABLED
    ?? process.env.NUXT_CERTS_ACME_ENABLED
    ?? String(config.certsAcmeEnabled ?? 'true')
  return !['0', 'false', 'no', 'off'].includes(raw.toLowerCase())
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
  return join(getCertbotConfigDir(), 'accounts')
}
