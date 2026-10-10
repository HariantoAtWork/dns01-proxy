import type { RouterSourceInput } from '../../../../shared/types/routerSource'
import { upsertRouterSource } from '../../../utils/routerSourcesFile'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Source id is required' })
  }
  const body = await readBody<RouterSourceInput>(event).catch(() => null)
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Request body is required' })
  }
  const source = await upsertRouterSource({ ...body, id })
  return { source }
})
