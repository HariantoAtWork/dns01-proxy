export default defineNitroPlugin(() => {
  if (!isAcmeEnabled()) {
    appendCertActivity({
      source: 'system',
      level: 'info',
      message: 'CERTS_ACME_DISABLED is set; production renew timer idle (staging Apply still allowed)',
    })
    return
  }

  const hours = getRenewIntervalHours()
  const ms = hours * 60 * 60 * 1000
  appendCertActivity({
    source: 'system',
    level: 'info',
    message: `Scheduling production renew every ${hours}h`,
  })

  const tick = async () => {
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

  // First check shortly after boot, then on interval
  setTimeout(() => {
    void tick()
    setInterval(() => {
      void tick()
    }, ms)
  }, 15_000)
})
