import type { PublicNetworkResult } from '#shared/types/network'

export default defineEventHandler(async (event): Promise<PublicNetworkResult> => {
  const query = getQuery(event)
  const force = String(query.refresh || '') === '1'
  const host = await lookupHostPublicIps(force)
  const visit = lookupVisitIp(event)

  if (!host.length) {
    return {
      success: false,
      message: 'No public address answered. The container may have no outbound internet.',
      host,
      visit,
      checkedAt: new Date().toISOString(),
    }
  }

  return {
    success: true,
    host,
    visit,
    checkedAt: new Date().toISOString(),
  }
})
