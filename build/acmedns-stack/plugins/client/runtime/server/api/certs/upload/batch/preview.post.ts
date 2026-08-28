import { readMultipartFormData } from 'h3'

export default defineEventHandler(async (event) => {
  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'file' && part.filename)
  if (!file?.data?.length) {
    throw createError({ statusCode: 400, statusMessage: 'ZIP file is required' })
  }

  return previewLiveCertsBatchZip(Buffer.from(file.data))
})
