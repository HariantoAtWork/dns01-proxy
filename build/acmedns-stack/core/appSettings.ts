import { existsSync, readFileSync, statSync } from 'node:fs'
import type { AppSettingsFile, SettingSource } from '../plugins/client/runtime/shared/types/appSettings'
import { normalizeTinyDomain, tinyDomainFromEnv } from '../plugins/client/runtime/shared/utils/tinyDomain'
import { getAppSettingsPath, type DataRootOptions } from './paths'

let cached: AppSettingsFile | null = null
let cachedMtimeMs = 0

export function resetAppSettingsCoreCache() {
  cached = null
  cachedMtimeMs = 0
}

function loadAppSettingsSync(options?: DataRootOptions): AppSettingsFile {
  const path = getAppSettingsPath(options)
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

export function getAppSettingsSnapshot(options?: DataRootOptions): AppSettingsFile {
  return { ...loadAppSettingsSync(options) }
}

/** Effective ACMEDNS_TINY_DOMAIN — dashboard override wins over compose/env. */
export function resolveTinyDomain(options?: DataRootOptions): { value: string, source: SettingSource } {
  const file = loadAppSettingsSync(options)
  if (typeof file.tinyDomain === 'string') {
    const normalised = normalizeTinyDomain(file.tinyDomain)
    if (normalised) {
      return { value: normalised, source: 'app-settings' }
    }
  }
  const fromEnv = tinyDomainFromEnv()
  if (fromEnv) {
    return { value: fromEnv, source: 'compose/env' }
  }
  return { value: '', source: 'default' }
}
