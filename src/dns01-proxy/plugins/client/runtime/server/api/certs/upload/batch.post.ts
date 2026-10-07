import { readMultipartFormData } from 'h3'

function readOverwriteList(parts: Awaited<ReturnType<typeof readMultipartFormData>>) {
  const field = parts?.find(part => part.name === 'overwrite' && part.data?.length)
  if (!field?.data) {
    return []
  }

  try {
    const parsed = JSON.parse(field.data.toString('utf8'))
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'overwrite must be a JSON string array' })
  }
}

export default defineEventHandler(async (event) => {
  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'file' && part.filename)
  if (!file?.data?.length) {
    throw createError({ statusCode: 400, statusMessage: 'ZIP file is required' })
  }

  const result = await importLiveCertsBatchZip(Buffer.from(file.data), {
    overwrite: readOverwriteList(parts),
  })
  if (result.success) {
    await publishCertLiveStatus('production')
  }

  return result
})
