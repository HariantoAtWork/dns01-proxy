import type { ProxyHostInput } from '../../../../shared/types/proxyHost'
import { upsertProxyHost } from '../../../utils/proxyHostsFile'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Host id is required' })
  }
  const body = await readBody<ProxyHostInput>(event).catch(() => null)
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Request body is required' })
  }
  const host = await upsertProxyHost({ ...body, id })
  return { host }
})
