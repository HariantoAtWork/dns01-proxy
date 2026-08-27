import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Folder that contains `nuxt.config.ts` / `seed/` when you `cd build/acmedns-nuxt && bun run dev`. */
export function findPackageRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  for (const dir of [process.cwd(), resolve(here, '../..'), resolve(here, '../../..')]) {
    if (existsSync(resolve(dir, 'nuxt.config.ts')) || existsSync(resolve(dir, 'seed/server/config.cfg'))) {
      return dir
    }
  }
  return process.cwd()
}

function resolveMaybeRelative(path: string): string {
  if (isAbsolute(path)) {
    return path
  }
  return resolve(findPackageRoot(), path)
}

function readRuntimeDataRoot(): string | undefined {
  try {
    const value = String(useRuntimeConfig().dataRoot || '').trim()
    return value || undefined
  }
  catch {
    return undefined
  }
}

function readRuntimeLetsencryptDir(): string | undefined {
  try {
    const value = String(useRuntimeConfig().letsencryptDir || '').trim()
    return value || undefined
  }
  catch {
    return undefined
  }
}

/** `$ACMEDNS_DATA_ROOT` / `NUXT_ACMEDNS_DATA_ROOT` / `runtimeConfig.dataRoot` — no legacy fallbacks. */
export function getDataRoot(): string {
  const fromEnv = (process.env.ACMEDNS_DATA_ROOT || process.env.NUXT_ACMEDNS_DATA_ROOT || '').trim()
  if (fromEnv) {
    return resolveMaybeRelative(fromEnv)
  }
  const fromRuntime = readRuntimeDataRoot()
  if (fromRuntime) {
    return resolveMaybeRelative(fromRuntime)
  }
  throw new Error('ACMEDNS_DATA_ROOT (or NUXT_ACMEDNS_DATA_ROOT / runtimeConfig.dataRoot) is required')
}

/** `$ACMEDNS_LETSENCRYPT_DIR` / `NUXT_ACMEDNS_LETSENCRYPT_DIR` / `runtimeConfig.letsencryptDir`. */
export function getLetsencryptDir(): string {
  const fromEnv = (process.env.ACMEDNS_LETSENCRYPT_DIR || process.env.NUXT_ACMEDNS_LETSENCRYPT_DIR || '').trim()
  if (fromEnv) {
    return resolveMaybeRelative(fromEnv)
  }
  const fromRuntime = readRuntimeLetsencryptDir()
  if (fromRuntime) {
    return resolveMaybeRelative(fromRuntime)
  }
  throw new Error('ACMEDNS_LETSENCRYPT_DIR (or NUXT_ACMEDNS_LETSENCRYPT_DIR / runtimeConfig.letsencryptDir) is required')
}

export function dataPath(...segments: string[]): string {
  return join(getDataRoot(), ...segments)
}

export function getServerConfigPath(): string {
  return dataPath('server', 'config.cfg')
}

export function getClientstoragePath(): string {
  return dataPath('client', 'clientstorage.json')
}

export function getCertSettingsPath(): string {
  return dataPath('client', 'cert-settings.json')
}

export function getAppSettingsPath(): string {
  return dataPath('client', 'app-settings.json')
}

export function getDomainsFilePath(): string {
  return dataPath('client', 'domains.txt')
}

export function getBackupDir(): string {
  return dataPath('backup')
}
