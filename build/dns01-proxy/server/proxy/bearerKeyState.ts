import { existsSync, readFileSync } from 'node:fs'
import type { BearerList, BearerListsFile } from '../../plugins/proxy/runtime/shared/types/bearerKey'
import {
  normalizeBearerListsFile,
  parseBearerAuthHeader,
} from '../../plugins/proxy/runtime/shared/utils/bearerKey'
import { verifyBearerToken } from '../../plugins/proxy/runtime/server/utils/bearerKeyCrypto'
import {
  getProxyBearerKeysFilePath,
  getProxyBearerListsFilePath,
} from '../../core/paths'

let listsById = new Map<string, BearerList>()

function readListsFile(filePath: string): BearerList[] {
  if (!existsSync(filePath)) {
    return []
  }
  try {
    const text = readFileSync(filePath, 'utf8')
    const file = normalizeBearerListsFile(JSON.parse(text) as BearerListsFile)
    return file.lists
  }
  catch (error) {
    console.warn(`[proxy] failed to read ${filePath}:`, error)
    return []
  }
}

export function loadBearerListsFromDisk(): BearerList[] {
  const primary = getProxyBearerListsFilePath()
  const lists = readListsFile(primary)
  if (lists.length || existsSync(primary)) {
    return lists
  }
  // Fall back to legacy flat keys file until migrated on next write.
  return readListsFile(getProxyBearerKeysFilePath())
}

export function reloadBearerLists(lists?: BearerList[]): void {
  const next = new Map<string, BearerList>()
  for (const list of lists ?? loadBearerListsFromDisk()) {
    next.set(list.id, list)
  }
  listsById = next
}

/** @deprecated Use reloadBearerLists */
export function reloadBearerKeys(lists?: BearerList[]): void {
  reloadBearerLists(lists)
}

export function getBearerListById(id: string | null | undefined): BearerList | null {
  if (!id) {
    return null
  }
  return listsById.get(id) ?? null
}

export function listBearerListsCached(): BearerList[] {
  return [...listsById.values()]
}

/** Verify Authorization against any key in the bound Bearer List. */
export function verifyInboundBearer(
  listId: string | null | undefined,
  authorization: string | null,
): boolean {
  const list = getBearerListById(listId)
  if (!list || list.keys.length === 0) {
    return false
  }
  const token = parseBearerAuthHeader(authorization)
  if (!token) {
    return false
  }
  for (const key of list.keys) {
    if (verifyBearerToken(token, key.tokenHash)) {
      return true
    }
  }
  return false
}
