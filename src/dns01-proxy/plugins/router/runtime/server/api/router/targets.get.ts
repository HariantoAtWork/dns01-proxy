import { listRouterTargets } from '../../utils/routerTargetsFile'

export default defineEventHandler(async () => {
  const targets = await listRouterTargets()
  return { targets }
})
