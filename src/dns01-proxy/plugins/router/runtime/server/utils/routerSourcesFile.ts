import { dirname } from 'node:path'
import { promises as fs } from 'node:fs'
import type { RouterSource, RouterSourceInput, RouterSourcesFile } from '../../shared/types/routerSource'
import {
  normalizeRouterSource,
  normalizeRouterSourcesFile,
  validateRouterSource,
} from '../../shared/utils/routerSource'
import { getRouterSourcesFilePath } from '../../../../../server/utils/paths'
import { reloadRouterRuntime } from '../../../../../server/router/runtime'
import { listRouterTargets } from './routerTargetsFile'

const EMPTY_FILE: RouterSourcesFile = { version: 1, sources: [] }

export async function ensureRouterSourcesFile(): Promise<string> {
  const filePath = getRouterSourcesFilePath()
  try {
    const stat = await fs.stat(filePath)
    if (stat.isDirectory()) {
      throw createError({
        statusCode: 500,
        statusMessage: `${filePath} is a directory. Remove it and use a file named router-sources.json.`,
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

export async function readRouterSourcesFile(): Promise<RouterSourcesFile> {
  const filePath = await ensureRouterSourcesFile()
  const text = await fs.readFile(filePath, 'utf-8')
  try {
    return normalizeRouterSourcesFile(JSON.parse(text))
  }
  catch {
    return { ...EMPTY_FILE }
  }
}

async function writeRouterSourcesFile(file: RouterSourcesFile): Promise<RouterSourcesFile> {
  const filePath = await ensureRouterSourcesFile()
  const normalized = normalizeRouterSourcesFile(file)
  await fs.writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8')
  await reloadRouterRuntime({ sources: normalized.sources })
  return normalized
}

export async function listRouterSources(): Promise<RouterSource[]> {
  const file = await readRouterSourcesFile()
  return file.sources
}

export async function getRouterSource(id: string): Promise<RouterSource | null> {
  const sources = await listRouterSources()
  return sources.find(source => source.id === id) ?? null
}

export async function upsertRouterSource(input: RouterSourceInput): Promise<RouterSource> {
  const file = await readRouterSourcesFile()
  const targets = await listRouterTargets()
  const source = normalizeRouterSource(input, input.id)
  const error = validateRouterSource(source, targets, file.sources)
  if (error) {
    throw createError({ statusCode: 400, statusMessage: error })
  }
  const index = file.sources.findIndex(item => item.id === source.id)
  if (index >= 0) {
    file.sources[index] = source
  }
  else {
    file.sources.push(source)
  }
  await writeRouterSourcesFile(file)
  return source
}

export async function deleteRouterSource(id: string): Promise<boolean> {
  const file = await readRouterSourcesFile()
  const next = file.sources.filter(source => source.id !== id)
  if (next.length === file.sources.length) {
    return false
  }
  await writeRouterSourcesFile({ version: 1, sources: next })
  return true
}
