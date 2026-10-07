import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { RuntimeConfig } from 'nuxt/schema'
import {
  addComponentsDir,
  addImportsDir,
  addPlugin,
  addRouteMiddleware,
  addServerScanDir,
  createResolver,
  defineNuxtModule,
  extendPages,
} from 'nuxt/kit'

/** Mirrors `runtimeConfig` keys — configure via `nuxt.config.ts`, not module defaults. */
export type AcmednsClientModuleOptions = Pick<
  RuntimeConfig,
  | 'dataRoot'
  | 'letsencryptDir'
  | 'acmednsUrl'
  | 'administratorPassword'
  | 'letsencryptEmail'
  | 'renewInterval'
  | 'certsAcmeDisabled'
  | 'certsRenewDisabled'
> & Pick<RuntimeConfig['public'], 'defaultAcmednsUrl' | 'restrictMode'>

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
    const optionalDynamic = /^\[\[(.+)\]\]$/.exec(segment)
    if (optionalDynamic) {
      const param = optionalDynamic[1]!
      routeSegments.push(`:${param}?`)
      nameParts.push(param)
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
    name: 'acmedns-client',
  },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const runtime = resolver.resolve('./runtime')
    const shared = resolver.resolve('./runtime/shared')

    nuxt.options.alias['#shared'] = shared
    nuxt.options.alias['#client'] = runtime

    addServerScanDir(resolver.resolve('./runtime/server'))
    addPlugin(resolver.resolve('./runtime/plugin'))
    addComponentsDir({
      path: resolver.resolve('./runtime/components'),
      // Keep DomainList / BackupList (path prefix) to avoid name clashes.
      pathPrefix: true,
    })
    addImportsDir(resolver.resolve('./runtime/composables'))
    addImportsDir(resolver.resolve('./runtime/utils'))

    const pagesDir = resolver.resolve('./runtime/pages')
    extendPages((pages) => {
      for (const rel of collectVueFiles(pagesDir)) {
        const { name, path } = pageRouteFromFile(rel)
        pages.push({
          name: `acmedns-client-${name}`,
          path,
          file: join(pagesDir, rel),
        })
      }
    })

    const layoutsDir = resolver.resolve('./runtime/layouts')
    nuxt.hook('app:resolve', (app) => {
      for (const rel of collectVueFiles(layoutsDir)) {
        const layoutName = rel.replace(/\.vue$/, '').replace(/\//g, '-')
        app.layouts[layoutName] = {
          file: join(layoutsDir, rel),
          name: layoutName,
        }
      }
    })

    const middlewareDir = resolver.resolve('./runtime/middleware')
    if (existsSync(middlewareDir)) {
      for (const entry of readdirSync(middlewareDir)) {
        if (!entry.endsWith('.ts') && !entry.endsWith('.js')) {
          continue
        }
        const global = entry.includes('.global.')
        const name = entry.replace(/\.global\.(ts|js)$/, '').replace(/\.(ts|js)$/, '')
        addRouteMiddleware({
          name: `acmedns-client-${name}`,
          path: join(middlewareDir, entry),
          global,
        })
      }
    }

    const cssPath = resolver.resolve('./runtime/assets/css/main.css')
    if (existsSync(cssPath)) {
      nuxt.options.css.push(cssPath)
    }
  },
})
