import { dirname } from 'node:path'
import { promises as fs } from 'node:fs'
import type {
  AccessList,
  AccessListInput,
  AccessListsFile,
} from '../../shared/types/accessList'
import {
  normalizeAccessListInput,
  normalizeAccessListsFile,
  toAccessListPublic,
  validateAccessList,
} from '../../shared/utils/accessList'
import { getProxyAccessListsFilePath } from '../../../../../server/utils/paths'
import { reloadAccessLists } from '../../../../../server/proxy/accessListState'
import { listProxyHosts } from './proxyHostsFile'

const EMPTY_FILE: AccessListsFile = { version: 1, lists: [] }

export async function ensureAccessListsFile(): Promise<string> {
  const filePath = getProxyAccessListsFilePath()
  try {
    const stat = await fs.stat(filePath)
    if (stat.isDirectory()) {
      throw createError({
        statusCode: 500,
        statusMessage: `${filePath} is a directory. Remove it and use a file named proxy-access-lists.json.`,
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

export async function readAccessListsFile(): Promise<AccessListsFile> {
  const filePath = await ensureAccessListsFile()
  const text = await fs.readFile(filePath, 'utf-8')
  try {
    return normalizeAccessListsFile(JSON.parse(text))
  }
  catch {
    return { ...EMPTY_FILE }
  }
}

async function writeAccessListsFile(file: AccessListsFile): Promise<AccessListsFile> {
  const filePath = await ensureAccessListsFile()
  const normalized = normalizeAccessListsFile(file)
  await fs.writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8')
  reloadAccessLists(normalized.lists)
  return normalized
}

export async function listAccessLists(): Promise<AccessList[]> {
  const file = await readAccessListsFile()
  return file.lists
}

export async function getAccessList(id: string): Promise<AccessList | null> {
  const lists = await listAccessLists()
  return lists.find(list => list.id === id) ?? null
}

export async function upsertAccessList(input: AccessListInput): Promise<AccessList> {
  const file = await readAccessListsFile()
  const previous = input.id ? file.lists.find(list => list.id === input.id) ?? null : null
  const list = await normalizeAccessListInput(input, previous)
  const error = validateAccessList(list)
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
  await writeAccessListsFile(file)
  return list
}

export async function deleteAccessList(id: string): Promise<boolean> {
  const hosts = await listProxyHosts()
  const inUse = hosts.filter(host => host.accessListId === id)
  if (inUse.length) {
    const names = inUse.map(host => host.domainNames[0] || host.id).join(', ')
    throw createError({
      statusCode: 400,
      statusMessage: `Access list is used by proxy host(s): ${names}`,
    })
  }

  const file = await readAccessListsFile()
  const next = file.lists.filter(list => list.id !== id)
  if (next.length === file.lists.length) {
    return false
  }
  await writeAccessListsFile({ version: 1, lists: next })
  return true
}

export async function listAccessListsPublic() {
  const lists = await listAccessLists()
  return lists.map(toAccessListPublic)
}
