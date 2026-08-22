export default defineEventHandler(async (event) => {
  const body = await readBody<{ text?: string }>(event)
  if (typeof body?.text !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Body must include text string',
    })
  }
  const result = await writeDomainsFile(body.text)
  if (!result.ok) {
    setResponseStatus(event, 400)
  }
  return result
})
