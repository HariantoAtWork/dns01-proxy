import {
  getRenewIntervalHours,
  isAcmeEnabled,
} from './certSettings'
import { resolveCertsRenewDisabled } from './appSettings'
import { appendCertActivity } from './certActivity'
import { applyCertificates } from './certApply'

const FIRST_TICK_MS = 15_000

let timer: ReturnType<typeof setTimeout> | null = null
let armed = false
let tickInFlight = false

export function isRenewSchedulerEnabled() {
  return !resolveCertsRenewDisabled().value
}

function clearTimer() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

function intervalMs() {
  return Math.max(1, getRenewIntervalHours()) * 60 * 60 * 1000
}

async function tick() {
  // Manual Apply is separate — this timer only runs automatic production renew.
  if (!isRenewSchedulerEnabled() || !isAcmeEnabled()) {
    return
  }
  if (tickInFlight) {
    return
  }
  tickInFlight = true
  try {
    await applyCertificates({
      mode: 'production',
      renewOnly: true,
      source: 'renew',
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('already running')) {
      appendCertActivity({
        source: 'renew',
        mode: 'production',
        level: 'error',
        message,
      })
    }
  }
  finally {
    tickInFlight = false
  }
}

function arm(delayMs: number) {
  clearTimer()
  if (!armed) {
    return
  }
  timer = setTimeout(() => {
    timer = null
    void tick().finally(() => {
      if (armed && isRenewSchedulerEnabled()) {
        arm(intervalMs())
      }
    })
  }, delayMs)
}

/** Start the periodic renew timer (no-op when CERTS_RENEW_DISABLED). */
export function startRenewScheduler(options?: { quiet?: boolean }) {
  if (!isRenewSchedulerEnabled()) {
    stopRenewScheduler({ quiet: true })
    if (!options?.quiet) {
      appendCertActivity({
        source: 'system',
        mode: 'production',
        level: 'info',
        message: 'Renew scheduler off (CERTS_RENEW_DISABLED) — manual Apply still works',
      })
    }
    return
  }

  const wasArmed = armed
  armed = true
  if (!options?.quiet && !wasArmed) {
    appendCertActivity({
      source: 'system',
      mode: 'production',
      level: 'info',
      message: `Renew scheduler on — production check every ${getRenewIntervalHours()}h`,
    })
  }
  arm(FIRST_TICK_MS)
}

/** Clear the pending renew timer so it does not fire again. */
export function stopRenewScheduler(options?: { quiet?: boolean }) {
  const wasArmed = armed || timer !== null
  armed = false
  clearTimer()
  if (!options?.quiet && wasArmed) {
    appendCertActivity({
      source: 'system',
      mode: 'production',
      level: 'info',
      message: 'Renew scheduler stopped',
    })
  }
}

/** Re-read settings and start or stop the timer. */
export function syncRenewScheduler() {
  if (isRenewSchedulerEnabled()) {
    startRenewScheduler()
  }
  else {
    stopRenewScheduler()
  }
}

/**
 * Persist renew-scheduler on/off to app-settings.json and sync the timer.
 * Does not affect manual Apply / Force Issue.
 */
export async function setRenewSchedulerEnabled(enabled: boolean): Promise<boolean> {
  const { readAppSettingsFile, writeAppSettingsFile } = await import('./appSettings')
  const file = await readAppSettingsFile()
  const nextDisabled = !enabled
  if (file.certsRenewDisabled !== nextDisabled) {
    file.certsRenewDisabled = nextDisabled
    await writeAppSettingsFile(file)
  }
  syncRenewScheduler()
  return isRenewSchedulerEnabled()
}

export function isRenewSchedulerRunning() {
  return armed
}
