export default defineEventHandler(async (event) => {
  const certName = getRouterParam(event, 'name')
  if (!certName) {
    throw createError({ statusCode: 400, statusMessage: 'Missing cert name' })
  }
  await permanentDeleteTrash(decodeURIComponent(certName))
  return { success: true }
})
