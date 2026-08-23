export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const mode = query.mode === 'staging' ? 'staging' : 'production'
  const entries = await buildCertStatus(mode)
  return { mode, entries }
})
