import type {
  CertActivityEntry,
  CertActivityResponse,
  CertApplyResult,
  CertJobQueueItem,
  CertJobQueueSnapshot,
  CertJobStatus,
  CertLiveActivityEvent,
  CertLiveQueueEvent,
  CertLiveRateLimitsEvent,
  CertLiveSnapshot,
  CertLiveStatusEvent,
  CertRateLimit,
  CertSettings,
  CertStatusEntry,
  DomainsParseResult,
  DomainsDnsCheck,
  LetsEncryptDirectoryMode,
  LastSavedItem,
  TrashItem,
} from '#shared/types/certs'
import { mergeLiveActivity } from './useCertLiveStream'

export function useCerts() {
  const text = ref('')
  const parsed = ref<DomainsParseResult | null>(null)
  const statusEntries = ref<CertStatusEntry[]>([])
  const directoryMode = ref<LetsEncryptDirectoryMode>('production')
  const acmeEnabled = ref(true)
  const applyResults = ref<CertApplyResult[]>([])
  const trashItems = ref<TrashItem[]>([])
  const lastSavedItems = ref<LastSavedItem[]>([])
  const activityEntries = ref<CertActivityEntry[]>([])
  const rateLimits = ref<CertRateLimit[]>([])
  const certJob = ref<CertJobStatus>({ running: false })
  const certQueue = ref<CertJobQueueSnapshot>({ running: null, queued: [], cancelled: [] })
  const lastCertErrors = ref<Record<string, { message: string, at: string }>>({})
  const lastActivityId = ref(0)
  const lastRefreshedAt = ref<string | null>(null)
  const error = ref('')
  const pending = ref(false)
  const refreshing = ref(false)

  async function loadDomains() {
    const data = await $fetch<DomainsParseResult>('/api/certs/domains')
    text.value = data.text
    parsed.value = data
    return data
  }

  async function loadSettings() {
    const data = await $fetch<CertSettings & { acmeEnabled: boolean }>('/api/certs/settings')
    directoryMode.value = data.directoryMode
    acmeEnabled.value = data.acmeEnabled
    return data
  }

  async function saveSettings(mode: LetsEncryptDirectoryMode) {
    const data = await $fetch<CertSettings>('/api/certs/settings', {
      method: 'PUT',
      body: { directoryMode: mode },
    })
    directoryMode.value = data.directoryMode
    return data
  }

  async function saveDomains() {
    pending.value = true
    error.value = ''
    try {
      const data = await $fetch<DomainsParseResult>('/api/certs/domains', {
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

  async function validateDomains() {
    return await $fetch<DomainsParseResult>('/api/certs/domains/validate', {
      method: 'POST',
      body: { text: text.value },
    })
  }

  async function recheckDomainsDns() {
    const data = await $fetch<{ dnsChecks: DomainsDnsCheck[] }>('/api/certs/domains/dns-check', {
      method: 'POST',
      body: { text: text.value },
    })
    if (parsed.value) {
      parsed.value = { ...parsed.value, dnsChecks: data.dnsChecks }
    }
    return data.dnsChecks
  }

  async function loadStatus(mode?: LetsEncryptDirectoryMode) {
    const m = mode ?? directoryMode.value
    const data = await $fetch<{ mode: LetsEncryptDirectoryMode, entries: CertStatusEntry[] }>(
      '/api/certs/status',
      { query: { mode: m } },
    )
    statusEntries.value = data.entries
    return data
  }

  function mergeRateLimitsOntoStatus() {
    statusEntries.value = statusEntries.value.map((entry) => {
      const lastError = lastCertErrors.value[entry.certName]
      const active = rateLimits.value
        .filter(l => l.mode === directoryMode.value && Date.parse(l.until) > Date.now())
        .filter(l =>
          l.scope === 'account'
          || (l.scope === 'cert' && l.certName === entry.certName),
        )
        .sort((a, b) => Date.parse(b.until) - Date.parse(a.until))[0]
      return {
        ...entry,
        lastError: lastError?.message ?? entry.lastError,
        rateLimitedUntil: active?.until,
        rateLimitDetail: active?.detail,
      }
    })
  }

  async function loadActivity(options?: { sinceId?: number, full?: boolean, notify?: (entries: CertActivityEntry[]) => void }) {
    const poll = !options?.full && options?.sinceId && options.sinceId > 0

    const data = await $fetch<CertActivityResponse>('/api/certs/activity', {
      query: {
        sinceId: poll ? options.sinceId : undefined,
        limit: poll ? 50 : 100,
      },
    })

    certJob.value = data.job
    certQueue.value = data.queue
    lastCertErrors.value = data.lastErrors
    rateLimits.value = data.rateLimits || []

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

    mergeRateLimitsOntoStatus()

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

  async function apply(options?: { certNames?: string[], force?: boolean }) {
    pending.value = true
    error.value = ''
    try {
      const data = await $fetch<{
        mode: LetsEncryptDirectoryMode
        job: CertJobQueueItem
        queued: boolean
      }>(
        '/api/certs/apply',
        {
          method: 'POST',
          body: {
            mode: directoryMode.value,
            certNames: options?.certNames,
            force: options?.force,
          },
        },
      )
      applyResults.value = []
      await loadActivity()
      return data
    }
    catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'Apply failed'
      throw caught
    }
    finally {
      pending.value = false
    }
  }

  async function loadTrash() {
    const data = await $fetch<{ items: TrashItem[] }>('/api/certs/trash')
    trashItems.value = data.items
    return data
  }

  async function trashCert(certName: string, fromTree: 'live' | 'staging' = 'live') {
    await $fetch(`/api/certs/trash/${encodeURIComponent(certName)}`, {
      method: 'POST',
      body: { fromTree },
    })
    await loadTrash()
    await loadStatus()
  }

  async function restoreTrash(certName: string) {
    await $fetch(`/api/certs/trash/${encodeURIComponent(certName)}/restore`, {
      method: 'POST',
    })
    await loadTrash()
    await loadStatus()
  }

  async function permanentDelete(certName: string) {
    await $fetch(`/api/certs/trash/${encodeURIComponent(certName)}`, {
      method: 'DELETE',
    })
    await loadTrash()
  }

  async function loadLastSaved() {
    const data = await $fetch<{ items: LastSavedItem[] }>('/api/certs/last-saved')
    lastSavedItems.value = data.items
    return data
  }

  async function restoreLastSaved(certName: string, fromTree: 'live' | 'staging') {
    await $fetch(`/api/certs/last-saved/${encodeURIComponent(certName)}/restore`, {
      method: 'POST',
      body: { fromTree },
    })
    await loadLastSaved()
    await loadStatus()
  }

  async function permanentDeleteLastSaved(certName: string, fromTree: 'live' | 'staging') {
    await $fetch(`/api/certs/last-saved/${encodeURIComponent(certName)}`, {
      method: 'DELETE',
      query: { fromTree },
    })
    await loadLastSaved()
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

  async function applyLiveSnapshot(data: CertLiveSnapshot) {
    activityEntries.value = data.entries
    certJob.value = data.job
    certQueue.value = data.queue
    lastCertErrors.value = data.lastErrors
    rateLimits.value = data.rateLimits || []
    if (data.entries.length) {
      lastActivityId.value = Math.max(...data.entries.map(e => e.id))
    }
    mergeRateLimitsOntoStatus()
    lastRefreshedAt.value = new Date().toISOString()
  }

  function applyLiveActivity(data: CertLiveActivityEvent, notify?: (entries: CertActivityEntry[]) => void) {
    lastCertErrors.value = data.lastErrors
    activityEntries.value = mergeLiveActivity(activityEntries.value, data.entry)
    lastActivityId.value = Math.max(lastActivityId.value, data.entry.id)
    mergeRateLimitsOntoStatus()
    lastRefreshedAt.value = new Date().toISOString()
    notify?.([data.entry])
  }

  function applyLiveQueue(data: CertLiveQueueEvent) {
    certJob.value = data.job
    certQueue.value = data.queue
    lastRefreshedAt.value = new Date().toISOString()
  }

  function applyLiveStatus(data: CertLiveStatusEvent) {
    if (data.mode === directoryMode.value) {
      statusEntries.value = data.entries
      lastRefreshedAt.value = new Date().toISOString()
    }
  }

  function applyLiveRateLimits(data: CertLiveRateLimitsEvent) {
    rateLimits.value = data.rateLimits || []
    mergeRateLimitsOntoStatus()
    lastRefreshedAt.value = new Date().toISOString()
  }

  return {
    text,
    parsed,
    statusEntries,
    directoryMode,
    acmeEnabled,
    applyResults,
    trashItems,
    lastSavedItems,
    activityEntries,
    rateLimits,
    certJob,
    certQueue,
    lastRefreshedAt,
    error,
    pending,
    refreshing,
    loadDomains,
    loadSettings,
    saveSettings,
    saveDomains,
    validateDomains,
    recheckDomainsDns,
    loadStatus,
    loadActivity,
    refresh,
    apply,
    loadTrash,
    trashCert,
    restoreTrash,
    permanentDelete,
    loadLastSaved,
    restoreLastSaved,
    permanentDeleteLastSaved,
    cancelJob,
    resumeJob,
    rerunJob,
    deleteJob,
    applyLiveSnapshot,
    applyLiveActivity,
    applyLiveQueue,
    applyLiveStatus,
    applyLiveRateLimits,
  }
}
