import type { DnsCnameMatchResult } from '#shared/utils/dnsMatch'
import { challengeName } from '#client/utils/domain'

export type DnsValidationStatus = 'idle' | 'running' | 'ok' | 'timeout' | 'error'

const TOTAL_ATTEMPTS = 20
const INTERVAL_MS = 15_000

export function useDnsValidation() {
  const status = ref<DnsValidationStatus>('idle')
  const attempts = ref(0)
  const message = ref('')
  const lastChecked = ref<string | null>(null)

  let timer: ReturnType<typeof setInterval> | null = null
  let inFlight = false

  function stopTimer() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function reset() {
    stopTimer()
    inFlight = false
    status.value = 'idle'
    attempts.value = 0
    message.value = ''
  }

  async function tick(domain: string, fulldomain: string) {
    if (inFlight || status.value !== 'running') {
      return
    }

    inFlight = true
    attempts.value += 1
    const name = challengeName(domain)

    try {
      const result = await $fetch<DnsCnameMatchResult>('/api/dns/cname-check', {
        method: 'POST',
        body: { name, expected: fulldomain },
      })

      lastChecked.value = new Date().toISOString()

      if (result.status === 'ok') {
        stopTimer()
        status.value = 'ok'
        message.value = result.message
        inFlight = false
        return
      }

      if (attempts.value >= TOTAL_ATTEMPTS) {
        stopTimer()
        status.value = 'timeout'
        message.value = 'DNS validation timeout. The CNAME is not visible yet.'
      }
    }
    catch (error) {
      if (attempts.value >= TOTAL_ATTEMPTS) {
        stopTimer()
        status.value = 'error'
        message.value = error instanceof Error ? error.message : 'DNS query failed'
      }
    }
    finally {
      inFlight = false
    }
  }

  function start(domain: string, fulldomain: string) {
    stopTimer()
    status.value = 'running'
    attempts.value = 0
    message.value = 'Checking public resolvers for the CNAME.'
    void tick(domain, fulldomain)
    timer = setInterval(() => {
      void tick(domain, fulldomain)
    }, INTERVAL_MS)
  }

  function cancel() {
    stopTimer()
    if (status.value === 'running') {
      status.value = 'idle'
      message.value = 'Validation cancelled.'
    }
  }

  onScopeDispose(() => {
    stopTimer()
  })

  return {
    status,
    attempts,
    totalAttempts: TOTAL_ATTEMPTS,
    intervalMs: INTERVAL_MS,
    message,
    lastChecked,
    start,
    cancel,
    reset,
  }
}
