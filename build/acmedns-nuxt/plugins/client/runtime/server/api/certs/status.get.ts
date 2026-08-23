export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const mode = query.mode === 'staging' ? 'staging' : 'production'
  const entries = await buildCertStatus(mode)
  const lastErrors = getLastCertErrors()
  const rateLimits = await getCertRateLimits()
  return {
    mode,
    entries: entries.map((entry) => {
      const lastError = lastErrors[entry.certName]
      const rate = rateLimitForCert(rateLimits, mode, entry.certName)
      return {
        ...entry,
        lastError: lastError?.message,
        rateLimitedUntil: rate?.until,
        rateLimitDetail: rate?.detail,
      }
    }),
  }
})
