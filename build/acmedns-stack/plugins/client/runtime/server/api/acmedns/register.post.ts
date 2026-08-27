import { isSharedMode } from '../../../../../../server/utils/sharedMode'

export default defineEventHandler(async (event) => {
  if (isSharedMode()) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Registration is disabled in shared (tiny) mode',
    })
  }

  const body = await readBody<{ serverUrl?: string }>(event)
  const serverUrl = body?.serverUrl || resolveAcmeDnsBase()
  return await registerAcmeDnsAccount(serverUrl)
})
