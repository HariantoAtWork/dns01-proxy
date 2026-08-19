export default defineEventHandler(async (event) => {
  const body = await readBody<{
    serverUrl?: string
    username?: string
    password?: string
    subdomain?: string
    txt?: string
  }>(event)

  if (!body?.username || !body.password || !body.subdomain || !body.txt) {
    throw createError({
      statusCode: 400,
      statusMessage: 'username, password, subdomain, and txt are required',
    })
  }

  return await updateAcmeDnsTxt({
    serverUrl: body.serverUrl || resolveAcmeDnsBase(),
    username: body.username,
    password: body.password,
    subdomain: body.subdomain,
    txt: body.txt,
  })
})
