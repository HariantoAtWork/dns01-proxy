import { lookupVisitIp } from '../../../../../client/runtime/server/utils/publicIps'

export default defineEventHandler((event) => {
  const visit = lookupVisitIp(event)
  if (!visit) {
    return { address: null, via: null }
  }
  return {
    address: visit.address,
    via: visit.via,
  }
})
