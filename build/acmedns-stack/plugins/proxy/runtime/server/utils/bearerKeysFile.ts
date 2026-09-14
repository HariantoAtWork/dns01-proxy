import { dirname } from 'node:path'
import { promises as fs } from 'node:fs'
import type {
  BearerKey,
  BearerKeyCreated,
  BearerKeyInput,
  BearerKeysFile,
} from '../../shared/types/bearerKey'
import {
  generateBearerToken,
  normalizeBearerKeyInput,
  normalizeBearerKeysFile,
  toBearerKeyPublic,
  validateBearerKey,
} from '../../shared/utils/bearerKey'
import { getProxyBearerKeysFilePath } from '../../../../../server/utils/paths'
import { reloadBearerKeys } from '../../../../../server/proxy/bearerKeyState'
import { listProxyHosts } from './proxyHostsFile'

const EMPTY_FILE: BearerKeysFile = { version: 1, keys: [] }

export async function ensureBearerKeysFile(): Promise<string> {
  const filePath = getProxyBearerKeysFilePath()
  try {
    const stat = await fs.stat(filePath)
    if (stat.isDirectory()) {
      throw createError({
        statusCode: 500,
        statusMessage: `${filePath} is a directory. Remove it and use a file named proxy-bearer-keys.json.`,
      })
    }
  }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      await fs.mkdir(dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, `${JSON.stringify(EMPTY_FILE, null, 2)}\n`, 'utf-8')
      return filePath
    }
    throw error
  }
  return filePath
}

export async function readBearerKeysFile(): Promise<BearerKeysFile> {
  const filePath = await ensureBearerKeysFile()
  const text = await fs.readFile(filePath, 'utf-8')
  try {
    return normalizeBearerKeysFile(JSON.parse(text))
  }
  catch {
    return { ...EMPTY_FILE }
  }
}

async function writeBearerKeysFile(file: BearerKeysFile): Promise<BearerKeysFile> {
  const filePath = await ensureBearerKeysFile()
  const normalized = normalizeBearerKeysFile(file)
  await fs.writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8')
  reloadBearerKeys(normalized.keys)
  return normalized
}

export async function listBearerKeys(): Promise<BearerKey[]> {
  const file = await readBearerKeysFile()
  return file.keys
}

export async function getBearerKey(id: string): Promise<BearerKey | null> {
  const keys = await listBearerKeys()
  return keys.find(key => key.id === id) ?? null
}

/** Create a new key (always generates a token) or update name only. */
export async function upsertBearerKey(
  input: BearerKeyInput,
): Promise<{ key: BearerKey, token?: string }> {
  const file = await readBearerKeysFile()
  const previous = input.id ? file.keys.find(key => key.id === input.id) ?? null : null

  if (previous) {
    const key = normalizeBearerKeyInput(input, previous)
    const error = validateBearerKey(key)
    if (error) {
      throw createError({ statusCode: 400, statusMessage: error })
    }
    const index = file.keys.findIndex(item => item.id === key.id)
    file.keys[index] = key
    await writeBearerKeysFile(file)
    return { key }
  }

  const token = generateBearerToken()
  const key = normalizeBearerKeyInput(input, null, token)
  const error = validateBearerKey(key)
  if (error) {
    throw createError({ statusCode: 400, statusMessage: error })
  }
  file.keys.push(key)
  await writeBearerKeysFile(file)
  return { key, token }
}

export async function rotateBearerKey(id: string): Promise<BearerKeyCreated> {
  const file = await readBearerKeysFile()
  const previous = file.keys.find(key => key.id === id) ?? null
  if (!previous) {
    throw createError({ statusCode: 404, statusMessage: 'Bearer key not found' })
  }
  const token = generateBearerToken()
  const key = normalizeBearerKeyInput({ id, name: previous.name }, previous, token)
  const error = validateBearerKey(key)
  if (error) {
    throw createError({ statusCode: 400, statusMessage: error })
  }
  const index = file.keys.findIndex(item => item.id === key.id)
  file.keys[index] = key
  await writeBearerKeysFile(file)
  return { ...toBearerKeyPublic(key), token }
}

export async function deleteBearerKey(id: string): Promise<boolean> {
  const hosts = await listProxyHosts()
  const inUse = hosts.filter(host => host.bearerKeyId === id)
  if (inUse.length) {
    const names = inUse.map(host => host.domainNames[0] || host.id).join(', ')
    throw createError({
      statusCode: 400,
      statusMessage: `Bearer key is used by proxy host(s): ${names}`,
    })
  }

  const file = await readBearerKeysFile()
  const next = file.keys.filter(key => key.id !== id)
  if (next.length === file.keys.length) {
    return false
  }
  await writeBearerKeysFile({ version: 1, keys: next })
  return true
}

export async function listBearerKeysPublic() {
  const keys = await listBearerKeys()
  return keys.map(toBearerKeyPublic)
}
