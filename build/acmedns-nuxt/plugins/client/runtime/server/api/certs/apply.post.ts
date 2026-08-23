export default defineEventHandler(async (event) => {
  const body = await readBody<{
    mode?: unknown
    certNames?: string[]
    force?: boolean
  }>(event)

  const mode = body?.mode === 'staging' || body?.mode === 'production'
    ? body.mode
    : (await readCertSettings()).directoryMode

  const job = await startApplyCertificates({
    mode,
    certNames: Array.isArray(body?.certNames) ? body.certNames : undefined,
    force: Boolean(body?.force),
  })

  setResponseStatus(event, 202)
  return { mode, job, queued: true }
})
