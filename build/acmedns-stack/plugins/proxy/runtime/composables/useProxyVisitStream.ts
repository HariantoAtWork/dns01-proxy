export type ProxyVisitFlash = {
  hostId: string
  domain: string
}

const FLASH_MS = 400
const RECONNECT_DELAY_MS = 1_000

export function useProxyVisitStream() {
  const flashes = ref<ProxyVisitFlash[]>([])
  let source: EventSource | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let shouldRun = false
  const clearTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function flashKey(hostId: string, domain: string): string {
    return `${hostId}:${domain}`
  }

  function clearReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function scheduleClear(hostId: string, domain: string) {
    const key = flashKey(hostId, domain)
    const existing = clearTimers.get(key)
    if (existing) {
      clearTimeout(existing)
    }
    clearTimers.set(key, setTimeout(() => {
      clearTimers.delete(key)
      flashes.value = flashes.value.filter(
        item => !(item.hostId === hostId && item.domain === domain),
      )
    }, FLASH_MS))
  }

  function onVisit(hostId: string, domain: string) {
    const key = flashKey(hostId, domain)
    if (!flashes.value.some(item => flashKey(item.hostId, item.domain) === key)) {
      flashes.value = [...flashes.value, { hostId, domain }]
    }
    scheduleClear(hostId, domain)
  }

  function disconnect() {
    shouldRun = false
    clearReconnect()
    if (source) {
      source.close()
      source = null
    }
    for (const timer of clearTimers.values()) {
      clearTimeout(timer)
    }
    clearTimers.clear()
    flashes.value = []
  }

  function connect() {
    if (!import.meta.client || !shouldRun) {
      return
    }
    if (source) {
      source.close()
      source = null
    }

    const next = new EventSource('/api/proxy/visits/stream')
    source = next

    next.addEventListener('visit', (raw) => {
      try {
        const data = JSON.parse((raw as MessageEvent).data) as {
          hostId?: string
          domain?: string
        }
        if (typeof data.hostId === 'string' && typeof data.domain === 'string') {
          onVisit(data.hostId, data.domain)
        }
      }
      catch {
        // Ignore malformed events.
      }
    })

    next.onerror = () => {
      next.close()
      if (source === next) {
        source = null
      }
      if (!shouldRun) {
        return
      }
      clearReconnect()
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        connect()
      }, RECONNECT_DELAY_MS)
    }
  }

  function start() {
    if (!import.meta.client) {
      return
    }
    shouldRun = true
    connect()
  }

  function stop() {
    disconnect()
  }

  onMounted(() => {
    start()
  })

  onBeforeUnmount(() => {
    stop()
  })

  return {
    flashes,
    start,
    stop,
  }
}
