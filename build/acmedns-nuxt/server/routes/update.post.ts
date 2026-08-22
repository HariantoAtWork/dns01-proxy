import { authenticateUpdate } from '../utils/auth'
import { updateTXT } from '../utils/db'
import { jsonError, validSubdomain, validTXT } from '../utils/validation'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({})) as { subdomain?: string, txt?: string }

  let authenticated
  try {
    authenticated = authenticateUpdate(event, body)
  }
  catch (error) {
    const err = error as { statusCode?: number, data?: unknown }
    if (err.statusCode === 401) {
      setResponseStatus(event, 401)
      return err.data ?? jsonError('forbidden')
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
    updateTXT({ subdomain: authenticated.subdomain, txt: authenticated.txt })
    setResponseStatus(event, 200)
    return { txt: authenticated.txt }
  }
  catch (error) {
    console.error('[acmedns] update failed', error)
    setResponseStatus(event, 500)
    return jsonError('db_error')
  }
})
