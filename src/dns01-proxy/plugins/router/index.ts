import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  addComponentsDir,
  addImportsDir,
  createResolver,
  defineNuxtModule,
  extendPages,
  addServerScanDir,
} from 'nuxt/kit'

function pageRouteFromFile(relPath: string): { name: string, path: string } {
  const withoutExt = relPath.replace(/\.vue$/, '').replace(/\\/g, '/')
  const segments = withoutExt.split('/')
  const routeSegments: string[] = []
  const nameParts: string[] = []

  for (const segment of segments) {
    if (segment === 'index') {
      nameParts.push('index')
      continue
    }
    const dynamic = /^\[(.+)\]$/.exec(segment)
    if (dynamic) {
      const param = dynamic[1]!
      routeSegments.push(`:${param}()`)
      nameParts.push(param)
      continue
    }
    routeSegments.push(segment)
    nameParts.push(segment)
  }

  const path = routeSegments.length === 0 ? '/' : `/${routeSegments.join('/')}`
  return {
    name: nameParts.filter(part => part !== 'index').join('-') || 'index',
    path,
  }
}

function collectVueFiles(dir: string, base = dir): string[] {
  if (!existsSync(dir)) {
    return []
  }
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...collectVueFiles(full, base))
    }
    else if (entry.endsWith('.vue')) {
      out.push(relative(base, full).replace(/\\/g, '/'))
    }
  }
  return out
}

export default defineNuxtModule({
  meta: {
    name: 'acmedns-router',
    configKey: 'router',
  },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const runtime = resolver.resolve('./runtime')
    const shared = resolver.resolve('./runtime/shared')

    nuxt.options.alias['#router-shared'] = shared
    nuxt.options.alias['#router'] = runtime

    addServerScanDir(resolver.resolve('./runtime/server'))
    addImportsDir(resolver.resolve('./runtime/composables'))
    addComponentsDir({
      path: resolver.resolve('./runtime/components'),
      pathPrefix: true,
    })

    const pagesDir = resolver.resolve('./runtime/pages')
    extendPages((pages) => {
      pages.push({
        name: 'acmedns-router',
        path: '/router',
        file: resolver.resolve('./runtime/pages/router.vue'),
        children: [
          {
            name: 'acmedns-router-overview',
            path: '',
            file: resolver.resolve('./runtime/pages/router/index.vue'),
          },
          {
            name: 'acmedns-router-targets',
            path: 'targets',
            file: resolver.resolve('./runtime/pages/router/targets.vue'),
          },
          {
            name: 'acmedns-router-sources',
            path: 'sources',
            file: resolver.resolve('./runtime/pages/router/sources.vue'),
          },
        ],
      })

      for (const rel of collectVueFiles(pagesDir)) {
        if (rel === 'router.vue' || rel.startsWith('router/')) {
          continue
        }
        const { name, path } = pageRouteFromFile(rel)
        pages.push({
          name: `acmedns-router-${name}`,
          path,
          file: join(pagesDir, rel),
        })
      }
    })
  },
})
