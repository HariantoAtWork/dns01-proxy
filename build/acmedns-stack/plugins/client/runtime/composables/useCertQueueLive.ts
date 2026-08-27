import type {
  CertActivityResponse,
  CertJobQueueItem,
  CertLiveActivityEvent,
  CertLiveQueueEvent,
  CertLiveRateLimitsEvent,
  CertLiveSnapshot,
  CertLiveStatusEvent,
  LetsEncryptDirectoryMode,
} from '#shared/types/certs'
import { useCertLiveStream } from '#client/composables/useCertLiveStream'
import { useCertQueueState } from '#client/composables/useCertQueueState'
import { useDocumentVisibility } from '@vueuse/core'

export type CertLivePageHooks = {
  onSnapshot?: (data: CertLiveSnapshot) => void
  onActivity?: (data: CertLiveActivityEvent, notify: boolean) => void
  onQueue?: (data: CertLiveQueueEvent) => void
  onStatus?: (data: CertLiveStatusEvent) => void
  onRateLimits?: (data: CertLiveRateLimitsEvent) => void
  onPoll?: () => void | Promise<void>
  pollBlocked?: Ref<boolean>
  directoryMode?: Ref<LetsEncryptDirectoryMode>
}

type CertLiveStreamApi = ReturnType<typeof useCertLiveStream>

// Client-only singleton — must not live in useState (functions are not serialisable for SSR).
let streamApi: CertLiveStreamApi | undefined
const pageHooks = shallowRef<CertLivePageHooks | null>(null)

export function useCertQueueLive() {
  const { certJob, certQueue } = useCertQueueState()
  const directoryMode = useState<LetsEncryptDirectoryMode>('cert-live-directory-mode', () => 'production')
  const started = useState('cert-live-started', () => false)
  const jobActionPending = useState('cert-queue-action-pending', () => false)

  const pollBlocked = computed(() => pageHooks.value?.pollBlocked?.value ?? false)

  if (import.meta.client && !streamApi) {
    streamApi = useCertLiveStream({
      directoryMode,
      pollBlocked,
      onPoll: async () => {
        await pageHooks.value?.onPoll?.()
        if (!pageHooks.value?.onPoll) {
          const data = await $fetch<CertActivityResponse>('/api/certs/activity', { query: { limit: 50 } })
          certJob.value = data.job
          certQueue.value = data.queue
        }
      },
      onSnapshot: (data) => {
        certJob.value = data.job
        certQueue.value = data.queue
        pageHooks.value?.onSnapshot?.(data)
      },
      onActivity: (data, notify) => {
        pageHooks.value?.onActivity?.(data, notify)
      },
      onQueue: (data) => {
        certJob.value = data.job
        certQueue.value = data.queue
        pageHooks.value?.onQueue?.(data)
      },
      onStatus: (data) => {
        pageHooks.value?.onStatus?.(data)
      },
      onRateLimits: (data) => {
        pageHooks.value?.onRateLimits?.(data)
      },
    })
  }

  const transport = computed(() => streamApi?.transport.value ?? 'off')
  const transportLabel = computed(() => streamApi?.transportLabel.value ?? 'Offline')

  async function loadActivity(options?: { full?: boolean }) {
    const data = await $fetch<CertActivityResponse>('/api/certs/activity', {
      query: {
        limit: options?.full ? 100 : 50,
      },
    })
    certJob.value = data.job
    certQueue.value = data.queue
    return data
  }

  async function loadDirectoryMode() {
    try {
      const data = await $fetch<{ directoryMode: LetsEncryptDirectoryMode }>('/api/certs/settings')
      directoryMode.value = data.directoryMode
    }
    catch {
      // Keep the last known mode when settings are unavailable.
    }
  }

  function registerPageHooks(hooks: CertLivePageHooks) {
    pageHooks.value = hooks
    if (hooks.directoryMode) {
      directoryMode.value = hooks.directoryMode.value
    }
  }

  function clearPageHooks() {
    pageHooks.value = null
  }

  function start() {
    streamApi?.start()
  }

  function disconnect() {
    streamApi?.disconnect()
  }

  async function ensureLive() {
    if (!import.meta.client || started.value || !streamApi) {
      return
    }
    started.value = true
    await Promise.all([loadDirectoryMode(), loadActivity({ full: true })])
    start()
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

  function useGlobalLifecycle() {
    const visibility = useDocumentVisibility()

    onMounted(() => {
      void ensureLive()
    })

    watch(visibility, (visible) => {
      if (!started.value) {
        return
      }
      if (visible === 'visible') {
        start()
      }
      else {
        disconnect()
      }
    })
  }

  return {
    certJob,
    certQueue,
    transport,
    transportLabel,
    jobActionPending,
    loadActivity,
    ensureLive,
    registerPageHooks,
    clearPageHooks,
    cancelJob,
    resumeJob,
    rerunJob,
    deleteJob,
    start,
    disconnect,
    useGlobalLifecycle,
  }
}
