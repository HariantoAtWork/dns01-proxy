import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { promises as fs } from 'node:fs'
import type { H3Event } from 'h3'
import type { AcmeDnsCredentials, ClientStorageMap } from '#shared/types/clientstorage'
import type {
  BackupKind,
  BackupListItem,
  BackupMutationResult,
  DomainBackupPayload,
} from '#shared/types/backup'

const BACKUP_NAME_PATTERN = /^(full|domain)-[a-z0-9._-]+\.json$/i

export function getApplicationsDataRoot(event?: H3Event) {
  const config = event ? useRuntimeConfig(event) : useRuntimeConfig()
  const raw = String(
    process.env.NUXT_APPLICATIONS_DATA_ROOT
    || config.applicationsDataRoot
    || '',
  ).trim()

  if (raw) {
    return raw.startsWith('/') ? raw : resolve(process.cwd(), raw)
  }

  return dirname(getStoragePath())
}

export function getBackupDir(event?: H3Event) {
  return resolve(getApplicationsDataRoot(event), 'acmedns-client', 'backups')
}

export async function ensureBackupDir(event?: H3Event) {
  const dir = getBackupDir(event)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

export function sanitiseDomainForFilename(domain: string) {
  return domain
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^[._-]+/, '')
    .replace(/[._-]+$/, '')
    .slice(0, 180)
}

export function resolveBackupFile(filename: string, event?: H3Event) {
  if (!filename || filename.includes('\0')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Invalid backup filename',
    })
  }

  const base = basename(filename)
  if (base !== filename || base.includes('..') || !BACKUP_NAME_PATTERN.test(base)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Invalid backup filename',
    })
  }

  const dir = getBackupDir(event)
  const resolved = resolve(dir, base)
  const rel = relative(dir, resolved)

  if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Invalid backup filename',
    })
  }

  return resolved
}

function backupTimestamp() {
  return new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z')
}

function kindFromFilename(filename: string): BackupKind {
  return filename.startsWith('domain-') ? 'domain' : 'full'
}

function isCredentials(value: unknown): value is AcmeDnsCredentials {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const record = value as Record<string, unknown>
  return typeof record.fulldomain === 'string'
    && typeof record.subdomain === 'string'
    && typeof record.username === 'string'
    && typeof record.password === 'string'
    && typeof record.server_url === 'string'
}

function isStorageMap(value: unknown): value is ClientStorageMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  return Object.values(value as Record<string, unknown>).every(item => isCredentials(item))
}

function isDomainPayload(value: unknown): value is DomainBackupPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const record = value as Record<string, unknown>
  return record.kind === 'domain'
    && typeof record.domain === 'string'
    && record.domain.trim().length > 0
    && isCredentials(record.credentials)
}

async function uniqueBackupPath(dir: string, filename: string, event?: H3Event) {
  let candidate = filename
  let n = 2

  while (true) {
    try {
      await fs.access(join(dir, candidate))
      const stem = filename.slice(0, -'.json'.length)
      candidate = `${stem}-${n}.json`
      n += 1
    }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        throw error
      }
      return resolveBackupFile(candidate, event)
    }
  }
}

async function readJsonUnknown(filePath: string): Promise<unknown> {
  const raw = await fs.readFile(filePath, 'utf-8')
  return JSON.parse(raw)
}

export async function listBackups(event?: H3Event): Promise<BackupListItem[]> {
  const dir = await ensureBackupDir(event)
  const names = await fs.readdir(dir)
  const items: BackupListItem[] = []

  for (const name of names) {
    if (!BACKUP_NAME_PATTERN.test(name)) {
      continue
    }

    const filePath = resolveBackupFile(name, event)
    const stat = await fs.stat(filePath)
    if (!stat.isFile()) {
      continue
    }

    const kind = kindFromFilename(name)
    const item: BackupListItem = {
      filename: name,
      kind,
      createdAt: stat.mtime.toISOString(),
      size: stat.size,
    }

    if (kind === 'domain') {
      try {
        const parsed = await readJsonUnknown(filePath)
        if (isDomainPayload(parsed)) {
          item.domain = parsed.domain
        }
      }
      catch {
        item.domain = undefined
      }
    }

    items.push(item)
  }

  return items.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export async function createFullBackup(event?: H3Event) {
  const dir = await ensureBackupDir(event)
  const livePath = await ensureStorageExists()
  const filename = `full-${backupTimestamp()}.json`
  const dest = await uniqueBackupPath(dir, filename, event)

  await fs.copyFile(livePath, dest)
  console.info(`Created full clientstorage backup ${basename(dest)}`)
  return basename(dest)
}

export async function createDomainBackup(domain: string, event?: H3Event) {
  const host = domain.trim()
  if (!host) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Domain is required',
    })
  }

  const storage = await readStorage()
  const credentials = storage[host]
  if (!credentials) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: 'Domain not found in live storage',
    })
  }

  const slug = sanitiseDomainForFilename(host)
  if (!slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Domain cannot be used in a backup filename',
    })
  }

  const createdAt = new Date().toISOString()
  const payload: DomainBackupPayload = {
    kind: 'domain',
    createdAt,
    domain: host,
    credentials,
  }

  const dir = await ensureBackupDir(event)
  const filename = `domain-${slug}-${backupTimestamp()}.json`
  const dest = await uniqueBackupPath(dir, filename, event)
  const tmp = `${dest}.tmp`

  await fs.writeFile(tmp, `${JSON.stringify(payload, null, 4)}\n`, 'utf-8')
  await fs.rename(tmp, dest)
  console.info(`Created domain backup ${basename(dest)}`)
  return basename(dest)
}

export async function restoreBackup(filename: string, overwrite: boolean, event?: H3Event) {
  const filePath = resolveBackupFile(filename, event)
  const kind = kindFromFilename(basename(filePath))

  let parsed: unknown
  try {
    parsed = await readJsonUnknown(filePath)
  }
  catch {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Backup file is not valid JSON',
    })
  }

  if (kind === 'full') {
    return restoreLiveStorage(parsed, overwrite)
  }

  return restoreDomain(parsed, overwrite)
}

export async function restoreLiveStorage(parsed: unknown, overwrite: boolean) {
  if (!isStorageMap(parsed)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Full backup does not look like clientstorage.json',
    })
  }

  const current = await readStorage()
  if (Object.keys(current).length > 0 && !overwrite) {
    return {
      success: false as const,
      needsOverwrite: true,
      message: 'Live storage is not empty. Confirm overwrite to replace it.',
    }
  }

  await writeStorage(parsed)
  console.info('Replaced live clientstorage.json')
  return {
    success: true as const,
    message: 'Live storage replaced',
  }
}

async function restoreDomain(parsed: unknown, overwrite: boolean) {
  if (!isDomainPayload(parsed)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Domain backup is missing a hostname or credentials object',
    })
  }

  const current = await readStorage()
  if (current[parsed.domain] && !overwrite) {
    return {
      success: false as const,
      needsOverwrite: true,
      message: 'That hostname already exists in live storage. Confirm overwrite.',
    }
  }

  current[parsed.domain] = parsed.credentials
  await writeStorage(current)
  console.info('Restored domain backup into live storage')
  return {
    success: true as const,
    message: 'Hostname merged into live storage',
  }
}

export async function deleteBackup(filename: string, event?: H3Event) {
  const filePath = resolveBackupFile(filename, event)

  try {
    await fs.unlink(filePath)
  }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      throw createError({
        statusCode: 404,
        statusMessage: 'Not Found',
        message: 'Backup file not found',
      })
    }
    throw error
  }

  console.info(`Deleted backup ${basename(filePath)}`)
}

export function backupFailure(error: unknown): BackupMutationResult {
  const err = error as { statusCode?: number, message?: string }
  if (typeof err.statusCode === 'number' && err.statusCode < 500 && err.message) {
    return { success: false, message: err.message }
  }
  throw error
}
