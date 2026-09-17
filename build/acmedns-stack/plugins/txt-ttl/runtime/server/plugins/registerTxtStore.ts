import { ensureTxtStoreReady, requireTxtStore } from '../../../../../server/utils/txtStoreRegistry'
import { ensureAliasStoreReady, requireAliasStore } from '../../../../../server/utils/aliasStoreRegistry'
import { resolveTxtTtlSeconds } from '../../shared/txtTtlConstants'

/** Sweep often enough that a short TTL does not leave stale slots in memory for long. */
const PURGE_INTERVAL_MS = 60_000

export default defineNitroPlugin(() => {
  ensureTxtStoreReady()
  ensureAliasStoreReady()

  const interval = setInterval(() => {
    const purgedTxt = requireTxtStore().purgeExpired()
    if (purgedTxt > 0) {
      console.info(`[txt-ttl] purged ${purgedTxt} expired TXT slot(s)`)
    }
    const purgedAlias = requireAliasStore().purgeExpired()
    if (purgedAlias > 0) {
      console.info(`[auth-hop] purged ${purgedAlias} expired alias(es)`)
    }
  }, PURGE_INTERVAL_MS)

  interval.unref?.()

  console.info(
    `[txt-ttl] plugin loaded (lifetime ${resolveTxtTtlSeconds()}s = settle + hold, purge every ${PURGE_INTERVAL_MS / 1000}s)`,
  )
})
