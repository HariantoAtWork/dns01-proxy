import type { StorageMutationResult, StorageWriteBody } from '#shared/types/clientstorage'

export default defineEventHandler(async (event): Promise<StorageMutationResult> => {
  const body = await readBody<StorageWriteBody>(event)

  if (!body?.domain || !body.data) {
    return { success: false, message: 'Domain and data are required' }
  }

  const data = await readStorage()

  if (data[body.domain] && !body.overwrite) {
    return { success: false, message: 'Domain already exists' }
  }

  data[body.domain] = body.data
  await writeStorage(data)
  return { success: true, message: 'Domain registered successfully' }
})
