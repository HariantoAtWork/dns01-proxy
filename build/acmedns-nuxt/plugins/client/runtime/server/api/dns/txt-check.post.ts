import type { DnsTxtExistenceResult } from '#shared/utils/dnsMatch'

export default defineEventHandler(async (event): Promise<DnsTxtExistenceResult> => {
  setDnsNoStore(event)
  const body = await readBody<{ name?: string }>(event)

  if (!body?.name?.trim()) {
    throw createError({ statusCode: 400, message: 'Name is required' })
  }

  return dnsQueryTxtAnyResolvable(body.name.trim())
})
