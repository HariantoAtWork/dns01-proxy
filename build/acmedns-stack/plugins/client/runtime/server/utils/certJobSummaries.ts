import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import type { CertBatchSummary } from '#shared/types/certs'
import {
  CERT_BATCH_SUMMARY_FILE_RE,
  certBatchSummaryFilename,
  resolveCertBatchSummaryStatus,
} from '../../shared/utils/certBatchSummary'
import { getClientstoragePath } from '../../../../../server/utils/paths'
import { publishCertLive } from './certLiveBus'
import { type InternalJob, toPublic } from './certJobQueue/state'

const MAX_SUMMARIES = 50

let cache: CertBatchSummary[] | null = null
let loadPromise: Promise<void> | null = null

export function getJobSummariesDir() {
  return join(getClientstoragePath(), 'job-summaries')
}

function sortSummaries(summaries: CertBatchSummary[]) {
  return [...summaries].sort(
    (a, b) => Date.parse(b.executedAt) - Date.parse(a.executedAt),
  )
}

async function readSummaryFile(path: string, filename: string): Promise<CertBatchSummary | null> {
  try {
    const raw = await fs.readFile(path, 'utf-8')
    const parsed = JSON.parse(raw) as CertBatchSummary
    if (!parsed?.id || !parsed.executedAt) {
      return null
    }
    return {
      ...parsed,
      filename,
    }
  }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      console.warn('[cert-job-summaries] failed to read', path, error)
    }
    return null
  }
}

async function ensureLoaded() {
  if (cache) {
    return
  }
  if (!loadPromise) {
    loadPromise = (async () => {
      const dir = getJobSummariesDir()
      try {
        const names = await fs.readdir(dir)
        const summaries: CertBatchSummary[] = []
        for (const name of names) {
          if (!CERT_BATCH_SUMMARY_FILE_RE.test(name)) {
            continue
          }
          const entry = await readSummaryFile(join(dir, name), name)
          if (entry) {
            summaries.push(entry)
          }
        }
        cache = sortSummaries(summaries).slice(0, MAX_SUMMARIES)
      }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code !== 'ENOENT') {
          console.warn('[cert-job-summaries] failed to load', error)
        }
        cache = []
      }
    })()
  }
  await loadPromise
}

async function writeSummary(summary: CertBatchSummary) {
  const dir = getJobSummariesDir()
  await fs.mkdir(dir, { recursive: true })
  const filename = summary.filename || certBatchSummaryFilename(summary.executedAt, summary.id)
  const path = join(dir, filename)
  const tmp = `${path}.${process.pid}.tmp`
  const body = { ...summary, filename }
  await fs.writeFile(tmp, `${JSON.stringify(body, null, 2)}\n`, 'utf-8')
  await fs.rename(tmp, path)
}

async function deleteSummaryFile(filename: string) {
  if (!CERT_BATCH_SUMMARY_FILE_RE.test(filename)) {
    return false
  }
  const path = join(getJobSummariesDir(), filename)
  try {
    await fs.unlink(path)
    return true
  }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      console.warn('[cert-job-summaries] failed to delete', path, error)
    }
    return false
  }
}

async function pruneOldSummaries() {
  const dir = getJobSummariesDir()
  let names: string[] = []
  try {
    names = (await fs.readdir(dir)).filter(name => CERT_BATCH_SUMMARY_FILE_RE.test(name))
  }
  catch {
    return
  }

  if (names.length <= MAX_SUMMARIES) {
    return
  }

  const summaries: CertBatchSummary[] = []
  for (const name of names) {
    const entry = await readSummaryFile(join(dir, name), name)
    if (entry) {
      summaries.push(entry)
    }
  }

  const sorted = sortSummaries(summaries)
  for (const entry of sorted.slice(MAX_SUMMARIES)) {
    if (entry.filename) {
      await deleteSummaryFile(entry.filename)
    }
  }
}

function publish() {
  publishCertLive({
    type: 'batchSummaries',
    data: { summaries: getCertJobSummariesSync() },
  })
}

async function reloadCache() {
  cache = null
  loadPromise = null
  await ensureLoaded()
}

/** Sync read after boot load; empty until initCertJobSummaries. */
export function getCertJobSummariesSync(): CertBatchSummary[] {
  return cache ?? []
}

export async function listCertJobSummaries(): Promise<CertBatchSummary[]> {
  await ensureLoaded()
  return getCertJobSummariesSync()
}

export async function persistCertJobSummary(job: InternalJob, cancelled: boolean) {
  if (job.deleteOnCancel) {
    return
  }
  if (!job.taskTotal && !job.tasks?.length) {
    return
  }

  const executedAt = job.finishedAt || new Date().toISOString()
  const id = randomUUID()
  const summary: CertBatchSummary = {
    id,
    filename: certBatchSummaryFilename(executedAt, id),
    executedAt,
    jobId: job.id,
    source: job.source,
    mode: job.mode,
    force: job.force,
    status: resolveCertBatchSummaryStatus(toPublic(job), cancelled),
    taskTotal: job.taskTotal,
    tasks: structuredClone(job.tasks ?? []),
    results: job.results?.length ? structuredClone(job.results) : undefined,
    error: job.error,
  }

  try {
    await writeSummary(summary)
    await pruneOldSummaries()
    await reloadCache()
    publish()
  }
  catch (error) {
    console.warn('[cert-job-summaries] failed to persist', error)
  }
}

export async function deleteCertJobSummary(id: string): Promise<boolean> {
  await ensureLoaded()
  const match = (cache ?? []).find(summary => summary.id === id)
  if (!match?.filename) {
    return false
  }
  const deleted = await deleteSummaryFile(match.filename)
  if (deleted) {
    cache = (cache ?? []).filter(summary => summary.id !== id)
    publish()
  }
  return deleted
}

export async function clearCertJobSummaries(): Promise<number> {
  await ensureLoaded()
  const filenames = (cache ?? [])
    .map(summary => summary.filename)
    .filter((filename): filename is string => Boolean(filename))

  let removed = 0
  for (const filename of filenames) {
    if (await deleteSummaryFile(filename)) {
      removed++
    }
  }

  cache = []
  publish()
  return removed
}

/** Boot hook — load summaries from disk. */
export async function initCertJobSummaries() {
  await ensureLoaded()
}

/** Test helper — drop in-memory cache between cases. */
export function resetCertJobSummariesCache() {
  cache = null
  loadPromise = null
}
