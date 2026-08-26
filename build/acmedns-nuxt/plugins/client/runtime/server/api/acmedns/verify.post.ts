export default defineEventHandler(async (event) => {
  const body = await readBody<{ domains?: string[] }>(event).catch(() => ({} as { domains?: string[] }))
  const storage = await readStorage()
  const domains = Array.isArray(body?.domains)
    ? body.domains.filter((domain): domain is string => typeof domain === 'string' && Boolean(domain))
    : undefined

  const results = await verifyAcmeDnsStorageAccounts(storage, domains)
  return { results }
})
