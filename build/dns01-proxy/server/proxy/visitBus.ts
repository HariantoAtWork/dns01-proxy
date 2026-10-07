export type ProxyVisitEvent = {
  hostId: string
  domain: string
  at: string
}

type ProxyVisitListener = (event: ProxyVisitEvent) => void

const listeners = new Set<ProxyVisitListener>()
const lastPublishedAt = new Map<string, number>()

const COALESCE_MS = 300

function coalesceKey(hostId: string, domain: string): string {
  return `${hostId}:${domain}`
}

export function subscribeProxyVisits(listener: ProxyVisitListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Fire-and-forget visit ping for Source LED flash.
 * No-op when the hosts page is not listening; coalesces bursts per hostId:domain.
 */
export function publishProxyVisit(event: ProxyVisitEvent): void {
  if (listeners.size === 0) {
    return
  }

  const key = coalesceKey(event.hostId, event.domain)
  const now = Date.now()
  const last = lastPublishedAt.get(key) ?? 0
  if (now - last < COALESCE_MS) {
    return
  }
  lastPublishedAt.set(key, now)

  for (const listener of listeners) {
    try {
      listener(event)
    }
    catch {
      // Never break the edge request path.
    }
  }
}

/** Test helper — clears subscribers and coalesce map. */
export function resetProxyVisitBusForTests(): void {
  listeners.clear()
  lastPublishedAt.clear()
}
