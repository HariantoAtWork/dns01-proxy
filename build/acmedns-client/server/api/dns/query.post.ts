import type { DnsQueryResult } from '#shared/types/clientstorage'

export default defineEventHandler(async (event): Promise<DnsQueryResult> => {
  const body = await readBody<{ name?: string, type?: string }>(event)

  if (!body?.name) {
    return { success: false, message: 'Name is required' }
  }

  try {
    const records = await dnsQuery(body.name, body.type || 'CNAME')
    return { success: true, data: records }
  }
  catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to query DNS',
    }
  }
})
