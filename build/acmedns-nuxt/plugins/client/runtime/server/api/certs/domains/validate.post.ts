export default defineEventHandler(async (event) => {
  const body = await readBody<{ text?: string }>(event)
  if (typeof body?.text !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Body must include text string',
    })
  }
  return parseDomainsText(body.text)
})
