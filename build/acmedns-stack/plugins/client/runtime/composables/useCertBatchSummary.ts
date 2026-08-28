import { useLocalStorage } from '@vueuse/core'
import type { CertBatchSummary, CertJobQueueItem, CertJobQueueSnapshot } from '#shared/types/certs'
import {
  cloneCertJobQueueItem,
  resolveCertBatchSummaryStatus,
} from '#shared/utils/certBatchSummary'

const STORAGE_KEY = 'acmedns-stack:cert-batch-summaries'
const MAX_SUMMARIES = 50

let summariesStorage: ReturnType<typeof useLocalStorage<CertBatchSummary[]>> | undefined
let lastSnapshot: CertJobQueueItem | null = null

function ensureSummariesStorage() {
  if (!import.meta.client) {
    return undefined
  }
  if (!summariesStorage) {
    summariesStorage = useLocalStorage<CertBatchSummary[]>(STORAGE_KEY, [], {
      mergeDefaults: true,
    })
  }
  return summariesStorage
}

function appendSummary(snapshot: CertJobQueueItem, cancelled: boolean) {
  if (!snapshot.taskTotal && !snapshot.tasks?.length) {
    return
  }

  const summaries = ensureSummariesStorage()
  if (!summaries) {
    return
  }

  const entry: CertBatchSummary = {
    id: crypto.randomUUID(),
    executedAt: snapshot.finishedAt || new Date().toISOString(),
    jobId: snapshot.id,
    source: snapshot.source,
    mode: snapshot.mode,
    force: snapshot.force,
    status: resolveCertBatchSummaryStatus(snapshot, cancelled),
    taskTotal: snapshot.taskTotal,
    tasks: structuredClone(snapshot.tasks ?? []),
    error: snapshot.error,
  }

  summaries.value = [entry, ...summaries.value].slice(0, MAX_SUMMARIES)
}

export function trackCertQueueForBatchSummary(queue: CertJobQueueSnapshot) {
  if (!import.meta.client) {
    return
  }

  if (queue.running) {
    lastSnapshot = cloneCertJobQueueItem(queue.running)
    return
  }

  if (!lastSnapshot) {
    return
  }

  const snapshot = lastSnapshot
  lastSnapshot = null
  const cancelled = queue.cancelled.some(job => job.id === snapshot.id)
  appendSummary(snapshot, cancelled)
}

export function useCertBatchSummary() {
  const summaries = ensureSummariesStorage() ?? ref<CertBatchSummary[]>([])

  function removeSummary(id: string) {
    summaries.value = summaries.value.filter(summary => summary.id !== id)
  }

  function clearSummaries() {
    summaries.value = []
  }

  return {
    summaries,
    removeSummary,
    clearSummaries,
  }
}
