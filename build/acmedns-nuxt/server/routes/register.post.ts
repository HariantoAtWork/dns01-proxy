import { getAcmeConfig } from '../utils/config'
import { registerAccount } from '../utils/db'
import { jsonError, validateCidrList } from '../utils/validation'

export default defineEventHandler(async (event) => {
  const config = getAcmeConfig()

  if (config.api.disable_registration) {
    throw createError({
      statusCode: 403,
      statusMessage: 'registration_disabled',
      data: jsonError('registration_disabled'),
    })
  }

  let allowfrom: string[] = []
  const body = await readBody(event).catch(() => null)

  if (body && typeof body === 'object') {
    const raw = (body as { allowfrom?: unknown }).allowfrom
    if (raw !== undefined) {
      if (!Array.isArray(raw) || !raw.every(item => typeof item === 'string')) {
        setResponseStatus(event, 400)
        return jsonError('malformed_json_payload')
      }
      try {
        validateCidrList(raw)
        allowfrom = raw
      }
      catch {
        setResponseStatus(event, 400)
        return jsonError('invalid_allowfrom_cidr')
      }
    }
  }

  try {
    const account = registerAccount(allowfrom)
    setResponseStatus(event, 201)
    return {
      username: account.username,
      password: account.plaintextPassword,
      fulldomain: `${account.subdomain}.${config.general.domain}`,
      subdomain: account.subdomain,
      allowfrom: account.allowfrom,
    }
  }
  catch (error) {
    console.error('[acmedns] registration failed', error)
    setResponseStatus(event, 500)
    return jsonError(error instanceof Error ? error.message : 'db_error')
  }
})
