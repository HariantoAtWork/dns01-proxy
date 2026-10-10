import { listActiveRouterBinds } from '../../../../../../server/router/runtime'
import { listRouterSources } from '../../utils/routerSourcesFile'
import { listRouterTargets } from '../../utils/routerTargetsFile'

export default defineEventHandler(async () => {
  const [sources, targets] = await Promise.all([listRouterSources(), listRouterTargets()])
  return {
    sources: sources.length,
    targets: targets.length,
    enabledSources: sources.filter(source => source.enabled).length,
    enabledTargets: targets.filter(target => target.enabled).length,
    binds: listActiveRouterBinds(),
  }
})
