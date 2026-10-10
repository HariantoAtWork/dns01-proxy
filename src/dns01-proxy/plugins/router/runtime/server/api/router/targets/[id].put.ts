import type { RouterTargetInput } from '../../../../shared/types/routerTarget'
import { upsertRouterTarget } from '../../../utils/routerTargetsFile'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Target id is required' })
  }
  const body = await readBody<RouterTargetInput>(event).catch(() => null)
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Request body is required' })
  }
  const target = await upsertRouterTarget({ ...body, id })
  return { target }
})
