import type {
  CertLiveActivityEvent,
  CertLiveQueueEvent,
  CertLiveRateLimitsEvent,
  CertLiveSnapshot,
  CertLiveStatusEvent,
} from '#shared/types/certs'

export type CertLiveBusEvent =
  | { type: 'snapshot', data: CertLiveSnapshot }
  | { type: 'activity', data: CertLiveActivityEvent }
  | { type: 'queue', data: CertLiveQueueEvent }
  | { type: 'status', data: CertLiveStatusEvent }
  | { type: 'rateLimits', data: CertLiveRateLimitsEvent }
  | { type: 'ping', data: Record<string, never> }

type CertLiveListener = (event: CertLiveBusEvent) => void

const listeners = new Set<CertLiveListener>()

export function subscribeCertLive(listener: CertLiveListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function publishCertLive(event: CertLiveBusEvent) {
  for (const listener of listeners) {
    listener(event)
  }
}
