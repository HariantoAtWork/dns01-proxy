import { rotateBearerKey } from '../../../../utils/bearerKeysFile'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }
  const key = await rotateBearerKey(id)
  return { key }
})
