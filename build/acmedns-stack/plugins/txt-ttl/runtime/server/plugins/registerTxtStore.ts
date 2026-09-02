import { ensureTxtStoreReady, requireTxtStore } from '../../../../../server/utils/txtStoreRegistry'
import { resolveTxtTtlSeconds } from '../../shared/txtTtlConstants'

const PURGE_INTERVAL_MS = 3_600_000

export default defineNitroPlugin(() => {
  ensureTxtStoreReady()

  const interval = setInterval(() => {
    const purged = requireTxtStore().purgeExpired()
    if (purged > 0) {
      console.info(`[txt-ttl] purged ${purged} expired TXT slot(s)`)
    }
  }, PURGE_INTERVAL_MS)

  interval.unref?.()

  console.info(`[txt-ttl] plugin loaded (TTL ${resolveTxtTtlSeconds()}s, hourly purge)`)
})
