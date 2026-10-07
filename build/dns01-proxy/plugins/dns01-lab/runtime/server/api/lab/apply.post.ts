export default defineEventHandler(async (event) => {
  const body = await readBody<{
    certNames?: string[]
    force?: boolean
  }>(event)

  const job = await startLabJob({
    certNames: Array.isArray(body?.certNames) ? body.certNames : undefined,
    force: Boolean(body?.force),
  })

  setResponseStatus(event, 202)
  return { job, queued: true }
})
