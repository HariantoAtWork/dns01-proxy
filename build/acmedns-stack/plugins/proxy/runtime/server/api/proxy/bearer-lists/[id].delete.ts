import { deleteBearerList } from '../../../utils/bearerListsFile'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }
  const ok = await deleteBearerList(id)
  if (!ok) {
    throw createError({ statusCode: 404, statusMessage: 'Bearer list not found' })
  }
  return { ok: true }
})
