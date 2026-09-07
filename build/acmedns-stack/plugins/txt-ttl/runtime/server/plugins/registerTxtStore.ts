import { ensureTxtStoreReady, requireTxtStore } from '../../../../../server/utils/txtStoreRegistry'
import { resolveTxtTtlSeconds } from '../../shared/txtTtlConstants'

/** Sweep often enough that a short TTL does not leave stale slots in memory for long. */
const PURGE_INTERVAL_MS = 60_000

export default defineNitroPlugin(() => {
  ensureTxtStoreReady()

  const interval = setInterval(() => {
    const purged = requireTxtStore().purgeExpired()
    if (purged > 0) {
      console.info(`[txt-ttl] purged ${purged} expired TXT slot(s)`)
    }
  }, PURGE_INTERVAL_MS)

  interval.unref?.()

  console.info(
    `[txt-ttl] plugin loaded (lifetime ${resolveTxtTtlSeconds()}s = settle + hold, purge every ${PURGE_INTERVAL_MS / 1000}s)`,
  )
})
