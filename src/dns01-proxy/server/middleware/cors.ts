import { getAcmeConfig } from '../utils/config'

export default defineEventHandler((event) => {
  let config
  try {
    config = getAcmeConfig()
  }
  catch {
    return
  }

  const origins = config.api.corsorigins
  const originHeader = getRequestHeader(event, 'origin')
  const allowOrigin = origins.includes('*')
    ? '*'
    : (originHeader && origins.includes(originHeader) ? originHeader : origins[0] || '*')

  setResponseHeader(event, 'Access-Control-Allow-Origin', allowOrigin)
  setResponseHeader(event, 'Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  setResponseHeader(event, 'Access-Control-Allow-Headers', 'Content-Type, X-Api-User, X-Api-Key')

  if (event.method === 'OPTIONS') {
    setResponseStatus(event, 204)
    return ''
  }
})
