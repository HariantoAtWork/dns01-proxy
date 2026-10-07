import type { BackupMutationResult } from '#shared/types/backup'
import type { StorageFileBody } from '#shared/types/clientstorage'

export default defineEventHandler(async (event): Promise<BackupMutationResult> => {
  const body = await readBody<StorageFileBody>(event)

  if (body?.storage === undefined || body?.storage === null) {
    return { success: false, message: 'Storage JSON is required' }
  }

  try {
    const result = await restoreLiveStorage(body.storage, Boolean(body.overwrite))
    return {
      success: result.success,
      message: result.message,
      needsOverwrite: result.needsOverwrite,
    }
  }
  catch (error) {
    return backupFailure(error)
  }
})
