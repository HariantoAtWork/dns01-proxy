import { dirname, join } from 'node:path'
import { promises as fs } from 'node:fs'
import type { CertSettings, LetsEncryptDirectoryMode } from '#shared/types/certs'
import { getLetsencryptDir, getCertSettingsPath } from '../../../../../server/utils/paths'
import {
  resolveCertsAcmeDisabled,
  resolveLetsencryptEmail,
  resolveRenewIntervalHours,
} from './appSettings'

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
  return !resolveCertsAcmeDisabled().value
}

/** Alias for renew timer / settings: production ACME on/off. */
export function isAcmeEnabled() {
  return isProductionAcmeEnabled()
}

export function isAcmeEnabledForMode(mode: LetsEncryptDirectoryMode) {
  return mode === 'staging' || isProductionAcmeEnabled()
}

export function getLetsEncryptEmail() {
  return resolveLetsencryptEmail().value
}

export function getRenewIntervalHours() {
  return resolveRenewIntervalHours().value
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
