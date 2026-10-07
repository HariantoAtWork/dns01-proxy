import type { CertBatchSummary, CertLiveBatchSummariesEvent } from '#shared/types/certs'

const summaries = ref<CertBatchSummary[]>([])
let loaded = false

function applySummaries(next: CertBatchSummary[]) {
  summaries.value = next
}

export function applyCertBatchSummariesEvent(data: CertLiveBatchSummariesEvent) {
  applySummaries(data.summaries)
}

export function useCertBatchSummary() {
  async function loadSummaries() {
    if (!import.meta.client) {
      return
    }
    try {
      const data = await $fetch<{ summaries: CertBatchSummary[] }>('/api/certs/job-summaries')
      applySummaries(data.summaries)
      loaded = true
    }
    catch {
      // Board stays empty when the API is unavailable.
    }
  }

  async function ensureLoaded() {
    if (!loaded) {
      await loadSummaries()
    }
  }

  async function removeSummary(id: string) {
    try {
      await $fetch(`/api/certs/job-summaries/${id}`, { method: 'DELETE' })
      summaries.value = summaries.value.filter(summary => summary.id !== id)
    }
    catch {
      // Keep the list unchanged on failure.
    }
  }

  async function clearSummaries() {
    try {
      await $fetch('/api/certs/job-summaries', { method: 'DELETE' })
      summaries.value = []
    }
    catch {
      // Keep the list unchanged on failure.
    }
  }

  return {
    summaries,
    loadSummaries,
    ensureLoaded,
    removeSummary,
    clearSummaries,
  }
}
