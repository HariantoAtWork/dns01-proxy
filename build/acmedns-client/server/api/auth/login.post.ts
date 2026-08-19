import type { AuthLoginBody, AuthLoginResult } from '#shared/types/auth'

export default defineEventHandler(async (event): Promise<AuthLoginResult> => {
  if (!isRestrictMode(event)) {
    return { ok: true, restrictMode: false }
  }

  const body = await readBody<AuthLoginBody>(event).catch(() => ({} as AuthLoginBody))
  const username = String(body?.username ?? '')
  const password = String(body?.password ?? '')
  const expectedPassword = getAdministratorPassword(event)

  if (!credentialsMatch(username, password, expectedPassword)) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorised',
      message: 'Wrong username or password',
    })
  }

  setSessionCookie(event, createSessionToken(expectedPassword))
  return { ok: true, restrictMode: true }
})
