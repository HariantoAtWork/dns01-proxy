import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  modules: ['@nuxt/fonts'],
  css: ['~/assets/css/main.css'],
  nitro: {
    preset: 'bun',
  },
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
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
    clientstorageData: 'data/clientstorage.json',
    applicationsDataRoot: 'data',
    acmednsUrl: 'http://acmedns-server',
    administratorPassword: '',
    public: {
      defaultAcmednsUrl: 'http://acmedns-server',
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
          content: 'Store acme-dns credentials, print the CNAME, and check it from public resolvers.',
        },
      ],
    },
  },
})
