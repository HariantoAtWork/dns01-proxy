import type {
  CertActivityEntry,
  CertActivityResponse,
  CertApplyResult,
  CertJobQueueItem,
  CertLiveActivityEvent,
  CertLiveQueueEvent,
  CertLiveRateLimitsEvent,
  CertLiveSnapshot,
  CertLiveStatusEvent,
  CertRateLimit,
  CertSettings,
  CertStatusEntry,
  LetsEncryptDirectoryMode,
} from '#shared/types/certs'
import { mergeLiveActivity } from './useCertLiveStream'
import { useCertQueueState } from '#client/composables/useCertQueueState'

const CERT_DISK_SUCCESS_MESSAGES = new Set(['Issued', 'Renewed', 'Re-issued (SAN change)'])

export function useCertActivityStatus(deps: {
  pending: Ref<boolean>
  error: Ref<string>
}) {
  const { pending, error } = deps
  const { certJob, certQueue } = useCertQueueState()

  const statusEntries = ref<CertStatusEntry[]>([])
  const directoryMode = ref<LetsEncryptDirectoryMode>('production')
  const acmeEnabled = ref(true)
  const renewSchedulerEnabled = ref(true)
  const applyResults = ref<CertApplyResult[]>([])
  const activityEntries = ref<CertActivityEntry[]>([])
  const rateLimits = ref<CertRateLimit[]>([])
  const lastCertErrors = ref<Record<string, { message: string, at: string }>>({})
  const lastActivityId = ref(0)
  const lastRefreshedAt = ref<string | null>(null)
  const refreshing = ref(false)

  async function loadSettings() {
    const data = await $fetch<CertSettings & {
      acmeEnabled: boolean
      renewSchedulerEnabled: boolean
    }>('/api/certs/settings')
    directoryMode.value = data.directoryMode
    acmeEnabled.value = data.acmeEnabled
    renewSchedulerEnabled.value = data.renewSchedulerEnabled
    return data
  }

  async function saveSettings(mode: LetsEncryptDirectoryMode) {
    const data = await $fetch<CertSettings & {
      acmeEnabled: boolean
      renewSchedulerEnabled: boolean
    }>('/api/certs/settings', {
      method: 'PUT',
      body: { directoryMode: mode },
    })
    directoryMode.value = data.directoryMode
    if (typeof data.acmeEnabled === 'boolean') {
      acmeEnabled.value = data.acmeEnabled
    }
    if (typeof data.renewSchedulerEnabled === 'boolean') {
      renewSchedulerEnabled.value = data.renewSchedulerEnabled
    }
    return data
  }

  async function setRenewSchedulerEnabled(enabled: boolean) {
    const data = await $fetch<CertSettings & {
      acmeEnabled: boolean
      renewSchedulerEnabled: boolean
    }>('/api/certs/settings', {
      method: 'PUT',
      body: { renewSchedulerEnabled: enabled },
    })
    renewSchedulerEnabled.value = data.renewSchedulerEnabled
    return data
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

  async function apply(options?: { certNames?: string[], force?: boolean, trackPending?: boolean }) {
    const trackPending = options?.trackPending !== false
    if (trackPending) {
      pending.value = true
    }
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
    await loadStatus()
    lastRefreshedAt.value = new Date().toISOString()
  }

  function applyLiveActivity(data: CertLiveActivityEvent, notify?: (entries: CertActivityEntry[]) => void) {
    lastCertErrors.value = data.lastErrors
    activityEntries.value = mergeLiveActivity(activityEntries.value, data.entry)
    lastActivityId.value = Math.max(lastActivityId.value, data.entry.id)
    mergeRateLimitsOntoStatus()
    lastRefreshedAt.value = new Date().toISOString()
    notify?.([data.entry])
    if (data.entry.certName && CERT_DISK_SUCCESS_MESSAGES.has(data.entry.message)) {
      void loadStatus()
    }
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
    statusEntries,
    directoryMode,
    acmeEnabled,
    renewSchedulerEnabled,
    applyResults,
    activityEntries,
    rateLimits,
    certJob,
    certQueue,
    lastRefreshedAt,
    refreshing,
    loadSettings,
    saveSettings,
    setRenewSchedulerEnabled,
    loadStatus,
    loadActivity,
    refresh,
    apply,
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
