import tailwindcss from '@tailwindcss/vite'
import { defaultAcmednsUrlForTinyDomain, tinyDomainFromEnv } from './plugins/client/runtime/shared/utils/tinyDomain'

// `nuxt dev` runs Nitro under Node — do not use the Bun.serve entry there.
const isNuxtDev = process.argv.includes('dev')

const tinyDomain = tinyDomainFromEnv()
const acmednsUrlFromTiny = defaultAcmednsUrlForTinyDomain(tinyDomain)

// Prefer ACMEDNS_URL so a single .env key drives server + Register form.
// ACMEDNS_TINY_DOMAIN fills the URL when unset (https://<tiny-domain>).
// Docker still needs NUXT_PUBLIC_DEFAULT_ACMEDNS_URL at runtime (see compose).
const acmednsUrl = process.env.NUXT_ACMEDNS_URL
  || process.env.ACMEDNS_URL
  || acmednsUrlFromTiny
  || 'http://127.0.0.1'
const defaultAcmednsUrl = process.env.NUXT_PUBLIC_DEFAULT_ACMEDNS_URL
  || process.env.ACMEDNS_URL
  || acmednsUrlFromTiny
  || 'http://127.0.0.1'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: [
    '@nuxt/fonts',
    './plugins/client',
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
    acmeDnsDefaultConfig: isNuxtDev ? 'seed/server/config.dev.cfg' : 'seed/server/config.cfg',
    acmednsUrl,
    administratorPassword: '',
    letsencryptEmail: 'admin@example.com',
    renewInterval: 12,
    certsAcmeDisabled: false,
    public: {
      defaultAcmednsUrl,
      restrictMode: false,
    },
  },
  acmednsClient: {
    dataRoot: '.data',
    letsencryptDir: '.data/letsencrypt',
    acmednsUrl,
    defaultAcmednsUrl,
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
      ],
    },
  },
})
