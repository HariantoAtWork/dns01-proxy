import { deleteProxyHost } from '../../../utils/proxyHostsFile'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Host id is required' })
  }
  const ok = await deleteProxyHost(id)
  if (!ok) {
    throw createError({ statusCode: 404, statusMessage: 'Proxy host not found' })
  }
  return { ok: true }
})
