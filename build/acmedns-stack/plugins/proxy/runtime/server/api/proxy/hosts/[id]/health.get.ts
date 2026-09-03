import { getProxyHost } from '../../../../utils/proxyHostsFile'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Host id is required' })
  }
  const host = await getProxyHost(id)
  if (!host) {
    throw createError({ statusCode: 404, statusMessage: 'Proxy host not found' })
  }

  const url = `${host.forwardScheme}://${host.forwardHost}:${host.forwardPort}/`
  const started = Date.now()
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(3000),
    })
    if (res.status === 405 || res.status === 501) {
      await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(3000),
      })
    }
    return {
      online: true,
      latencyMs: Date.now() - started,
      status: res.status,
      target: url,
    }
  }
  catch {
    return {
      online: false,
      latencyMs: Date.now() - started,
      target: url,
    }
  }
})
