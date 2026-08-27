export default defineNitroPlugin(async () => {
  await initCertRateLimits()
})
