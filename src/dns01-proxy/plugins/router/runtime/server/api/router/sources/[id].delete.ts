import { deleteRouterSource } from '../../../utils/routerSourcesFile'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Source id is required' })
  }
  const ok = await deleteRouterSource(id)
  if (!ok) {
    throw createError({ statusCode: 404, statusMessage: 'Source not found' })
  }
  return { ok: true }
})
