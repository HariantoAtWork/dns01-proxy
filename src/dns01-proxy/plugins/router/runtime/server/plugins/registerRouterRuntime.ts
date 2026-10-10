import { reloadRouterRuntime } from '../../../../../server/router/runtime'

export default defineNitroPlugin(() => {
  void reloadRouterRuntime().then(() => {
    console.info('[router] TCP/UDP binds loaded')
  }).catch((error) => {
    console.warn('[router] failed to load binds:', error)
  })
})
