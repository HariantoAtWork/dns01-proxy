import type { PublicNetworkResult } from '#shared/types/network'
import { lookupHostPublicIps, lookupVisitIp } from '../../utils/publicIps'
import { lookupPort53Reachability } from '../../utils/port53Reachability'

export default defineEventHandler(async (event): Promise<PublicNetworkResult> => {
  const query = getQuery(event)
  const force = String(query.refresh || '') === '1'
  const host = await lookupHostPublicIps(force)
  const [visit, port53] = await Promise.all([
    Promise.resolve(lookupVisitIp(event)),
    lookupPort53Reachability({ host, forcePublicIp: force }).catch((error) => {
      console.warn('[network/public] port 53 probe failed', error)
      return null
    }),
  ])

  if (!host.length) {
    return {
      success: false,
      message: 'No public address answered. The container may have no outbound internet.',
      host,
      visit,
      port53,
      checkedAt: new Date().toISOString(),
    }
  }

  return {
    success: true,
    host,
    visit,
    port53,
    checkedAt: new Date().toISOString(),
  }
})
