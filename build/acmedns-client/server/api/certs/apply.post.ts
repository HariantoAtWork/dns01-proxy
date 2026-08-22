export default defineEventHandler(async (event) => {
  const body = await readBody<{
    mode?: unknown
    certNames?: string[]
    force?: boolean
  }>(event)

  const mode = body?.mode === 'staging' || body?.mode === 'production'
    ? body.mode
    : (await readCertSettings()).directoryMode

  const results = await applyCertificates({
    mode,
    certNames: Array.isArray(body?.certNames) ? body.certNames : undefined,
    force: Boolean(body?.force),
  })

  const failed = results.some(r => !r.ok)
  if (failed) {
    setResponseStatus(event, 207)
  }
  return { mode, results }
})
