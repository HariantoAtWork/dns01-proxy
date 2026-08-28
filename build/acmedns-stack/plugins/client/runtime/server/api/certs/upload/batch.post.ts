import { readMultipartFormData } from 'h3'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const overwrite = query.overwrite === '1' || query.overwrite === 'true'

  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'file' && part.filename)
  if (!file?.data?.length) {
    throw createError({ statusCode: 400, statusMessage: 'ZIP file is required' })
  }

  const result = await importLiveCertsBatchZip(Buffer.from(file.data), { overwrite })
  if (result.success) {
    await publishCertLiveStatus('production')
  }

  return result
})
