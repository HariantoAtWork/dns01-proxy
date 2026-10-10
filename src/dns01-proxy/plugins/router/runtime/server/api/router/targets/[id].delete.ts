import { deleteRouterTarget } from '../../../utils/routerTargetsFile'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Target id is required' })
  }
  const ok = await deleteRouterTarget(id)
  if (!ok) {
    throw createError({ statusCode: 404, statusMessage: 'Target not found' })
  }
  return { ok: true }
})
