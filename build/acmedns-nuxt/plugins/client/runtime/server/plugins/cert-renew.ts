export default defineNitroPlugin(() => {
  appendCertActivity({
    source: 'system',
    level: 'info',
    message: isAcmeEnabled()
      ? `Scheduling production renew (interval from settings, currently ${getRenewIntervalHours()}h)`
      : 'CERTS_ACME_DISABLED is set; production renew timer idle (staging Apply still allowed)',
  })

  const tick = async () => {
    if (!isAcmeEnabled()) {
      return
    }
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
          level: 'error',
          message,
        })
      }
    }
  }

  const scheduleNext = (delayMs: number) => {
    setTimeout(() => {
      void tick().finally(() => {
        const hours = getRenewIntervalHours()
        scheduleNext(Math.max(1, hours) * 60 * 60 * 1000)
      })
    }, delayMs)
  }

  // First check shortly after boot, then on settings-driven interval
  scheduleNext(15_000)
})
