function attachmentFilename(filename: string) {
  const safe = filename.replace(/["\\\r\n]/g, '_')
  return `attachment; filename="${safe || 'live-certificates.zip'}"`
}

export default defineEventHandler(async (event) => {
  const { buffer, filename } = await buildLiveCertsBatchZip()

  setHeader(event, 'Content-Type', 'application/zip')
  setHeader(event, 'Content-Disposition', attachmentFilename(filename))
  setHeader(event, 'Cache-Control', 'no-store')

  return buffer
})
