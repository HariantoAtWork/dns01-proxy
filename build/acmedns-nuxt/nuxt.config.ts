// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  nitro: {
    preset: 'bun',
  },
  runtimeConfig: {
    /** Path to acme-dns config.cfg (TOML). Override with NUXT_ACME_DNS_CONFIG. */
    acmeDnsConfig: '/etc/acme-dns/config.cfg',
  },
  app: {
    head: {
      title: 'acme-dns',
      htmlAttrs: { lang: 'en' },
    },
  },
})
