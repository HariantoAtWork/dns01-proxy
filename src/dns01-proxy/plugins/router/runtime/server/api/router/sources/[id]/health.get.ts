import { getRouterSource } from '../../../../utils/routerSourcesFile'
import { getRouterTarget } from '../../../../utils/routerTargetsFile'
import { probeRouterSourceHealth } from '../../../../utils/routerHealth'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Source id is required' })
  }
  const source = await getRouterSource(id)
  if (!source) {
    throw createError({ statusCode: 404, statusMessage: 'Source not found' })
  }
  const target = source.targetId ? await getRouterTarget(source.targetId) : null
  return probeRouterSourceHealth(source, target)
})
