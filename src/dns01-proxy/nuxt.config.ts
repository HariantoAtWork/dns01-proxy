import tailwindcss from '@tailwindcss/vite'
import { defaultAcmednsUrlForTinyDomain, tinyDomainFromEnv } from './plugins/client/runtime/shared/utils/tinyDomain'
import { envAcmednsUrl, envDefaultAcmednsUrl } from './core/env'

// `nuxt dev` runs Nitro under Node — do not use the Bun.serve entry there.
const isNuxtDev = process.argv.includes('dev')

const tinyDomain = tinyDomainFromEnv()
const acmednsUrlFromTiny = defaultAcmednsUrlForTinyDomain(tinyDomain)

// Prefer ACMEDNS_URL; else APEX → https://auth.<APEX> (or AUTH_DOMAIN).
// ACMEDNS_TINY_DOMAIN fills the URL when unset (https://<tiny-domain>).
// Compose forwards APEX / AUTH_DOMAIN; explicit ACMEDNS_URL overrides.
const acmednsUrl = envAcmednsUrl()
  || acmednsUrlFromTiny
  || 'http://127.0.0.1'
const defaultAcmednsUrl = envDefaultAcmednsUrl()
  || acmednsUrlFromTiny
  || 'http://127.0.0.1'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  typescript: {
    tsConfig: {
      compilerOptions: {
        types: ['bun-types'],
      },
    },
  },
  modules: [
    '@nuxt/fonts',
    './plugins/txt-ttl',
    './plugins/client',
    './plugins/dns01-lab',
    './plugins/proxy',
  ],
  nitro: {
    preset: 'bun',
    // Production / `nuxt build` only — Bun.serve + TLS from config.cfg
    ...(isNuxtDev ? {} : { entry: './entry.ts' }),
  },
  vite: {
    plugins: [tailwindcss()],
  },
  fonts: {
    families: [
      { name: 'Outfit', provider: 'bunny', weights: [400, 500, 600, 700] },
      { name: 'IBM Plex Mono', provider: 'bunny', weights: [400, 500] },
    ],
  },
  runtimeConfig: {
    dataRoot: '.data',
    letsencryptDir: '.data/letsencrypt',
    /** Template copied when live server config is missing. */
    acmeDnsDefaultConfig: isNuxtDev ? 'seed/server/config.dev.cfg.template' : 'seed/server/config.cfg.template',
    acmednsUrl,
    administratorPassword: '',
    letsencryptEmail: 'admin@example.com',
    renewInterval: 12,
    certsAcmeDisabled: false,
    certsRenewDisabled: false,
    public: {
      defaultAcmednsUrl,
      restrictMode: false,
    },
  },
  app: {
    head: {
      title: 'ACME DNS',
      htmlAttrs: { lang: 'en' },
      meta: [
        {
          name: 'description',
          content: 'acme-dns server plus operator UI, clientstorage, and Let\'s Encrypt issuance.',
        },
        { name: 'theme-color', content: '#1a2320' },
      ],
      link: [
        { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
        { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.svg', type: 'image/svg+xml' },
        // iOS home-screen still expects a raster; same mark as the SVG.
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
        { rel: 'mask-icon', href: '/safari-pinned-tab.svg', color: '#c45c12' },
      ],
    },
  },
})
