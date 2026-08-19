export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    try {
      const config = useRuntimeConfig(event)
      config.public.restrictMode = isRestrictMode(event)
    }
    catch {
      // Public runtimeConfig may be frozen; /api/auth/session is the source of truth.
    }
  })
})
