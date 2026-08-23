export default defineEventHandler(async (event) => {
  const body = await readBody<{ serverUrl?: string }>(event)
  const serverUrl = body?.serverUrl || resolveAcmeDnsBase()
  return await registerAcmeDnsAccount(serverUrl)
})
