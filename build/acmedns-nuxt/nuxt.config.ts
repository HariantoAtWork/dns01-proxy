import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: [
    '@nuxt/fonts',
    './plugins/client',
  ],
  nitro: {
    preset: 'bun',
    entry: './entry.ts',
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
    /** Path to acme-dns config.cfg (TOML). Override with NUXT_ACME_DNS_CONFIG. */
    acmeDnsConfig: '/etc/acme-dns/config.cfg',
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
    public: {
      defaultAcmednsUrl: 'http://127.0.0.1',
      restrictMode: false,
    },
  },
  acmednsClient: {
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
