import { listRouterSources } from '../../utils/routerSourcesFile'

export default defineEventHandler(async () => {
  const sources = await listRouterSources()
  return { sources }
})
