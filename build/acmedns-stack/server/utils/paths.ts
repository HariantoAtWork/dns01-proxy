import { join } from 'node:path'
import {
  findPackageRoot,
  resolveMaybeRelative,
  getDataRoot as getCoreDataRoot,
  getLetsencryptDir as getCoreLetsencryptDir,
  getServerConfigPath as getCoreServerConfigPath,
  getClientstoragePath as getCoreClientstoragePath,
  getCertSettingsPath as getCoreCertSettingsPath,
  getAppSettingsPath as getCoreAppSettingsPath,
  getDomainsFilePath as getCoreDomainsFilePath,
  getBackupDir as getCoreBackupDir,
  type DataRootOptions,
} from '../../core/paths'

export { findPackageRoot, resolveMaybeRelative }

function runtimeOptions(): DataRootOptions {
  const options: DataRootOptions = {}
  try {
    const config = useRuntimeConfig()
    options.runtimeDataRoot = String(config.dataRoot || '').trim() || undefined
    options.runtimeLetsencryptDir = String(config.letsencryptDir || '').trim() || undefined
  }
  catch {
    // Nitro auto-import unavailable outside Nuxt runtime.
  }
  return options
}

/** `$ACMEDNS_DATA_ROOT` / `NUXT_ACMEDNS_DATA_ROOT` / `runtimeConfig.dataRoot` — no legacy fallbacks. */
export function getDataRoot(): string {
  return getCoreDataRoot(runtimeOptions())
}

/** `$ACMEDNS_LETSENCRYPT_DIR` / `NUXT_ACMEDNS_LETSENCRYPT_DIR` / `runtimeConfig.letsencryptDir`. */
export function getLetsencryptDir(): string {
  return getCoreLetsencryptDir(runtimeOptions())
}

export function dataPath(...segments: string[]): string {
  return join(getDataRoot(), ...segments)
}

export function getServerConfigPath(): string {
  return getCoreServerConfigPath(runtimeOptions())
}

export function getClientstoragePath(): string {
  return getCoreClientstoragePath(runtimeOptions())
}

export function getCertSettingsPath(): string {
  return getCoreCertSettingsPath(runtimeOptions())
}

export function getAppSettingsPath(): string {
  return getCoreAppSettingsPath(runtimeOptions())
}

export function getDomainsFilePath(): string {
  return getCoreDomainsFilePath(runtimeOptions())
}

export function getBackupDir(): string {
  return getCoreBackupDir(runtimeOptions())
}
