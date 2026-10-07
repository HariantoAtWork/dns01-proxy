import { dirname } from 'node:path'
import { promises as fs } from 'node:fs'
import type { ProxySettings } from '../../shared/types/accessList'
import {
  defaultProxySettings,
  normalizeProxySettings,
} from '../../shared/utils/accessList'
import { getProxySettingsFilePath } from '../../../../../server/utils/paths'
import { reloadProxySettings } from '../../../../../server/proxy/accessListState'

export async function ensureProxySettingsFile(): Promise<string> {
  const filePath = getProxySettingsFilePath()
  try {
    const stat = await fs.stat(filePath)
    if (stat.isDirectory()) {
      throw createError({
        statusCode: 500,
        statusMessage: `${filePath} is a directory. Remove it and use a file named proxy-settings.json.`,
      })
    }
  }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      const empty = defaultProxySettings()
      await fs.mkdir(dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, `${JSON.stringify(empty, null, 2)}\n`, 'utf-8')
      return filePath
    }
    throw error
  }
  return filePath
}

export async function readProxySettings(): Promise<ProxySettings> {
  const filePath = await ensureProxySettingsFile()
  const text = await fs.readFile(filePath, 'utf-8')
  try {
    return normalizeProxySettings(JSON.parse(text))
  }
  catch {
    return defaultProxySettings()
  }
}

export async function writeProxySettings(input: Partial<ProxySettings>): Promise<ProxySettings> {
  const filePath = await ensureProxySettingsFile()
  const current = await readProxySettings()
  const next = normalizeProxySettings({
    ...current,
    ...input,
  })
  await fs.writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf-8')
  reloadProxySettings(next)
  return next
}
