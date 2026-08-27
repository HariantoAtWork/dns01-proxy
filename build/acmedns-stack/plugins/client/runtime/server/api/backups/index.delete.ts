import type { BackupMutationResult } from '#shared/types/backup'

export default defineEventHandler(async (event): Promise<BackupMutationResult> => {
  const query = getQuery(event)
  const file = typeof query.file === 'string' ? query.file : ''

  if (!file) {
    return { success: false, message: 'Backup filename is required' }
  }

  try {
    await deleteBackup(file, event)
    return { success: true, message: 'Backup file deleted' }
  }
  catch (error) {
    return backupFailure(error)
  }
})
