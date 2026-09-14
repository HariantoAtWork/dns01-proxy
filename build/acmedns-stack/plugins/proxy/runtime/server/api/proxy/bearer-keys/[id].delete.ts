import { deleteBearerKey } from '../../../utils/bearerKeysFile'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }
  const ok = await deleteBearerKey(id)
  if (!ok) {
    throw createError({ statusCode: 404, statusMessage: 'Bearer key not found' })
  }
  return { ok: true }
})
