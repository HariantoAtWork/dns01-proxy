import { authenticateUpdate } from '../utils/auth'
import { updateTXT } from '../utils/db'
import { acmeDnsError, isAcmeDnsError } from '../utils/errors'
import { jsonError, validSubdomain, validTXT } from '../utils/validation'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({})) as { subdomain?: string, txt?: string }

  let authenticated
  try {
    authenticated = authenticateUpdate(event, body)
  }
  catch (error) {
    if (isAcmeDnsError(error)) {
      setResponseStatus(event, error.statusCode)
      return error.data ?? jsonError('forbidden')
    }
    throw error
  }

  if (!validSubdomain(authenticated.subdomain)) {
    setResponseStatus(event, 400)
    return jsonError('bad_subdomain')
  }
  if (!validTXT(authenticated.txt)) {
    setResponseStatus(event, 400)
    return jsonError('bad_txt')
  }

  try {
    const updated = updateTXT({ subdomain: authenticated.subdomain, txt: authenticated.txt })
    if (!updated) {
      throw acmeDnsError(404, 'subdomain_not_found')
    }
    setResponseStatus(event, 200)
    return { txt: authenticated.txt }
  }
  catch (error) {
    if (isAcmeDnsError(error)) {
      setResponseStatus(event, error.statusCode)
      return error.data ?? jsonError('db_error')
    }
    console.error('[acmedns] update failed', error)
    setResponseStatus(event, 500)
    return jsonError('db_error')
  }
})
