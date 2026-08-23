import { dirname, resolve } from 'node:path'
import { promises as fs } from 'node:fs'
import type { ClientStorageMap } from '#shared/types/clientstorage'

export function getStoragePath() {
  const config = useRuntimeConfig()
  const envPath = process.env.CLIENTSTORAGE_DATA
    || process.env.NUXT_CLIENTSTORAGE_DATA
    || config.clientstorageData
    || 'config/clientstorage.json'

  if (envPath.startsWith('/')) {
    return envPath
  }

  return resolve(process.cwd(), envPath)
}

export async function ensureStorageExists() {
  const storagePath = getStoragePath()
  const storageDir = dirname(storagePath)

  try {
    await fs.access(storagePath)
    const content = await fs.readFile(storagePath, 'utf-8')
    JSON.parse(content)
    return storagePath
  }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      console.warn(`Invalid JSON in ${storagePath}, recreating file.`)
    }

    await fs.mkdir(storageDir, { recursive: true })
    await fs.writeFile(storagePath, '{}', 'utf-8')
    return storagePath
  }
}

export async function readStorage(): Promise<ClientStorageMap> {
  const filePath = await ensureStorageExists()
  const raw = await fs.readFile(filePath, 'utf-8')
  return JSON.parse(raw) as ClientStorageMap
}

export async function writeStorage(data: ClientStorageMap) {
  const filePath = await ensureStorageExists()
  await fs.writeFile(filePath, JSON.stringify(data, null, 4), 'utf-8')
}
