import { deleteAccessList } from '../../../utils/accessListsFile'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }
  const ok = await deleteAccessList(id)
  if (!ok) {
    throw createError({ statusCode: 404, statusMessage: 'Access list not found' })
  }
  return { ok: true }
})
