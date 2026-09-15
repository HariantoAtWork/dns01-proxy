import { dirname } from 'node:path'
import { promises as fs } from 'node:fs'
import type {
  BearerGeneratedToken,
  BearerList,
  BearerListInput,
  BearerListsFile,
} from '../../shared/types/bearerKey'
import {
  normalizeBearerListsFile,
  toBearerListPublic,
  validateBearerList,
} from '../../shared/utils/bearerKey'
import { normalizeBearerListInput } from './bearerKeyCrypto'
import {
  getProxyBearerKeysFilePath,
  getProxyBearerListsFilePath,
} from '../../../../../server/utils/paths'
import { reloadBearerLists } from '../../../../../server/proxy/bearerKeyState'
import { listProxyHosts } from './proxyHostsFile'

const EMPTY_FILE: BearerListsFile = { version: 1, lists: [] }

export async function ensureBearerListsFile(): Promise<string> {
  const filePath = getProxyBearerListsFilePath()
  try {
    const stat = await fs.stat(filePath)
    if (stat.isDirectory()) {
      throw createError({
        statusCode: 500,
        statusMessage: `${filePath} is a directory. Remove it and use a file named proxy-bearer-lists.json.`,
      })
    }
  }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      await fs.mkdir(dirname(filePath), { recursive: true })
      // Seed from legacy flat keys file when present.
      const legacyPath = getProxyBearerKeysFilePath()
      let seed = EMPTY_FILE
      try {
        const legacyText = await fs.readFile(legacyPath, 'utf-8')
        seed = normalizeBearerListsFile(JSON.parse(legacyText))
      }
      catch {
        // no legacy file
      }
      await fs.writeFile(filePath, `${JSON.stringify(seed, null, 2)}\n`, 'utf-8')
      reloadBearerLists(seed.lists)
      return filePath
    }
    throw error
  }
  return filePath
}

export async function readBearerListsFile(): Promise<BearerListsFile> {
  const filePath = await ensureBearerListsFile()
  const text = await fs.readFile(filePath, 'utf-8')
  try {
    return normalizeBearerListsFile(JSON.parse(text))
  }
  catch {
    return { ...EMPTY_FILE }
  }
}

async function writeBearerListsFile(file: BearerListsFile): Promise<BearerListsFile> {
  const filePath = await ensureBearerListsFile()
  const normalized = normalizeBearerListsFile(file)
  await fs.writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8')
  reloadBearerLists(normalized.lists)
  return normalized
}

export async function listBearerLists(): Promise<BearerList[]> {
  const file = await readBearerListsFile()
  return file.lists
}

export async function upsertBearerList(
  input: BearerListInput,
): Promise<{ list: BearerList, generatedTokens: BearerGeneratedToken[] }> {
  const file = await readBearerListsFile()
  const previous = input.id ? file.lists.find(list => list.id === input.id) ?? null : null
  const { list, generatedTokens } = normalizeBearerListInput(input, previous)
  const error = validateBearerList(list)
  if (error) {
    throw createError({ statusCode: 400, statusMessage: error })
  }

  const index = file.lists.findIndex(item => item.id === list.id)
  if (index >= 0) {
    file.lists[index] = list
  }
  else {
    file.lists.push(list)
  }
  await writeBearerListsFile(file)
  return { list, generatedTokens }
}

export async function deleteBearerList(id: string): Promise<boolean> {
  const hosts = await listProxyHosts()
  const inUse = hosts.filter(host => host.bearerListId === id || host.bearerKeyId === id)
  if (inUse.length) {
    const names = inUse.map(host => host.domainNames[0] || host.id).join(', ')
    throw createError({
      statusCode: 400,
      statusMessage: `Bearer list is used by proxy host(s): ${names}`,
    })
  }

  const file = await readBearerListsFile()
  const next = file.lists.filter(list => list.id !== id)
  if (next.length === file.lists.length) {
    return false
  }
  await writeBearerListsFile({ version: 1, lists: next })
  return true
}

export async function listBearerListsPublic() {
  const lists = await listBearerLists()
  return lists.map(toBearerListPublic)
}
