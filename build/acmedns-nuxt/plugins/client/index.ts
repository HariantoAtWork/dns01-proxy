import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
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

export interface AcmednsClientModuleOptions {
  clientstorageData: string
  applicationsDataRoot: string
  acmednsUrl: string
  administratorPassword: string
  domainsFile: string
  certbotConfigDir: string
  certSettingsFile: string
  letsencryptEmail: string
  renewInterval: number
  certsAcmeEnabled: boolean
  defaultAcmednsUrl: string
  restrictMode: boolean
}

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

export default defineNuxtModule<AcmednsClientModuleOptions>({
  meta: {
    name: 'acmedns-client',
    configKey: 'acmednsClient',
  },
  defaults: {
    clientstorageData: 'config/clientstorage.json',
    applicationsDataRoot: 'data',
    acmednsUrl: 'http://127.0.0.1',
    administratorPassword: '',
    domainsFile: 'config/host/domains.txt',
    certbotConfigDir: '/etc/letsencrypt',
    certSettingsFile: 'config/cert-settings.json',
    letsencryptEmail: 'admin@example.com',
    renewInterval: 12,
    certsAcmeEnabled: true,
    defaultAcmednsUrl: 'http://127.0.0.1',
    restrictMode: false,
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const runtime = resolver.resolve('./runtime')

    nuxt.options.alias['#shared'] = resolver.resolve('./runtime/shared')
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

    nuxt.options.runtimeConfig = nuxt.options.runtimeConfig || {}
    const runtimeConfig = nuxt.options.runtimeConfig as Record<string, unknown>
    const publicConfig = (runtimeConfig.public || {}) as Record<string, unknown>

    runtimeConfig.clientstorageData = options.clientstorageData
    runtimeConfig.applicationsDataRoot = options.applicationsDataRoot
    runtimeConfig.acmednsUrl = options.acmednsUrl
    runtimeConfig.administratorPassword = options.administratorPassword
    runtimeConfig.domainsFile = options.domainsFile
    runtimeConfig.certbotConfigDir = options.certbotConfigDir
    runtimeConfig.certSettingsFile = options.certSettingsFile
    runtimeConfig.letsencryptEmail = options.letsencryptEmail
    runtimeConfig.renewInterval = options.renewInterval
    runtimeConfig.certsAcmeEnabled = options.certsAcmeEnabled
    publicConfig.defaultAcmednsUrl = options.defaultAcmednsUrl
    publicConfig.restrictMode = options.restrictMode
    runtimeConfig.public = publicConfig

    // Keep Vite able to resolve plugin runtime imports during build.
    nuxt.options.vite = nuxt.options.vite || {}
    const vite = nuxt.options.vite as { resolve?: { alias?: Record<string, string> } }
    vite.resolve = vite.resolve || {}
    vite.resolve.alias = {
      ...(vite.resolve.alias || {}),
      '#shared': resolver.resolve('./runtime/shared'),
      '#client': runtime,
    }
  },
})
