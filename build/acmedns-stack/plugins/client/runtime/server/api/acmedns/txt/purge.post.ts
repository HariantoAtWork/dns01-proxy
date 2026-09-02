import { purgeAcmeDnsTxtSlots } from '../../../utils/acmedns'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ subdomain?: string }>(event).catch(() => ({}))
  return await purgeAcmeDnsTxtSlots({ subdomain: body?.subdomain })
})
