export default defineEventHandler(async (event) => {
  const certName = getRouterParam(event, 'name')
  if (!certName) {
    throw createError({ statusCode: 400, statusMessage: 'Missing cert name' })
  }
  const body = await readBody<{ fromTree?: 'live' | 'staging' }>(event)
  const fromTree = body?.fromTree === 'staging' ? 'staging' : 'live'
  await moveCertToTrash(decodeURIComponent(certName), fromTree)
  return { success: true }
})
