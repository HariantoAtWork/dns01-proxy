import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { envAcmednsDataRoot, envAcmednsLetsencryptDir } from './env'

export interface DataRootOptions {
  runtimeDataRoot?: string
  runtimeLetsencryptDir?: string
}

/** Folder that contains `nuxt.config.ts` / `seed/` when you `cd build/acmedns-stack && bun run dev`. */
export function findPackageRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  for (const dir of [process.cwd(), resolve(here, '..'), resolve(here, '../..')]) {
    if (existsSync(resolve(dir, 'nuxt.config.ts')) || existsSync(resolve(dir, 'seed/server/config.cfg.template'))) {
      return dir
    }
  }
  return process.cwd()
}

export function resolveMaybeRelative(path: string): string {
  if (isAbsolute(path)) {
    return path
  }
  return resolve(findPackageRoot(), path)
}

/** `$ACMEDNS_DATA_ROOT` / `NUXT_ACMEDNS_DATA_ROOT` / optional runtime override — no legacy fallbacks. */
export function getDataRoot(options: DataRootOptions = {}): string {
  const fromEnv = envAcmednsDataRoot()
  if (fromEnv) {
    return resolveMaybeRelative(fromEnv)
  }
  const fromRuntime = options.runtimeDataRoot?.trim()
  if (fromRuntime) {
    return resolveMaybeRelative(fromRuntime)
  }
  throw new Error('ACMEDNS_DATA_ROOT (or NUXT_ACMEDNS_DATA_ROOT / runtimeConfig.dataRoot) is required')
}

/** `$ACMEDNS_LETSENCRYPT_DIR` / `NUXT_ACMEDNS_LETSENCRYPT_DIR` / optional runtime override. */
export function getLetsencryptDir(options: DataRootOptions = {}): string {
  const fromEnv = envAcmednsLetsencryptDir()
  if (fromEnv) {
    return resolveMaybeRelative(fromEnv)
  }
  const fromRuntime = options.runtimeLetsencryptDir?.trim()
  if (fromRuntime) {
    return resolveMaybeRelative(fromRuntime)
  }
  throw new Error('ACMEDNS_LETSENCRYPT_DIR (or NUXT_ACMEDNS_LETSENCRYPT_DIR / runtimeConfig.letsencryptDir) is required')
}

export function dataPath(...segments: string[]): string {
  return join(getDataRoot(), ...segments)
}

export function dataPathWithOptions(options: DataRootOptions, ...segments: string[]): string {
  return join(getDataRoot(options), ...segments)
}

export function getServerConfigPath(options?: DataRootOptions): string {
  return dataPathWithOptions(options ?? {}, 'server', 'config.cfg')
}

export function getClientstoragePath(options?: DataRootOptions): string {
  return dataPathWithOptions(options ?? {}, 'client', 'clientstorage.json')
}

export function getCertSettingsPath(options?: DataRootOptions): string {
  return dataPathWithOptions(options ?? {}, 'client', 'cert-settings.json')
}

export function getAppSettingsPath(options?: DataRootOptions): string {
  return dataPathWithOptions(options ?? {}, 'client', 'app-settings.json')
}

export function getDomainsFilePath(options?: DataRootOptions): string {
  return dataPathWithOptions(options ?? {}, 'client', 'domains.txt')
}

export function getLabDomainsFilePath(options?: DataRootOptions): string {
  return dataPathWithOptions(options ?? {}, 'client', 'lab-domains.txt')
}

export function getProxyHostsFilePath(options?: DataRootOptions): string {
  return dataPathWithOptions(options ?? {}, 'client', 'proxy-hosts.json')
}

export function getProxyAccessListsFilePath(options?: DataRootOptions): string {
  return dataPathWithOptions(options ?? {}, 'client', 'proxy-access-lists.json')
}

export function getProxySettingsFilePath(options?: DataRootOptions): string {
  return dataPathWithOptions(options ?? {}, 'client', 'proxy-settings.json')
}

export function getBackupDir(options?: DataRootOptions): string {
  return dataPathWithOptions(options ?? {}, 'backup')
}
