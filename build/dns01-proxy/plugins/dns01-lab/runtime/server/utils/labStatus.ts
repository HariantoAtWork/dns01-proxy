import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import type { LabStatusEntry } from '#lab-shared/types/lab'
import { getLabDomainsFilePath } from '../../../../../server/utils/paths'

const STATUS_FILE = () => join(getLabDomainsFilePath(), '..', 'lab-status.json')

interface LabStatusStore {
  results: Record<string, {
    ok: boolean
    message: string
    at: string
  }>
}

async function readStore(): Promise<LabStatusStore> {
  try {
    const raw = await fs.readFile(STATUS_FILE(), 'utf-8')
    const parsed = JSON.parse(raw) as LabStatusStore
    return parsed?.results ? parsed : { results: {} }
  }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return { results: {} }
    }
    throw error
  }
}

async function writeStore(store: LabStatusStore) {
  const path = STATUS_FILE()
  await fs.mkdir(join(path, '..'), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  await fs.writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, 'utf-8')
  await fs.rename(tmp, path)
}

export async function recordLabResult(certName: string, ok: boolean, message: string) {
  const store = await readStore()
  store.results[certName] = {
    ok,
    message,
    at: new Date().toISOString(),
  }
  await writeStore(store)
}

export async function buildLabStatus(inLabDomains: string[]): Promise<LabStatusEntry[]> {
  const store = await readStore()
  const names = new Set(inLabDomains)

  for (const certName of Object.keys(store.results)) {
    names.add(certName)
  }

  return [...names].sort().map((certName) => {
    const result = store.results[certName]
    return {
      certName,
      inLabDomainsFile: inLabDomains.includes(certName),
      lastRunAt: result?.at,
      ok: result?.ok,
      message: result?.message,
    }
  })
}
