import { dirname } from 'node:path'
import { promises as fs, readFileSync, existsSync, statSync } from 'node:fs'
import type { AppSettingsFile, SettingSource } from '#shared/types/appSettings'
import { getAppSettingsPath } from '../../../../../server/utils/paths'

let cached: AppSettingsFile | null = null
let cachedMtimeMs = 0

function truthy(raw: string) {
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase())
}

export function resetAppSettingsCache() {
  cached = null
  cachedMtimeMs = 0
}

function loadAppSettingsSync(): AppSettingsFile {
  const path = getAppSettingsPath()
  try {
    if (!existsSync(path)) {
      cached = {}
      cachedMtimeMs = 0
      return cached
    }
    const stat = statSync(path)
    if (cached && stat.mtimeMs === cachedMtimeMs) {
      return cached
    }
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw) as AppSettingsFile
    cached = parsed && typeof parsed === 'object' ? parsed : {}
    cachedMtimeMs = stat.mtimeMs
    return cached
  }
  catch {
    cached = {}
    cachedMtimeMs = 0
    return cached
  }
}

export async function readAppSettingsFile(): Promise<AppSettingsFile> {
  const path = getAppSettingsPath()
  try {
    const raw = await fs.readFile(path, 'utf-8')
    const parsed = JSON.parse(raw) as AppSettingsFile
    cached = parsed && typeof parsed === 'object' ? parsed : {}
    return { ...cached }
  }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      cached = {}
      return {}
    }
    throw error
  }
}

export async function writeAppSettingsFile(settings: AppSettingsFile): Promise<void> {
  const path = getAppSettingsPath()
  await fs.mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  const cleaned: AppSettingsFile = {}
  for (const [key, value] of Object.entries(settings) as Array<[keyof AppSettingsFile, AppSettingsFile[keyof AppSettingsFile]]>) {
    if (value === undefined || value === null) {
      continue
    }
    if (typeof value === 'string' && value === '' && key !== 'administratorPassword') {
      continue
    }
    ;(cleaned as Record<string, unknown>)[key] = value
  }
  await fs.writeFile(tmp, `${JSON.stringify(cleaned, null, 2)}\n`, 'utf-8')
  await fs.rename(tmp, path)
  cached = cleaned
  try {
    cachedMtimeMs = (await fs.stat(path)).mtimeMs
  }
  catch {
    cachedMtimeMs = Date.now()
  }
}

export async function clearAppSettingsFile(): Promise<void> {
  await writeAppSettingsFile({})
}

function envFirst(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return undefined
}

export function getAppSettingsSnapshot(): AppSettingsFile {
  return { ...loadAppSettingsSync() }
}

export function resolveAcmednsUrl(): { value: string, source: SettingSource } {
  const file = loadAppSettingsSync()
  if (typeof file.acmednsUrl === 'string' && file.acmednsUrl.trim()) {
    return { value: file.acmednsUrl.trim().replace(/\/$/, ''), source: 'app-settings' }
  }
  const fromEnv = envFirst('ACMEDNS_URL', 'NUXT_ACMEDNS_URL')
  if (fromEnv) {
    return { value: fromEnv.replace(/\/$/, ''), source: 'compose/env' }
  }
  try {
    const config = useRuntimeConfig()
    const fromRuntime = String(config.acmednsUrl || '').trim()
    if (fromRuntime) {
      return { value: fromRuntime.replace(/\/$/, ''), source: 'compose/env' }
    }
  }
  catch {
    // ignore
  }
  return { value: 'http://127.0.0.1', source: 'default' }
}

export function resolveDefaultAcmednsUrl(): { value: string, source: SettingSource } {
  const file = loadAppSettingsSync()
  if (typeof file.defaultAcmednsUrl === 'string' && file.defaultAcmednsUrl.trim()) {
    return { value: file.defaultAcmednsUrl.trim().replace(/\/$/, ''), source: 'app-settings' }
  }
  const fromEnv = envFirst('NUXT_PUBLIC_DEFAULT_ACMEDNS_URL')
  if (fromEnv) {
    return { value: fromEnv.replace(/\/$/, ''), source: 'compose/env' }
  }
  try {
    const config = useRuntimeConfig()
    const fromPublic = String(config.public?.defaultAcmednsUrl || '').trim()
    if (fromPublic) {
      return { value: fromPublic.replace(/\/$/, ''), source: 'compose/env' }
    }
  }
  catch {
    // ignore
  }
  return resolveAcmednsUrl()
}

export function resolveLetsencryptEmail(): { value: string, source: SettingSource } {
  const file = loadAppSettingsSync()
  if (typeof file.letsencryptEmail === 'string' && file.letsencryptEmail.trim()) {
    return { value: file.letsencryptEmail.trim(), source: 'app-settings' }
  }
  const fromEnv = envFirst('LETSENCRYPT_EMAIL', 'NUXT_LETSENCRYPT_EMAIL')
  if (fromEnv) {
    return { value: fromEnv, source: 'compose/env' }
  }
  try {
    const config = useRuntimeConfig()
    const fromRuntime = String(config.letsencryptEmail || '').trim()
    if (fromRuntime) {
      return { value: fromRuntime, source: 'compose/env' }
    }
  }
  catch {
    // ignore
  }
  return { value: 'admin@example.com', source: 'default' }
}

export function resolveRenewIntervalHours(): { value: number, source: SettingSource } {
  const file = loadAppSettingsSync()
  if (typeof file.renewInterval === 'number' && Number.isFinite(file.renewInterval) && file.renewInterval > 0) {
    return { value: file.renewInterval, source: 'app-settings' }
  }
  const fromEnv = envFirst('RENEW_INTERVAL', 'NUXT_RENEW_INTERVAL')
  if (fromEnv) {
    const n = Number(fromEnv)
    if (Number.isFinite(n) && n > 0) {
      return { value: n, source: 'compose/env' }
    }
  }
  try {
    const config = useRuntimeConfig()
    const n = Number(config.renewInterval)
    if (Number.isFinite(n) && n > 0) {
      return { value: n, source: 'compose/env' }
    }
  }
  catch {
    // ignore
  }
  return { value: 12, source: 'default' }
}

export function resolveCertsAcmeDisabled(): { value: boolean, source: SettingSource } {
  const file = loadAppSettingsSync()
  if (typeof file.certsAcmeDisabled === 'boolean') {
    return { value: file.certsAcmeDisabled, source: 'app-settings' }
  }
  const fromEnv = process.env.CERTS_ACME_DISABLED
    ?? process.env.NUXT_CERTS_ACME_DISABLED
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return { value: truthy(fromEnv), source: 'compose/env' }
  }
  try {
    const config = useRuntimeConfig()
    const raw = String(config.certsAcmeDisabled ?? '')
    if (raw) {
      return { value: truthy(raw), source: 'compose/env' }
    }
  }
  catch {
    // ignore
  }
  return { value: false, source: 'default' }
}

/** When true, the periodic production renew timer does not run (manual Apply still works). */
export function resolveCertsRenewDisabled(): { value: boolean, source: SettingSource } {
  const file = loadAppSettingsSync()
  if (typeof file.certsRenewDisabled === 'boolean') {
    return { value: file.certsRenewDisabled, source: 'app-settings' }
  }
  const fromEnv = process.env.CERTS_RENEW_DISABLED
    ?? process.env.NUXT_CERTS_RENEW_DISABLED
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return { value: truthy(fromEnv), source: 'compose/env' }
  }
  try {
    const config = useRuntimeConfig()
    const raw = String(config.certsRenewDisabled ?? '')
    if (raw) {
      return { value: truthy(raw), source: 'compose/env' }
    }
  }
  catch {
    // ignore
  }
  return { value: false, source: 'default' }
}

export function resolveAdministratorPassword(): { value: string, source: SettingSource } {
  const file = loadAppSettingsSync()
  if (typeof file.administratorPassword === 'string') {
    return { value: file.administratorPassword, source: 'app-settings' }
  }
  const fromEnv = envFirst('ADMINISTRATOR_PASSWORD', 'NUXT_ADMINISTRATOR_PASSWORD')
  if (fromEnv !== undefined) {
    return { value: fromEnv, source: 'compose/env' }
  }
  try {
    const config = useRuntimeConfig()
    const fromRuntime = String(config.administratorPassword || '')
    if (fromRuntime) {
      return { value: fromRuntime, source: 'compose/env' }
    }
  }
  catch {
    // ignore
  }
  return { value: '', source: 'default' }
}

export function resolveTimezone(): { value: string, source: SettingSource } {
  const file = loadAppSettingsSync()
  if (typeof file.tz === 'string' && file.tz.trim()) {
    return { value: file.tz.trim(), source: 'app-settings' }
  }
  const fromEnv = envFirst('TZ')
  if (fromEnv) {
    return { value: fromEnv, source: 'compose/env' }
  }
  return { value: 'UTC', source: 'default' }
}
