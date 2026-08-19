import type { BackupListResponse } from '#shared/types/backup'

export default defineEventHandler(async (event): Promise<BackupListResponse> => {
  const directory = await ensureBackupDir(event)
  const items = await listBackups(event)
  return { directory, storagePath: getStoragePath(), items }
})
