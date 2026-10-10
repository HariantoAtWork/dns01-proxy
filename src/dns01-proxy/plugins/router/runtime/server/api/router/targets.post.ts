import type { RouterTargetInput } from '../../../shared/types/routerTarget'
import { upsertRouterTarget } from '../../utils/routerTargetsFile'

export default defineEventHandler(async (event) => {
  const body = await readBody<RouterTargetInput>(event).catch(() => null)
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Request body is required' })
  }
  const target = await upsertRouterTarget(body)
  return { target }
})
