import type { RouterSourceInput } from '../../../shared/types/routerSource'
import { upsertRouterSource } from '../../utils/routerSourcesFile'

export default defineEventHandler(async (event) => {
  const body = await readBody<RouterSourceInput>(event).catch(() => null)
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Request body is required' })
  }
  const source = await upsertRouterSource(body)
  return { source }
})
