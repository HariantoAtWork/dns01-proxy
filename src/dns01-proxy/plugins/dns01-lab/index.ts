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
  const withoutExt = relPath.replace(/\.vue$/, '')
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
      out.push(relative(base, full))
    }
  }
  return out
}

export default defineNuxtModule({
  meta: {
    name: 'acmedns-dns01-lab',
    configKey: 'dns01Lab',
  },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const runtime = resolver.resolve('./runtime')
    const shared = resolver.resolve('./runtime/shared')

    nuxt.options.alias['#lab-shared'] = shared
    nuxt.options.alias['#lab'] = runtime

    addServerScanDir(resolver.resolve('./runtime/server'))
    addImportsDir(resolver.resolve('./runtime/composables'))
    addComponentsDir({
      path: resolver.resolve('./runtime/components'),
      pathPrefix: true,
    })

    const pagesDir = resolver.resolve('./runtime/pages')
    extendPages((pages) => {
      for (const rel of collectVueFiles(pagesDir)) {
        const { name, path } = pageRouteFromFile(rel)
        pages.push({
          name: `acmedns-dns01-lab-${name}`,
          path,
          file: join(pagesDir, rel),
        })
      }
    })
  },
})
