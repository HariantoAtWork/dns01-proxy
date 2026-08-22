export default defineNitroPlugin(() => {
  if (!isAcmeEnabled()) {
    console.info('[cert-renew] CERTS_ACME_ENABLED is off; renew timer idle')
    return
  }

  const hours = getRenewIntervalHours()
  const ms = hours * 60 * 60 * 1000
  console.info(`[cert-renew] scheduling production renew every ${hours}h`)

  const tick = async () => {
    try {
      const results = await applyCertificates({
        mode: 'production',
        renewOnly: true,
      })
      for (const r of results) {
        if (!r.ok) {
          console.error(`[cert-renew] ${r.certName}: ${r.message}`)
        }
        else if (r.message === 'Renewed') {
          console.info(`[cert-renew] ${r.certName}: renewed`)
        }
      }
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('already running')) {
        console.error('[cert-renew]', message)
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
