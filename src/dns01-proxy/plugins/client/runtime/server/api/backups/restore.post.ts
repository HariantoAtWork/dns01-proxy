import type { BackupFileBody, BackupMutationResult } from '#shared/types/backup'

export default defineEventHandler(async (event): Promise<BackupMutationResult> => {
  const body = await readBody<BackupFileBody>(event)
  const file = body?.file?.trim()

  if (!file) {
    return { success: false, message: 'Backup filename is required' }
  }

  try {
    const result = await restoreBackup(file, Boolean(body.overwrite), event)
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
