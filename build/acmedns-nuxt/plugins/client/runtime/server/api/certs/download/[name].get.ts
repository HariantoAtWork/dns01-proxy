function attachmentFilename(filename: string) {
  const safe = filename.replace(/["\\\r\n]/g, '_')
  return `attachment; filename="${safe || 'certificate.zip'}"`
}

export default defineEventHandler(async (event) => {
  const certName = getRouterParam(event, 'name')
  if (!certName) {
    throw createError({ statusCode: 400, statusMessage: 'Missing cert name' })
  }

  const { buffer, filename } = await buildLiveCertZip(certName)

  setHeader(event, 'Content-Type', 'application/zip')
  setHeader(event, 'Content-Disposition', attachmentFilename(filename))
  setHeader(event, 'Cache-Control', 'no-store')

  return buffer
})
