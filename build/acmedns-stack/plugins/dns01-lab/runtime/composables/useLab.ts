import type { DomainsDnsCheck, DomainsParseResult, CertActivityEntry, CertJobQueueItem } from '#shared/types/certs'
import type { LabStatusEntry } from '#lab-shared/types/lab'
import { mergeLiveActivity } from '#client/composables/useCertLiveStream'
import { useCertQueueState } from '#client/composables/useCertQueueState'

export function useLab() {
  const { certJob, certQueue } = useCertQueueState()
  const text = ref('')
  const parsed = ref<DomainsParseResult | null>(null)
  const statusEntries = ref<LabStatusEntry[]>([])
  const activityEntries = ref<CertActivityEntry[]>([])
  const lastActivityId = ref(0)
  const lastRefreshedAt = ref<string | null>(null)
  const error = ref('')
  const pending = ref(false)
  const refreshing = ref(false)

  async function loadDomains() {
    const data = await $fetch<DomainsParseResult>('/api/lab/domains')
    text.value = data.text
    parsed.value = data
    return data
  }

  async function copyFromDomains() {
    const data = await $fetch<DomainsParseResult>('/api/certs/domains')
    text.value = data.text
    return data
  }

  async function saveDomains() {
    pending.value = true
    error.value = ''
    try {
      const data = await $fetch<DomainsParseResult>('/api/lab/domains', {
        method: 'PUT',
        body: { text: text.value },
      })
      parsed.value = data
      if (!data.ok) {
        error.value = data.errors.map(e => `Line ${e.line}: ${e.message}`).join('\n')
      }
      return data
    }
    catch (caught: unknown) {
      const data = (caught as { data?: DomainsParseResult })?.data
      if (data?.errors) {
        parsed.value = data
        error.value = data.errors.map(e => `Line ${e.line}: ${e.message}`).join('\n')
        return data
      }
      error.value = caught instanceof Error ? caught.message : 'Save failed'
      throw caught
    }
    finally {
      pending.value = false
    }
  }

  async function recheckDomainsDns() {
    const data = await $fetch<{ dnsChecks: DomainsDnsCheck[] }>('/api/lab/domains/dns-check', {
      method: 'POST',
      body: { text: text.value },
    })
    if (parsed.value) {
      parsed.value = { ...parsed.value, dnsChecks: data.dnsChecks }
    }
    return data.dnsChecks
  }

  async function loadStatus() {
    const data = await $fetch<{ entries: LabStatusEntry[] }>('/api/lab/status')
    statusEntries.value = data.entries
    return data
  }

  async function loadActivity(options?: { sinceId?: number, full?: boolean, notify?: (entries: CertActivityEntry[]) => void }) {
    const poll = !options?.full && options?.sinceId && options.sinceId > 0

    const data = await $fetch<{
      entries: CertActivityEntry[]
      job: typeof certJob.value
      queue: typeof certQueue.value
    }>('/api/certs/activity', {
      query: {
        sinceId: poll ? options.sinceId : undefined,
        limit: poll ? 50 : 100,
      },
    })

    certJob.value = data.job
    certQueue.value = data.queue

    if (poll) {
      if (data.entries.length) {
        const incoming = [...data.entries].reverse()
        const existingIds = new Set(activityEntries.value.map(e => e.id))
        activityEntries.value = [
          ...incoming.filter(e => !existingIds.has(e.id)),
          ...activityEntries.value,
        ].slice(0, 100)
        lastActivityId.value = Math.max(lastActivityId.value, ...data.entries.map(e => e.id))
        options?.notify?.(incoming)
      }
    }
    else {
      activityEntries.value = data.entries
      if (data.entries.length) {
        lastActivityId.value = Math.max(...data.entries.map(e => e.id))
      }
    }

    return data
  }

  async function refresh(options?: { full?: boolean, notify?: (entries: CertActivityEntry[]) => void }) {
    refreshing.value = true
    try {
      await loadStatus()
      await loadActivity({
        full: options?.full,
        sinceId: options?.full ? undefined : lastActivityId.value,
        notify: options?.notify,
      })
      lastRefreshedAt.value = new Date().toISOString()
    }
    finally {
      refreshing.value = false
    }
  }

  async function apply(options?: { certNames?: string[], force?: boolean, trackPending?: boolean }) {
    const trackPending = options?.trackPending !== false
    if (trackPending) {
      pending.value = true
    }
    error.value = ''
    try {
      const data = await $fetch<{ job: CertJobQueueItem, queued: boolean }>(
        '/api/lab/apply',
        {
          method: 'POST',
          body: {
            certNames: options?.certNames,
            force: options?.force,
          },
        },
      )
      await loadActivity()
      return data
    }
    catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'Run failed'
      throw caught
    }
    finally {
      if (trackPending) {
        pending.value = false
      }
    }
  }

  async function cancelJob(id: number) {
    const job = await $fetch<CertJobQueueItem>(`/api/certs/jobs/${id}/cancel`, { method: 'POST' })
    await loadActivity({ full: true })
    return job
  }

  async function resumeJob(id: number) {
    const job = await $fetch<CertJobQueueItem>(`/api/certs/jobs/${id}/resume`, { method: 'POST' })
    await loadActivity({ full: true })
    return job
  }

  async function rerunJob(id: number) {
    const job = await $fetch<CertJobQueueItem>(`/api/certs/jobs/${id}/rerun`, { method: 'POST' })
    await loadActivity({ full: true })
    return job
  }

  async function deleteJob(id: number) {
    const job = await $fetch<CertJobQueueItem>(`/api/certs/jobs/${id}`, { method: 'DELETE' })
    await loadActivity({ full: true })
    return job
  }

  function applyLiveActivity(data: { entry: CertActivityEntry }, notify?: (entries: CertActivityEntry[]) => void) {
    activityEntries.value = mergeLiveActivity(activityEntries.value, data.entry)
    lastActivityId.value = Math.max(lastActivityId.value, data.entry.id)
    lastRefreshedAt.value = new Date().toISOString()
    notify?.([data.entry])
  }

  function applyLiveQueue(data: { job: typeof certJob.value, queue: typeof certQueue.value }) {
    certJob.value = data.job
    certQueue.value = data.queue
    lastRefreshedAt.value = new Date().toISOString()
  }

  return {
    text,
    parsed,
    statusEntries,
    activityEntries,
    certJob,
    certQueue,
    lastRefreshedAt,
    error,
    pending,
    refreshing,
    loadDomains,
    copyFromDomains,
    saveDomains,
    recheckDomainsDns,
    loadStatus,
    loadActivity,
    refresh,
    apply,
    cancelJob,
    resumeJob,
    rerunJob,
    deleteJob,
    applyLiveActivity,
    applyLiveQueue,
  }
}
