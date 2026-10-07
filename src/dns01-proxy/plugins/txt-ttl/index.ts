import { createResolver, defineNuxtModule, addServerScanDir } from 'nuxt/kit'

export default defineNuxtModule({
  meta: {
    name: 'acmedns-txt-ttl',
    configKey: 'txtTtl',
  },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    nuxt.options.alias['#txt-ttl-shared'] = resolver.resolve('./runtime/shared')
    addServerScanDir(resolver.resolve('./runtime/server'))
  },
})
