export default defineEventHandler(async (event) => {
  const certName = getRouterParam(event, 'name')
  if (!certName) {
    throw createError({ statusCode: 400, statusMessage: 'Missing cert name' })
  }
  const query = getQuery(event)
  const fromTree = query.fromTree === 'staging' ? 'staging' : 'live'
  await permanentDeleteLastSaved(decodeURIComponent(certName), fromTree)
  return { success: true }
})
