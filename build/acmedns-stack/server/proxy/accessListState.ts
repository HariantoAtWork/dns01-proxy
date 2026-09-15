import { existsSync, readFileSync } from 'node:fs'
import type { AccessList, AccessListsFile, ProxySettings } from '../../plugins/proxy/runtime/shared/types/accessList'
import {
  defaultProxySettings,
  normalizeAccessListsFile,
  normalizeProxySettings,
} from '../../plugins/proxy/runtime/shared/utils/accessList'
import { getProxyAccessListsFilePath, getProxySettingsFilePath } from '../../core/paths'

let listsById = new Map<string, AccessList>()
let settings: ProxySettings = defaultProxySettings()

export function loadAccessListsFromDisk(): AccessList[] {
  const filePath = getProxyAccessListsFilePath()
  if (!existsSync(filePath)) {
    return []
  }
  try {
    const text = readFileSync(filePath, 'utf8')
    const file = normalizeAccessListsFile(JSON.parse(text) as AccessListsFile)
    return file.lists
  }
  catch (error) {
    console.warn('[proxy] failed to read proxy-access-lists.json:', error)
    return []
  }
}

export function loadProxySettingsFromDisk(): ProxySettings {
  const filePath = getProxySettingsFilePath()
  if (!existsSync(filePath)) {
    return defaultProxySettings()
  }
  try {
    const text = readFileSync(filePath, 'utf8')
    return normalizeProxySettings(JSON.parse(text))
  }
  catch (error) {
    console.warn('[proxy] failed to read proxy-settings.json:', error)
    return defaultProxySettings()
  }
}

export function reloadAccessLists(lists?: AccessList[]): void {
  const next = new Map<string, AccessList>()
  for (const list of lists ?? loadAccessListsFromDisk()) {
    next.set(list.id, list)
  }
  listsById = next
}

export function reloadProxySettings(next?: ProxySettings): void {
  settings = next ?? loadProxySettingsFromDisk()
}

export function getAccessListById(id: string | null | undefined): AccessList | null {
  if (!id) {
    return null
  }
  return listsById.get(id) ?? null
}

export function getProxySettingsCached(): ProxySettings {
  return settings
}

export function listAccessListsCached(): AccessList[] {
  return [...listsById.values()]
}
