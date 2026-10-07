import {
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import {
  configTemplatePathFor,
  configTemplateProfileFromPath,
  renderConfigTemplateValidated,
} from '../../core/renderConfigTemplate'
import {
  dataPath,
  findPackageRoot,
  getBackupDir,
  getServerConfigPath,
} from './paths'

const CLIENT_SEED_FILES = [
  'clientstorage.json',
  'domains.txt',
  'cert-settings.json',
] as const

function pathHasContent(path: string) {
  try {
    const st = statSync(path)
    return st.isFile() && st.size > 0
  }
  catch {
    return false
  }
}

function seedDir(path: string) {
  mkdirSync(path, { recursive: true })
}

function seedFileFromTemplate(dest: string, src: string, fallback?: string) {
  if (pathHasContent(dest)) {
    return
  }
  mkdirSync(dirname(dest), { recursive: true })
  if (pathHasContent(src)) {
    writeFileSync(dest, readFileSync(src, 'utf8'), 'utf8')
    console.info(`[acmedns] seeded ${dest} from ${src}`)
    return
  }
  if (fallback !== undefined) {
    writeFileSync(dest, fallback.endsWith('\n') ? fallback : `${fallback}\n`, 'utf8')
    console.info(`[acmedns] seeded ${dest} from embedded default`)
  }
}

/**
 * Ensure `$ACMEDNS_DATA_ROOT/{server,client,backup}` exist and copy missing
 * client templates from `seed/client/`. Server config is seeded separately.
 */
export function seedDataRootSync() {
  const packageRoot = findPackageRoot()
  const seedRoot = resolve(packageRoot, 'seed')

  seedDir(dataPath('server'))
  seedDir(dataPath('client'))
  seedDir(getBackupDir())

  for (const name of CLIENT_SEED_FILES) {
    const dest = dataPath('client', name)
    const src = join(seedRoot, 'client', name)
    const fallback = name === 'clientstorage.json'
      ? '{}\n'
      : name === 'cert-settings.json'
        ? `${JSON.stringify({ directoryMode: 'production' }, null, 2)}\n`
        : name === 'domains.txt'
          ? '# One certificate per line.\n'
          : undefined
    seedFileFromTemplate(dest, src, fallback)
  }
}

export function seedLiveServerConfig(
  target: string,
  packageRoot: string,
  runtimeDefault: string | undefined,
  embeddedDefault: string,
) {
  if (pathHasContent(target)) {
    return
  }

  const candidates = [
    runtimeDefault,
    'seed/server/config.cfg.template',
  ].filter((value): value is string => Boolean(value))

  let template = embeddedDefault
  let source = 'embedded default'
  let profile = configTemplateProfileFromPath(runtimeDefault ?? '')
  for (const candidate of candidates) {
    const templatePath = configTemplatePathFor(
      candidate.startsWith('/')
        ? candidate
        : resolve(packageRoot, candidate),
    )
    if (templatePath === target || !pathHasContent(templatePath)) {
      continue
    }
    template = readFileSync(templatePath, 'utf8')
    source = templatePath
    profile = configTemplateProfileFromPath(templatePath)
    break
  }

  const body = renderConfigTemplateValidated(template, profile)

  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, body.endsWith('\n') ? body : `${body}\n`, 'utf8')
  console.info(`[acmedns] seeded ${target} from ${source}`)
}

export function ensureServerConfigSeeded(
  runtimeDefault: string | undefined,
  embeddedDefault: string,
  configPath?: string,
) {
  const packageRoot = findPackageRoot()
  const target = configPath
    ? (configPath.startsWith('/') ? configPath : resolve(packageRoot, configPath))
    : getServerConfigPath()
  seedLiveServerConfig(target, packageRoot, runtimeDefault, embeddedDefault)
  return target
}
