import { existsSync, readFileSync } from 'node:fs'
import type { BearerKey, BearerKeysFile } from '../../plugins/proxy/runtime/shared/types/bearerKey'
import {
  normalizeBearerKeysFile,
  parseBearerAuthHeader,
  verifyBearerToken,
} from '../../plugins/proxy/runtime/shared/utils/bearerKey'
import { getProxyBearerKeysFilePath } from '../../core/paths'

let keysById = new Map<string, BearerKey>()

export function loadBearerKeysFromDisk(): BearerKey[] {
  const filePath = getProxyBearerKeysFilePath()
  if (!existsSync(filePath)) {
    return []
  }
  try {
    const text = readFileSync(filePath, 'utf8')
    const file = normalizeBearerKeysFile(JSON.parse(text) as BearerKeysFile)
    return file.keys
  }
  catch (error) {
    console.warn('[proxy] failed to read proxy-bearer-keys.json:', error)
    return []
  }
}

export function reloadBearerKeys(keys?: BearerKey[]): void {
  const next = new Map<string, BearerKey>()
  for (const key of keys ?? loadBearerKeysFromDisk()) {
    next.set(key.id, key)
  }
  keysById = next
}

export function getBearerKeyById(id: string | null | undefined): BearerKey | null {
  if (!id) {
    return null
  }
  return keysById.get(id) ?? null
}

export function listBearerKeysCached(): BearerKey[] {
  return [...keysById.values()]
}

/** Verify Authorization header against the key bound by id. */
export function verifyInboundBearer(
  keyId: string | null | undefined,
  authorization: string | null,
): boolean {
  const key = getBearerKeyById(keyId)
  if (!key) {
    return false
  }
  const token = parseBearerAuthHeader(authorization)
  if (!token) {
    return false
  }
  return verifyBearerToken(token, key.tokenHash)
}
