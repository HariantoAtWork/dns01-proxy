import { useLocalStorage } from '@vueuse/core'
import type { CertBatchSummary, CertJobQueueItem } from '#shared/types/certs'
import {
  cloneCertJobQueueItem,
  resolveCertBatchSummaryStatus,
} from '#shared/utils/certBatchSummary'
import { useCertQueueState } from './useCertQueueState'

const STORAGE_KEY = 'acmedns-stack:cert-batch-summaries'
const MAX_SUMMARIES = 50

export function useCertBatchSummary() {
  const summaries = useLocalStorage<CertBatchSummary[]>(STORAGE_KEY, [], {
    mergeDefaults: true,
  })

  function addSummary(snapshot: CertJobQueueItem, cancelled: boolean) {
    if (!snapshot.taskTotal && !snapshot.tasks?.length) {
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

  function removeSummary(id: string) {
    summaries.value = summaries.value.filter(summary => summary.id !== id)
  }

  function clearSummaries() {
    summaries.value = []
  }

  return {
    summaries,
    addSummary,
    removeSummary,
    clearSummaries,
  }
}

export function useCertBatchSummaryCapture() {
  if (!import.meta.client) {
    return
  }

  const { certQueue } = useCertQueueState()
  const { addSummary } = useCertBatchSummary()
  let lastSnapshot: CertJobQueueItem | null = null

  watch(certQueue, (queue) => {
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
    addSummary(snapshot, cancelled)
  }, { deep: true })
}
