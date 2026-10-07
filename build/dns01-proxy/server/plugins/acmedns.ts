import { closeAcmeDb, initAcmeDb } from '../utils/db'
import { ensureTxtStoreReady } from '../utils/txtStoreRegistry'
import { loadAcmeConfig } from '../utils/config'
import { createDnsServer } from '../dns/server'
import { ensureSharedModeGlueRecords } from '../utils/glueRecords'
import { ensureSharedModeAccount, isSharedMode } from '../utils/sharedModeBootstrap'

export default defineNitroPlugin(async (nitroApp) => {
  try {
    const config = await loadAcmeConfig()
    await initAcmeDb(config)
    ensureTxtStoreReady()

    if (isSharedMode(config)) {
      await ensureSharedModeGlueRecords(config)
      const shared = ensureSharedModeAccount(config)
      console.info(
        `[acmedns] shared mode enabled — CNAME apex target ${config.general.domain}`
        + ` TXT key ${shared.subdomain}`,
      )
    }

    const dns = createDnsServer(config)
    await dns.start()
    console.info(`[acmedns] DNS ready on ${config.general.listen} zone=${config.general.domain}`)

    nitroApp.hooks.hook('close', async () => {
      await dns.close()
      closeAcmeDb()
    })
  }
  catch (error) {
    console.error('[acmedns] failed to start DNS/API backend', error)
    throw error
  }
})
