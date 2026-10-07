import type { DnsCnameMatchResult } from '#shared/utils/dnsMatch'

export default defineEventHandler(async (event): Promise<DnsCnameMatchResult> => {
  setDnsNoStore(event)
  const body = await readBody<{ name?: string, expected?: string }>(event)

  if (!body?.name?.trim()) {
    throw createError({ statusCode: 400, message: 'Name is required' })
  }
  if (!body?.expected?.trim()) {
    throw createError({ statusCode: 400, message: 'Expected CNAME target is required' })
  }

  return dnsQueryCnameAnyMatch(body.name.trim(), body.expected.trim())
})
