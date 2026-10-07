import type { ProxyHostInput } from '../../../shared/types/proxyHost'
import { upsertProxyHost } from '../../utils/proxyHostsFile'

export default defineEventHandler(async (event) => {
  const body = await readBody<ProxyHostInput>(event).catch(() => null)
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Request body is required' })
  }
  const host = await upsertProxyHost(body)
  return { host }
})
