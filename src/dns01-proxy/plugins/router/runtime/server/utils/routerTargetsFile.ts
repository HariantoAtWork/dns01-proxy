import { dirname } from 'node:path'
import { promises as fs } from 'node:fs'
import type { RouterTarget, RouterTargetInput, RouterTargetsFile } from '../../shared/types/routerTarget'
import {
  findDuplicateTargetName,
  normalizeRouterTarget,
  normalizeRouterTargetsFile,
  validateRouterTarget,
} from '../../shared/utils/routerTarget'
import { getRouterTargetsFilePath } from '../../../../../server/utils/paths'
import { reloadRouterRuntime } from '../../../../../server/router/runtime'

const EMPTY_FILE: RouterTargetsFile = { version: 1, targets: [] }

export async function ensureRouterTargetsFile(): Promise<string> {
  const filePath = getRouterTargetsFilePath()
  try {
    const stat = await fs.stat(filePath)
    if (stat.isDirectory()) {
      throw createError({
        statusCode: 500,
        statusMessage: `${filePath} is a directory. Remove it and use a file named router-targets.json.`,
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

export async function readRouterTargetsFile(): Promise<RouterTargetsFile> {
  const filePath = await ensureRouterTargetsFile()
  const text = await fs.readFile(filePath, 'utf-8')
  try {
    return normalizeRouterTargetsFile(JSON.parse(text))
  }
  catch {
    return { ...EMPTY_FILE }
  }
}

async function writeRouterTargetsFile(file: RouterTargetsFile): Promise<RouterTargetsFile> {
  const filePath = await ensureRouterTargetsFile()
  const normalized = normalizeRouterTargetsFile(file)
  await fs.writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8')
  await reloadRouterRuntime({ targets: normalized.targets })
  return normalized
}

export async function listRouterTargets(): Promise<RouterTarget[]> {
  const file = await readRouterTargetsFile()
  return file.targets
}

export async function getRouterTarget(id: string): Promise<RouterTarget | null> {
  const targets = await listRouterTargets()
  return targets.find(target => target.id === id) ?? null
}

export async function upsertRouterTarget(input: RouterTargetInput): Promise<RouterTarget> {
  const file = await readRouterTargetsFile()
  const target = normalizeRouterTarget(input, input.id)
  const error = validateRouterTarget(target)
  if (error) {
    throw createError({ statusCode: 400, statusMessage: error })
  }
  const duplicate = findDuplicateTargetName(target.name, file.targets, target.id)
  if (duplicate) {
    throw createError({
      statusCode: 400,
      statusMessage: `Target name "${target.name}" already used`,
    })
  }
  const index = file.targets.findIndex(item => item.id === target.id)
  if (index >= 0) {
    file.targets[index] = target
  }
  else {
    file.targets.push(target)
  }
  await writeRouterTargetsFile(file)
  return target
}

export async function deleteRouterTarget(id: string): Promise<boolean> {
  const { listRouterSources } = await import('./routerSourcesFile')
  const sources = await listRouterSources()
  const bound = sources.filter(source => source.targetId === id)
  if (bound.length) {
    const label = bound[0]!.domainNames[0] || bound[0]!.id
    throw createError({
      statusCode: 400,
      statusMessage: `Target is used by source ${label}${bound.length > 1 ? ` (+${bound.length - 1})` : ''}`,
    })
  }
  const file = await readRouterTargetsFile()
  const next = file.targets.filter(target => target.id !== id)
  if (next.length === file.targets.length) {
    return false
  }
  await writeRouterTargetsFile({ version: 1, targets: next })
  return true
}
