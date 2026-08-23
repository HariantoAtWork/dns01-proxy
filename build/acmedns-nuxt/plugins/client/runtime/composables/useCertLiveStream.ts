import type {
  CertActivityEntry,
  CertLiveActivityEvent,
  CertLiveQueueEvent,
  CertLiveRateLimitsEvent,
  CertLiveSnapshot,
  CertLiveStatusEvent,
} from '#shared/types/certs'
import { useIntervalFn } from '@vueuse/core'

export type CertLiveTransport = 'off' | 'connecting' | 'live' | 'polling' | 'paused'

const RECONNECT_GRACE_MS = 15_000
const POLL_FALLBACK_MS = 20_000

export function mergeLiveActivity(
  current: CertActivityEntry[],
  entry: CertActivityEntry,
  limit = 100,
) {
  if (current.some(item => item.id === entry.id)) {
    return current
  }
  return [entry, ...current].slice(0, limit)
}

export function certLiveTransportLabel(mode: CertLiveTransport) {
  switch (mode) {
    case 'connecting': return 'Connecting…'
    case 'live': return 'Live (SSE)'
    case 'polling': return 'Polling'
    case 'paused': return 'Paused'
    default: return 'Offline'
  }
}

export function useCertLiveStream(options: {
  directoryMode: Ref<'production' | 'staging'>
  onSnapshot: (data: CertLiveSnapshot) => void
  onActivity: (data: CertLiveActivityEvent, notify: boolean) => void
  onQueue: (data: CertLiveQueueEvent) => void
  onStatus: (data: CertLiveStatusEvent) => void
  onRateLimits: (data: CertLiveRateLimitsEvent) => void
  onPoll: () => void | Promise<void>
  pollBlocked?: Ref<boolean>
}) {
  const transport = ref<CertLiveTransport>('off')
  const transportLabel = computed(() => certLiveTransportLabel(transport.value))

  let source: EventSource | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null
  let lastEventAt = 0
  let shouldRun = false

  const { pause: pausePoll, resume: resumePoll } = useIntervalFn(async () => {
    if (transport.value !== 'polling' || options.pollBlocked?.value) {
      return
    }
    try {
      await options.onPoll()
    }
    catch {
      // Silent during background polling.
    }
  }, 20_000, { immediate: false })

  function clearFallbackTimer() {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer)
      fallbackTimer = null
    }
  }

  function markLiveEvent() {
    lastEventAt = Date.now()
    clearFallbackTimer()
    transport.value = 'live'
    pausePoll()
  }

  function usePollingFallback() {
    if (transport.value === 'polling') {
      return
    }
    transport.value = 'polling'
    resumePoll()
    void options.onPoll()
  }

  function disconnect() {
    shouldRun = false
    clearFallbackTimer()
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    source?.close()
    source = null
    pausePoll()
    transport.value = 'paused'
  }

  function scheduleReconnect() {
    if (!shouldRun || reconnectTimer) {
      return
    }
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, 3000)
  }

  function schedulePollingFallback() {
    clearFallbackTimer()
    fallbackTimer = setTimeout(() => {
      fallbackTimer = null
      const silentFor = Date.now() - lastEventAt
      if (!shouldRun || silentFor < RECONNECT_GRACE_MS) {
        return
      }
      if (source?.readyState === EventSource.OPEN) {
        markLiveEvent()
        return
      }
      source?.close()
      source = null
      usePollingFallback()
      scheduleReconnect()
    }, POLL_FALLBACK_MS)
  }

  function attachHandlers(next: EventSource) {
    next.addEventListener('snapshot', (event) => {
      options.onSnapshot(JSON.parse(event.data) as CertLiveSnapshot)
      markLiveEvent()
    })

    next.addEventListener('activity', (event) => {
      const data = JSON.parse(event.data) as CertLiveActivityEvent
      options.onActivity(data, true)
      markLiveEvent()
    })

    next.addEventListener('queue', (event) => {
      options.onQueue(JSON.parse(event.data) as CertLiveQueueEvent)
      markLiveEvent()
    })

    next.addEventListener('status', (event) => {
      const data = JSON.parse(event.data) as CertLiveStatusEvent
      if (data.mode === options.directoryMode.value) {
        options.onStatus(data)
      }
      markLiveEvent()
    })

    next.addEventListener('rateLimits', (event) => {
      options.onRateLimits(JSON.parse(event.data) as CertLiveRateLimitsEvent)
      markLiveEvent()
    })

    next.addEventListener('ping', () => {
      markLiveEvent()
    })

    next.onopen = () => {
      markLiveEvent()
    }

    next.onerror = () => {
      if (!shouldRun || !source) {
        return
      }

      if (source.readyState === EventSource.OPEN) {
        markLiveEvent()
        return
      }

      const silentFor = Date.now() - lastEventAt
      const hadLiveConnection = lastEventAt > 0

      if (source.readyState === EventSource.CONNECTING) {
        schedulePollingFallback()
        return
      }

      source.close()
      source = null

      if (hadLiveConnection && silentFor < RECONNECT_GRACE_MS) {
        scheduleReconnect()
        schedulePollingFallback()
        return
      }

      usePollingFallback()
      scheduleReconnect()
    }
  }

  function connect() {
    if (!import.meta.client || !shouldRun) {
      return
    }

    if (lastEventAt === 0) {
      transport.value = 'connecting'
    }

    source?.close()
    source = new EventSource('/api/certs/stream')
    attachHandlers(source)
  }

  function start() {
    shouldRun = true
    lastEventAt = 0
    transport.value = 'connecting'
    connect()
  }

  return {
    transport,
    transportLabel,
    start,
    disconnect,
  }
}
