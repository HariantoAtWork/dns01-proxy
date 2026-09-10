import { getProxyHost } from '../../../../utils/proxyHostsFile'
import { probeProxyHostHealth } from '../../../../utils/proxyHostHealth'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Host id is required' })
  }
  const host = await getProxyHost(id)
  if (!host) {
    throw createError({ statusCode: 404, statusMessage: 'Proxy host not found' })
  }

  return probeProxyHostHealth({
    forwardScheme: host.forwardScheme,
    forwardHost: host.forwardHost,
    forwardPort: host.forwardPort,
  })
})
