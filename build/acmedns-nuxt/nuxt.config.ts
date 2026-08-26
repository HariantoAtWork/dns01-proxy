import tailwindcss from '@tailwindcss/vite'

// `nuxt dev` runs Nitro under Node — do not use the Bun.serve entry there.
const isNuxtDev = process.argv.includes('dev')

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
    acmeDnsDefaultConfig: isNuxtDev ? 'seed/config.dev.cfg' : 'seed/config.cfg',
    acmednsUrl: 'http://127.0.0.1',
    administratorPassword: '',
    letsencryptEmail: 'admin@example.com',
    renewInterval: 12,
    certsAcmeEnabled: true,
    public: {
      defaultAcmednsUrl: 'http://127.0.0.1',
      restrictMode: false,
    },
  },
  acmednsClient: {
    dataRoot: '.data',
    letsencryptDir: '.data/letsencrypt',
    acmednsUrl: 'http://127.0.0.1',
    defaultAcmednsUrl: 'http://127.0.0.1',
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
